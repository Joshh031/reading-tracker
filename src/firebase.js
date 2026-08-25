import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  doc,
  enableIndexedDbPersistence,
  getDoc,
  getFirestore,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCcEKJOMx5nLuD_ftGLu0NBPJ8yr5FnekI",
  authDomain: "familyhub-d72f8.firebaseapp.com",
  projectId: "familyhub-d72f8",
  storageBucket: "familyhub-d72f8.firebasestorage.app",
  messagingSenderId: "242948947064",
  appId: "1:242948947064:web:fa31a7165c6f2d4f1f818d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

enableIndexedDbPersistence(db).catch(() => {});

let authReady;
export function ensureAuth() {
  if (!authReady) authReady = signInAnonymously(auth).catch(() => null);
  return authReady;
}

const readingRef = doc(db, "readingTracker", "joshh031");
const dailyRef = doc(db, "dailyTracker", "joshh031");

export async function loadCloudState() {
  await ensureAuth();
  const snap = await getDoc(readingRef);
  return snap.exists() ? snap.data() : null;
}

export async function saveCloudState(state) {
  await ensureAuth();
  await setDoc(readingRef, state, { merge: true });
}

export async function syncDailyTracker(date, entry) {
  await ensureAuth();
  const podcastCount = (entry.podcastEntries || []).filter(p => p.podcast).length;
  const podcastPoints = Math.min(3, podcastCount) * 5;
  const geopolPoints = entry.geoRead ? 3 : 0;
  const readingMinutes = Number(entry.readingMinutes || 0);
  const read45Points = readingMinutes >= 90 ? 10 : readingMinutes >= 45 ? 5 : 0;

  await setDoc(dailyRef, {
    entries: {
      [date]: {
        arabic: Boolean(entry.arabicStudied),
        geopol: geopolPoints,
        podcast: podcastPoints,
        read45: read45Points,
      },
    },
  }, { merge: true });
}
