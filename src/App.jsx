import { useState, useEffect } from 'react'
import { ref, onValue, set, get, child } from "firebase/database";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";
import './App.css'

// 1. Deck Generator Logic
const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const ACTION_CARDS = ['Skip', 'Reverse', 'Draw 2'];

function generateDeck() {
  let deck = [];
  COLORS.forEach(color => {
    deck.push({ type: 'Number', color, value: '0', id: `${color}-0-1` });
    for (let i = 1; i <= 9; i++) {
      deck.push({ type: 'Number', color, value: i.toString(), id: `${color}-${i}-1` });
      deck.push({ type: 'Number', color, value: i.toString(), id: `${color}-${i}-2` });
    }
    ACTION_CARDS.forEach(action => {
      deck.push({ type: 'Action', color, value: action, id: `${color}-${action}-1` });
      deck.push({ type: 'Action', color, value: action, id: `${color}-${action}-2` });
    });
  });

  for (let i = 1; i <= 4; i++) {
    deck.push({ type: 'Wild', color: 'Black', value: 'Wild', id: `Wild-${i}` });
    deck.push({ type: 'Wild', color: 'Black', value: 'Draw 4', id: `Wild-Draw4-${i}` });
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const getColorHex = (color) => {
  switch (color) {
    case 'Red': return '#ce2029';
    case 'Blue': return '#0056b3';
    case 'Green': return '#34C759';
    case 'Yellow': return '#ffcc00';
    case 'Black': return '#1d1d1d';
    default: return '#555';
  }
}

const UnoCard = ({ card, onClick }) => {
  if (!card) return null;
  const hexColor = getColorHex(card.color);
  return (
    <div className="uno-card" style={{ '--card-color': hexColor }} onClick={onClick}>
      <div className="card-top-left">{card.value}</div>
      <div className="card-center">
        <div className="card-center-bg">
          <span className="card-center-text">{card.value}</span>
        </div>
      </div>
      <div className="card-bottom-right">{card.value}</div>
    </div>
  );
};

function App() {
  // Local Identifiers
  const [localPlayer, setLocalPlayer] = useState({ id: '', name: '' });
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [pendingCard, setPendingCard] = useState(null);
  const [publicRooms, setPublicRooms] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        let savedName = '';
        const saved = localStorage.getItem('uno_player');
        if (saved) {
          try { savedName = JSON.parse(saved).name; } catch (e) { }
        }
        setLocalPlayer({ id: user.uid, name: savedName });
        setIsAuthReady(true);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync public rooms
  useEffect(() => {
    if (!isAuthReady) return;
    const gamesRef = ref(db, 'games');
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rooms = Object.keys(data)
          .map(id => ({ id, ...data[id] }))
          .filter(room => !room.gameStarted && room.players?.length > 0 && room.players?.length < 10)
          .slice(0, 5); // Show top 5
        setPublicRooms(rooms);
      } else {
        setPublicRooms([]);
      }
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  // Sync with Firebase
  useEffect(() => {
    if (!roomId) return;
    const gameRef = ref(db, `games/${roomId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data);
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  const savePlayerName = (name) => {
    const p = { ...localPlayer, name };
    setLocalPlayer(p);
    localStorage.setItem('uno_player', JSON.stringify(p));
  };

  const createRoom = async () => {
    if (!localPlayer.name) return alert("Please enter your name");
    savePlayerName(localPlayer.name);

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();

    const initialState = {
      gameStarted: false,
      deck: [],
      discardPile: [],
      players: [{ ...localPlayer, hand: [] }],
      currentPlayerIndex: 0,
      direction: 1,
      hostId: localPlayer.id
    };

    await set(ref(db, `games/${code}`), initialState);
    setRoomId(code);
  };

  const joinSpecificRoom = async (code) => {
    if (!localPlayer.name) return alert("Please enter your name");
    savePlayerName(localPlayer.name);

    const gameSnap = await get(child(ref(db), `games/${code}`));
    if (!gameSnap.exists()) return alert("Room not found!");

    let game = gameSnap.val();
    if (game.gameStarted) return alert("Game already started!");

    if (!game.players) game.players = [];
    if (!game.players.find(p => p.id === localPlayer.id)) {
      if (game.players.length >= 10) return alert("Room is full!");
      game.players.push({ ...localPlayer, hand: [] });
      await set(ref(db, `games/${code}/players`), game.players);
    }
    setRoomId(code);
  };

  const joinRoom = async () => {
    if (!inputRoomId) return alert("Please enter a room code");
    joinSpecificRoom(inputRoomId.toUpperCase());
  };

  const startGame = async () => {
    if (!gameState || gameState.hostId !== localPlayer.id) return;

    const newDeck = generateDeck();
    let players = [...gameState.players];
    players = players.map(p => {
      const hand = newDeck.splice(0, 7);
      return { ...p, hand };
    });

    let firstCardIndex = newDeck.findIndex(c => c.color !== 'Black');
    if (firstCardIndex === -1) firstCardIndex = 0;
    const firstDiscardArray = newDeck.splice(firstCardIndex, 1);

    const updates = {
      gameStarted: true,
      deck: newDeck,
      discardPile: firstDiscardArray,
      players: players,
      currentPlayerIndex: 0,
      direction: 1
    };

    await set(ref(db, `games/${roomId}`), { ...gameState, ...updates });
  };

  const playCard = async (card) => {
    if (!gameState || !gameState.gameStarted) return;
    const myIndex = gameState.players.findIndex(p => p.id === localPlayer.id);
    if (gameState.currentPlayerIndex !== myIndex) return alert("It's not your turn!");

    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    if (card.color !== 'Black' && card.color !== topCard.color && card.value !== topCard.value) {
      return alert("You can't play that card!");
    }

    if (card.color === 'Black') {
      setPendingCard(card);
      return;
    }

    executePlayCard(card, card.color, gameState);
  };

  const handleColorSelect = (color) => {
    if (!pendingCard) return;
    executePlayCard(pendingCard, color, gameState);
    setPendingCard(null);
  };

  const executePlayCard = async (card, chosenColor, currentState) => {
    // Clone state
    let { deck, discardPile, players, currentPlayerIndex, direction } = JSON.parse(JSON.stringify(currentState));
    if (!deck) deck = [];

    let playedCard = { ...card, color: chosenColor };
    discardPile.push(playedCard);

    const myIndex = players.findIndex(p => p.id === localPlayer.id);
    players[myIndex].hand = players[myIndex].hand.filter(c => c.id !== card.id);

    let skipNext = false;
    let newDir = direction;

    if (card.value === 'Skip') {
      skipNext = true;
    } else if (card.value === 'Reverse') {
      if (players.length <= 2) skipNext = true; // For 2 players, reverse acts as a skip
      else newDir = direction * -1;
    } else if (card.value === 'Draw 2' || card.value === 'Draw 4') {
      const drawCount = card.value === 'Draw 2' ? 2 : 4;
      let targetIdx = (currentPlayerIndex + newDir + players.length) % players.length;

      for (let i = 0; i < drawCount; i++) {
        if (deck.length === 0) {
          if (discardPile.length <= 1) break;
          const top = discardPile.pop();
          deck = discardPile;
          for (let j = deck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [deck[j], deck[k]] = [deck[k], deck[j]];
          }
          discardPile = [top];
        }
        const drawn = deck.pop();
        if (drawn) {
          if (!players[targetIdx].hand) players[targetIdx].hand = [];
          players[targetIdx].hand.push(drawn);
        }
      }
      skipNext = true;
    }

    const turnAdvancement = skipNext ? newDir * 2 : newDir;
    // adding multiple times of players.length just in case turnAdvancement is negative
    const nextIndex = (currentPlayerIndex + turnAdvancement + players.length * 2) % players.length;

    await set(ref(db, `games/${roomId}`), {
      ...currentState,
      deck,
      discardPile,
      players,
      currentPlayerIndex: nextIndex,
      direction: newDir
    });

    if (players[myIndex].hand.length === 0) {
      setTimeout(() => alert(`You win!`), 300);
    }
  };

  const drawCard = async () => {
    if (!gameState || !gameState.gameStarted) return;
    const myIndex = gameState.players.findIndex(p => p.id === localPlayer.id);
    if (gameState.currentPlayerIndex !== myIndex) return;

    let { deck, discardPile, players, currentPlayerIndex, direction } = JSON.parse(JSON.stringify(gameState));
    if (!deck) deck = [];

    if (deck.length === 0) {
      if (discardPile.length > 1) {
        const top = discardPile.pop();
        deck = discardPile;
        for (let j = deck.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [deck[j], deck[k]] = [deck[k], deck[j]];
        }
        discardPile = [top];
      }
    }

    const drawn = deck.pop();
    if (drawn) {
      if (!players[myIndex].hand) players[myIndex].hand = [];
      players[myIndex].hand.push(drawn);
    }

    const nextIndex = (currentPlayerIndex + direction + players.length) % players.length;

    await set(ref(db, `games/${roomId}`), {
      ...gameState,
      deck,
      discardPile,
      players,
      currentPlayerIndex: nextIndex
    });
  };

  // Views
  if (!isAuthReady) {
    return (
      <div className="card-table-container">
        <div className="lobby-box">
          <h2>Connecting to Secure Server...</h2>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="card-table-container">
        <div className="lobby-box">
          <h1 className="uno-logo-text">UNO</h1>
          <h2 className="lobby-subtitle">Online Multiplayer</h2>

          <div className="input-group">
            <label>Your Name:</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={localPlayer.name}
              onChange={e => setLocalPlayer({ ...localPlayer, name: e.target.value })}
              className="lobby-input"
            />
          </div>

          <div className="lobby-actions">
            <button className="start-btn" onClick={createRoom}>Create New Room</button>
            <div className="divider"><span>OR</span></div>
            <div className="input-group">
              <label>Room Code:</label>
              <div className="join-row">
                <input
                  type="text"
                  placeholder="ABCD"
                  value={inputRoomId}
                  onChange={e => setInputRoomId(e.target.value)}
                  className="lobby-input code-input"
                  maxLength={4}
                />
                <button className="start-btn secondary-btn" onClick={joinRoom}>Join</button>
              </div>
            </div>
          </div>

          {publicRooms.length > 0 && (
            <div className="public-rooms">
              <h4>Active Lobbies</h4>
              <div className="rooms-list">
                {publicRooms.map(room => (
                  <div key={room.id} className="room-item">
                    <span>{room.players[0].name}'s Room ({room.players.length}/10)</span>
                    <button onClick={() => joinSpecificRoom(room.id)}>Join</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="card-table-container">
        <h2>Connecting to room...</h2>
      </div>
    );
  }

  if (!gameState.gameStarted) {
    const isHost = gameState.hostId === localPlayer.id;
    return (
      <div className="card-table-container">
        <div className="lobby-box waiting-room">
          <h2>Room Code: <span className="highlight-code">{roomId}</span></h2>
          <p className="room-desc">Share this code with up to 9 friends.</p>

          <div className="players-list">
            <h3>Players ({gameState.players ? gameState.players.length : 0}/10)</h3>
            <ul>
              {gameState.players?.map(p => (
                <li key={p.id}>
                  {p.name} {p.id === gameState.hostId && <span className="host-badge">(Host)</span>} {p.id === localPlayer.id && "(You)"}
                </li>
              ))}
            </ul>
          </div>

          <div className="waiting-actions">
            {isHost ? (
              <button className="start-btn match-btn" onClick={startGame}>Start Game</button>
            ) : (
              <p className="waiting-text">Waiting for host to start the game...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Game Board Active
  const myPlayerIndex = gameState.players.findIndex(p => p.id === localPlayer.id);
  const myPlayer = myPlayerIndex >= 0 ? gameState.players[myPlayerIndex] : null;

  return (
    <div className="card-table-container">
      <div className="game-board">

        {/* Top: Opponent(s) */}
        <div className="opponents-roster">
          {gameState.players.map((player, idx) => {
            if (player.id === localPlayer.id) return null;
            const isTurn = gameState.currentPlayerIndex === idx;
            const handCount = player.hand ? player.hand.length : 0;
            return (
              <div key={player.id} className={`opponent-badge ${isTurn ? 'active-opponent' : ''}`}>
                {player.name}: {handCount} Cards
              </div>
            );
          })}
        </div>

        {/* Center: Table */}
        <div className="table-center">
          <div className="card-deck" title="Draw Deck" onClick={drawCard}>
            <div className="card-logo">UNO</div>
            <span className="deck-count">{gameState.deck ? gameState.deck.length : 0}</span>
          </div>

          <div className="discard-pile" title="Discard Pile">
            {gameState.discardPile && gameState.discardPile.length > 0 &&
              <UnoCard card={gameState.discardPile[gameState.discardPile.length - 1]} />
            }
          </div>
        </div>

        {/* Bottom: Local Player */}
        {myPlayer && (
          <div className={`player-area bottom-player ${gameState.currentPlayerIndex === myPlayerIndex ? 'active-turn' : 'waiting'}`}>
            <h3 className={gameState.currentPlayerIndex === myPlayerIndex ? 'active-player' : ''}>{myPlayer.name} (You)</h3>
            <div className="hand fan-hand">
              {myPlayer.hand?.map(card => <UnoCard key={card.id} card={card} onClick={() => playCard(card)} />)}
            </div>
          </div>
        )}

        {/* Penalty / Color Picker Modal */}
        {pendingCard && (
          <div className="color-picker-overlay">
            <div className="color-picker-modal">
              <h2>Choose a color for {pendingCard.value}</h2>
              <div className="color-options">
                <button className="color-btn Red" onClick={() => handleColorSelect('Red')}></button>
                <button className="color-btn Blue" onClick={() => handleColorSelect('Blue')}></button>
                <button className="color-btn Green" onClick={() => handleColorSelect('Green')}></button>
                <button className="color-btn Yellow" onClick={() => handleColorSelect('Yellow')}></button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default App
