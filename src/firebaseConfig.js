import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
export const firebaseConfig = {
  apiKey: "AIzaSyCcEKJOMx5nLuD_ftGLu0NBPJ8yr5FnekI",
  authDomain: "familyhub-d72f8.firebaseapp.com",
  projectId: "familyhub-d72f8",
  storageBucket: "familyhub-d72f8.firebasestorage.app",
  messagingSenderId: "242948947064",
  appId: "1:242948947064:web:fa31a7165c6f2d4f1f818d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

