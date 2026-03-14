
import { useState } from 'react'
import './App.css'

// 1. Deck Generator Logic
const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const ACTION_CARDS = ['Skip', 'Reverse', 'Draw 2'];

function generateDeck() {
  let deck = [];

  // Generate numbered cards and action cards for each color
  COLORS.forEach(color => {
    // One '0' card per color
    deck.push({ type: 'Number', color, value: '0', id: `${color}-0-1` });

    // Two of each number '1-9' per color
    for (let i = 1; i <= 9; i++) {
      deck.push({ type: 'Number', color, value: i.toString(), id: `${color}-${i}-1` });
      deck.push({ type: 'Number', color, value: i.toString(), id: `${color}-${i}-2` });
    }

    // Two of each Action card per color
    ACTION_CARDS.forEach(action => {
      deck.push({ type: 'Action', color, value: action, id: `${color}-${action}-1` });
      deck.push({ type: 'Action', color, value: action, id: `${color}-${action}-2` });
    });
  });

  // 4 Wild cards and 4 Wild Draw 4 cards
  for (let i = 1; i <= 4; i++) {
    deck.push({ type: 'Wild', color: 'Black', value: 'Wild', id: `Wild-${i}` });
    deck.push({ type: 'Wild', color: 'Black', value: 'Draw 4', id: `Wild-Draw4-${i}` });
  }

  // Shuffle the deck (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Helper to get CSS color
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

// Card Component
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
  // 2. The Game State
  const [deck, setDeck] = useState([]);
  const [discardPile, setDiscardPile] = useState([]);
  const [players, setPlayers] = useState([
    { id: 1, name: 'Alice', hand: [] },
    { id: 2, name: 'Bob', hand: [] },
    { id: 3, name: 'Charlie', hand: [] },
    { id: 4, name: 'Diana', hand: [] }
  ]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [pendingCard, setPendingCard] = useState(null);

  // Simulates which player's browser this is (1 or 2)
  const [localPlayerId, setLocalPlayerId] = useState(1);

  // 3. The 'Deal' Function
  const startGame = () => {
    // Generate new shuffled deck
    const newDeck = generateDeck();

    // Pop cards for players dynamically based on roster size
    const newPlayers = players.map(p => {
      const hand = newDeck.splice(0, 7);
      return { ...p, hand };
    });

    // Set 1st discard card (Ensure it's not a Wild to keep the start simple)
    let firstCardIndex = newDeck.findIndex(c => c.color !== 'Black');
    if (firstCardIndex === -1) firstCardIndex = 0; // Fallback
    const firstDiscardArray = newDeck.splice(firstCardIndex, 1);

    setPlayers(newPlayers);
    setDiscardPile(firstDiscardArray);
    setDeck(newDeck);
    setGameStarted(true);
    setCurrentPlayerIndex(0);
    setDirection(1);
    setPendingCard(null);
  };

  const playCard = (card, playerIndex) => {
    if (playerIndex !== currentPlayerIndex) return;
    const topCard = discardPile[discardPile.length - 1];

    if (card.color !== 'Black' && card.color !== topCard.color && card.value !== topCard.value) {
      return;
    }

    if (card.color === 'Black') {
      setPendingCard({ card, playerIndex });
      return;
    }

    executePlayCard(card, playerIndex, card.color);
  };

  const handleColorSelect = (color) => {
    if (!pendingCard) return;
    executePlayCard(pendingCard.card, pendingCard.playerIndex, color);
    setPendingCard(null);
  };

  const executePlayCard = (card, playerIndex, chosenColor) => {
    let currentDeck = [...deck];
    let playedCard = { ...card, color: chosenColor }; // Map Black to new color for discard checks
    let newDiscard = [...discardPile, playedCard];
    let newPlayers = players.map(p => ({ ...p, hand: [...p.hand] }));

    newPlayers[playerIndex].hand = newPlayers[playerIndex].hand.filter(c => c.id !== card.id);

    let newDir = direction;
    let skipNext = false;

    if (card.value === 'Skip') {
      skipNext = true;
    } else if (card.value === 'Reverse') {
      if (players.length === 2) skipNext = true;
      else newDir = direction * -1;
    } else if (card.value === 'Draw 2' || card.value === 'Draw 4') {
      const drawCount = card.value === 'Draw 2' ? 2 : 4;
      let targetIdx = (currentPlayerIndex + newDir + players.length) % players.length;

      for (let i = 0; i < drawCount; i++) {
        if (currentDeck.length === 0) {
          if (newDiscard.length <= 1) break;
          const top = newDiscard.pop();
          currentDeck = newDiscard;
          for (let j = currentDeck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [currentDeck[j], currentDeck[k]] = [currentDeck[k], currentDeck[j]];
          }
          newDiscard = [top];
        }
        const drawn = currentDeck.pop();
        if (drawn) newPlayers[targetIdx].hand.push(drawn);
      }
      skipNext = true;
    }

    setDeck(currentDeck);
    setDiscardPile(newDiscard);
    setPlayers(newPlayers);
    setDirection(newDir);

    const turnAdvancement = skipNext ? newDir * 2 : newDir;
    const nextIndex = (currentPlayerIndex + turnAdvancement + players.length) % players.length;
    setCurrentPlayerIndex(nextIndex);
  };

  const drawCard = () => {
    let currentDeck = [...deck];
    let newDiscard = [...discardPile];
    let newPlayers = players.map(p => ({ ...p, hand: [...p.hand] }));

    if (currentDeck.length === 0) {
      if (newDiscard.length > 1) {
        const top = newDiscard.pop();
        currentDeck = newDiscard;
        for (let j = currentDeck.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [currentDeck[j], currentDeck[k]] = [currentDeck[k], currentDeck[j]];
        }
        newDiscard = [top];
      }
    }

    const drawn = currentDeck.pop();
    if (drawn) newPlayers[currentPlayerIndex].hand.push(drawn);

    setDeck(currentDeck);
    setDiscardPile(newDiscard);
    setPlayers(newPlayers);

    const nextIndex = (currentPlayerIndex + direction + players.length) % players.length;
    setCurrentPlayerIndex(nextIndex);
  };

  return (
    <div className="card-table-container">
      {!gameStarted ? (
        <div className="table-header">
          <h1>UNO Online</h1>
          <button className="start-btn" onClick={startGame}>Start Game</button>
        </div>
      ) : (
        <div className="game-board">

          {/* Opponent(s) (Top) */}
          <div className="opponents-roster">
            {players.map((player, idx) => {
              if (player.id === localPlayerId) return null;
              const isTurn = currentPlayerIndex === idx;
              return (
                <div key={player.id} className={`opponent-badge ${isTurn ? 'active-opponent' : ''}`}>
                  {player.name}: {player.hand.length} Cards
                </div>
              );
            })}
          </div>

          {/* Center Table */}
          <div className="table-center">
            <div className="card-deck" title="Draw Deck" onClick={drawCard}>
              <div className="card-logo">UNO</div>
              <span className="deck-count">{deck.length}</span>
            </div>

            <div className="discard-pile" title="Discard Pile">
              {discardPile.length > 0 && <UnoCard card={discardPile[discardPile.length - 1]} />}
            </div>
          </div>

          {/* Local Player (Bottom) */}
          {players.map((player, idx) => {
            if (player.id !== localPlayerId) return null;
            const isTurn = currentPlayerIndex === idx;
            return (
              <div key={player.id} className={`player-area bottom-player ${isTurn ? 'active-turn' : 'waiting'}`}>
                <h3 className={isTurn ? 'active-player' : ''}>{player.name}</h3>
                <div className="hand fan-hand">
                  {player.hand.map(card => <UnoCard key={card.id} card={card} onClick={() => playCard(card, idx)} />)}
                </div>
              </div>
            );
          })}

          {/* Color Picker Modal */}
          {pendingCard && (
            <div className="color-picker-overlay">
              <div className="color-picker-modal">
                <h2>Choose a color for {pendingCard.card.value}</h2>
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
      )}
    </div>
  )
}

export default App
