import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: "unogame-5c228.firebaseapp.com",
    databaseURL: "https://unogame-5c228-default-rtdb.firebaseio.com",
    projectId: "unogame-5c228",
    storageBucket: "unogame-5c228.firebasestorage.app",
    messagingSenderId: "611266446946",
    appId: "1:611266446946:web:1ec8d62d723b7e79e5333b",
    measurementId: "G-0S4KRQ5GM5"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
