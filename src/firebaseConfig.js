import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
const defaults = {
  apiKey: "AIzaSyCcEKJOMx5nLuD_ftGLu0NBPJ8yr5FnekI",
  authDomain: "familyhub-d72f8.firebaseapp.com",
  projectId: "familyhub-d72f8",
  storageBucket: "familyhub-d72f8.firebasestorage.app",
  messagingSenderId: "242948947064",
  appId: "1:242948947064:web:fa31a7165c6f2d4f1f818d",
};

// Firebase web configuration is public; administrative credentials stay server-only.
export const firebaseConfig = Object.fromEntries(
  Object.entries(defaults).map(([key, value]) => [
    key,
    import.meta.env[
      "VITE_FIREBASE_" + key.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()
    ] || value,
  ]),
);
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
