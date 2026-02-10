import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA_FVskMh2amViu_Kp4eZ9mF7P2D7llECQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mojeodpoved.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mojeodpoved",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mojeodpoved.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "181568006316",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:181568006316:web:625c56b2f4640d8d3d1709"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
