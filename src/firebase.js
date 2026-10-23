import { signInAnonymously } from "firebase/auth";
import {
  doc,
  enableIndexedDbPersistence,
  getDoc,
  getFirestore,
  setDoc,
} from "firebase/firestore";

import { app,auth } from "./firebaseConfig.js";
export {auth} from "./firebaseConfig.js";
const db = getFirestore(app);

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
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveCloudState(state) {
  if (import.meta.env.VITE_KV_LEGACY_WRITES !== "true") throw new Error("Legacy preview is read-only. Production data was not changed.");
  await ensureAuth();
  await setDoc(readingRef, state, { merge: true });
}

export async function syncDailyTracker(date, entry) {
  if (import.meta.env.VITE_KV_LEGACY_WRITES !== "true") return;
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
