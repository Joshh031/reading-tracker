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

const SARAH_GUO_EPISODE_ID = "1000787138184";
const SARAH_GUO_INSIGHTS = [
  "Guo's strategic view is that AI is unlikely to become a winner-take-all market owned by a single model lab. If frontier capability diffuses across closed and open models, value can remain distributed across infrastructure, models, applications, and domain-specific products rather than accruing entirely to one foundation-model vendor. For a portfolio manager, that argues for underwriting where durable bargaining power sits in each layer instead of treating the AI trade as a single-company monopoly thesis.",
  "One of the more interesting investing observations is how small the true frontier AI talent network remains. A relatively concentrated group of researchers and founders still drives a disproportionate share of technical progress, which makes access, reputation, and proximity to that community an informational advantage for early-stage investors. The PM analogue is that talent flows and researcher networks may be leading indicators of where the next important technical inflection is forming before revenue data makes it obvious.",
  "Guo treats compute and power as increasingly important constraints on AI progress, not just background infrastructure. As training and inference scale, access to GPUs, data-center capacity, power, cooling, and capital becomes part of the competitive equation alongside algorithmic quality. For public markets, the key question is which bottlenecks can sustain economic rents versus which will eventually be competed away as capacity comes online.",
  "Open-source AI is an important counterweight to closed frontier labs because it can compress model-level pricing power while accelerating experimentation and adoption at the application layer. That creates a two-sided investment effect: some foundation-model rents may be less durable than expected, while infrastructure, security, tooling, and vertical applications may benefit from a much larger pool of capable models.",
  "The next major leg of AI may move beyond chat interfaces into robotics and scientific discovery. Once AI enters the physical world or laboratory workflow, the relevant bottlenecks broaden to sensors, hardware reliability, energy, data collection, lab automation, and real-world deployment. For a portfolio manager, that suggests the next wave of beneficiaries may look more industrial and infrastructure-heavy than the first software-centric AI cycle."
];

function appleEpisodeId(url = "") {
  try { return new URL(url).searchParams.get("i") || ""; } catch { return ""; }
}

function isLegacyBoilerplate(text = "") {
  return /publisher's official episode description rather than a verified transcript|treated as a discussion theme rather than a verbatim guest conclusion|use the theme as a prompt for follow-up/i.test(String(text));
}

function normalizePodcastRecord(p = {}) {
  const episodeId = appleEpisodeId(p.url || "");
  if (episodeId === SARAH_GUO_EPISODE_ID) {
    return {
      ...p,
      guest: "Sarah Guo",
      guestRole: p.guestRole || "Founder and managing partner of Conviction",
      investorInsights: SARAH_GUO_INSIGHTS,
      oneLine: "Guo's strategic view is that AI is unlikely to become a winner-take-all market owned by a single model lab.",
      summaryBasis: "Official publisher show notes",
      insightSource: "OFFICIAL SHOW NOTES · NOT TRANSCRIPT",
      transcriptFound: false,
      insightsAvailable: true,
    };
  }

  if (Array.isArray(p.investorInsights) && p.investorInsights.some(isLegacyBoilerplate)) {
    const clean = p.investorInsights.filter(x => !isLegacyBoilerplate(x));
    return {
      ...p,
      investorInsights: clean,
      oneLine: clean[0]?.split(/(?<=[.!?])\s+/)[0] || p.oneLine || "",
    };
  }
  return p;
}

function normalizeReadingState(state) {
  if (!state?.entries) return { state, changed: false };
  let changed = false;
  const entries = {};
  for (const [date, day] of Object.entries(state.entries)) {
    const podcasts = Array.isArray(day?.podcastEntries) ? day.podcastEntries : [];
    const nextPodcasts = podcasts.map(p => {
      const next = normalizePodcastRecord(p);
      if (JSON.stringify(next) !== JSON.stringify(p)) changed = true;
      return next;
    });
    entries[date] = { ...day, podcastEntries: nextPodcasts };
  }
  return { state: { ...state, entries }, changed };
}

export async function loadCloudState() {
  await ensureAuth();
  const snap = await getDoc(readingRef);
  if (!snap.exists()) return null;
  const normalized = normalizeReadingState(snap.data());
  if (normalized.changed) {
    await setDoc(readingRef, { entries: normalized.state.entries }, { merge: true }).catch(() => {});
  }
  return normalized.state;
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
