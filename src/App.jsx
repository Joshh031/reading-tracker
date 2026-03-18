import { useState, useEffect, useCallback, useRef } from "react";

const GENRES = [
  "Biography", "Business", "Economics", "Finance", "History",
  "Investing", "Leadership", "Memoir", "Philosophy", "Politics",
  "Psychology", "Science", "Self-Help", "Technology", "Other",
];

const STORAGE_KEYS = {
  currentBooks: "rt_current_books",
  podcasts: "rt_podcasts",
  entries: "rt_entries",
  library: "rt_library",
};

const DEFAULT_PODCASTS = [
  "Acquired",
  "All-In Podcast",
  "Big Technology Podcast",
  "a16z Podcast",
  "Capital Allocators",
  "Cheeky Pint",
  "Daur Kesha",
  "Excess Returns",
  "Foreign Affairs",
  "Founders",
  "Goldman Sachs Exchanges",
  "Hidden Brain",
  "Huberman Lab",
  "Invest with the Best",
  "Lex Fridman Podcast",
  "Masters of Business",
  "Odd Lots",
  "Planet Money",
  "The Tim Ferriss Show",
];

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

async function storage_get(key) {
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    } else {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    }
  } catch { return null; }
}

async function storage_set(key, value) {
  try {
    if (window.storage) {
      await window.storage.set(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

export default function ReadingTracker() {
  const [view, setView] = useState("today"); // today | history | search | settings
  const [currentBooks, setCurrentBooks] = useState({ physical: "", audible: "" });
  const [podcasts, setPodcasts] = useState(DEFAULT_PODCASTS);
  const [entries, setEntries] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [newPodcast, setNewPodcast] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [exportCode, setExportCode] = useState("");
  const [editBooks, setEditBooks] = useState(false);
  const [library, setLibrary] = useState([]);
  const [showAddBook, setShowAddBook] = useState(false);
  const [bookForm, setBookForm] = useState({ title: "", author: "", format: "Physical", genre: "", dateFinished: getTodayKey(), rating: 0, review: "" });
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState("date"); // date | title | rating
  const [libraryFilter, setLibraryFilter] = useState("All");

  // Today's entry state
  const today = getTodayKey();
  const defaultEntry = {
    podcastEntries: [{ podcast: "", guest: "", takeaway1: "", takeaway2: "" }],
    arabicStudied: false,
    geoRead: false,
    geoSubject: "",
    geoTakeaway: "",
  };

  // Migrate old single-podcast format
  const rawEntry = entries[today];
  const todayEntry = rawEntry
    ? rawEntry.podcastEntries
      ? rawEntry
      : { ...defaultEntry, podcastEntries: [{ podcast: rawEntry.podcast || "", guest: "", takeaway1: rawEntry.takeaway1 || "", takeaway2: rawEntry.takeaway2 || "" }], arabicStudied: rawEntry.arabicStudied, geoRead: rawEntry.geoRead, geoSubject: rawEntry.geoSubject, geoTakeaway: rawEntry.geoTakeaway }
    : defaultEntry;

  useEffect(() => {
    (async () => {
      const books = await storage_get(STORAGE_KEYS.currentBooks);
      const pods = await storage_get(STORAGE_KEYS.podcasts);
      const ents = await storage_get(STORAGE_KEYS.entries);
      const lib = await storage_get(STORAGE_KEYS.library);
      if (lib) setLibrary(lib);
      if (books) setCurrentBooks(books);
      if (pods) setPodcasts(pods);
      if (ents) setEntries(ents);
      setLoaded(true);
    })();
  }, []);

  const entriesRef = useRef(entries);
  const todayEntryRef = useRef(todayEntry);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { todayEntryRef.current = todayEntry; }, [todayEntry]);

  const saveEntry = useCallback(async (update) => {
    const currentEntries = entriesRef.current;
    const currentTodayEntry = todayEntryRef.current;
    const newEntries = { ...currentEntries, [today]: { ...currentTodayEntry, ...update } };
    setEntries(newEntries);
    await storage_set(STORAGE_KEYS.entries, newEntries);
  }, [today]);

  const saveBooks = async (books) => {
    setCurrentBooks(books);
    await storage_set(STORAGE_KEYS.currentBooks, books);
  };

  const savePodcasts = async (pods) => {
    setPodcasts(pods);
    await storage_set(STORAGE_KEYS.podcasts, pods);
  };

  const saveLibrary = async (lib) => {
    setLibrary(lib);
    await storage_set(STORAGE_KEYS.library, lib);
  };

  const addBookToLibrary = async () => {
    if (!bookForm || !bookForm.title || !bookForm.title.trim()) return;
    const newBook = { ...bookForm, id: String(Date.now()) };
    const updated = [newBook, ...(Array.isArray(library) ? library : [])];
    await saveLibrary(updated);
    setBookForm({ title: "", author: "", format: "Physical", genre: "", dateFinished: getTodayKey(), rating: 0, review: "" });
    setShowAddBook(false);
  };

  const deleteBook = async (id) => {
    await saveLibrary((Array.isArray(library) ? library : []).filter(b => b && b.id !== id));
  };

  // Analytics
  const allDates = Object.keys(entries).sort();
  const completedDays = allDates.filter(d => {
    const e = entries[d];
    if (!e) return false;
    const pods = e.podcastEntries || (e.podcast ? [{ podcast: e.podcast, takeaway1: e.takeaway1, takeaway2: e.takeaway2 }] : []);
    return pods.some(p => p.podcast && p.takeaway1 && p.takeaway2);
  });

  // Streak
  let streak = 0;
  const sortedComplete = [...completedDays].sort().reverse();
  if (sortedComplete.length) {
    let check = new Date();
    check.setHours(0,0,0,0);
    for (const d of sortedComplete) {
      const [y,m,day] = d.split("-").map(Number);
      const entDate = new Date(y, m-1, day);
      const diff = Math.round((check - entDate) / 86400000);
      if (diff <= 1) { streak++; check = entDate; }
      else break;
    }
  }

  // Completion rates
  const totalDays = allDates.length;
  const arabicDays = allDates.filter(d => entries[d].arabicStudied).length;
  const geoDays = allDates.filter(d => entries[d].geoRead).length;
  const podcastDays = allDates.filter(d => {
    const e = entries[d];
    const pods = e.podcastEntries || (e.podcast ? [{ podcast: e.podcast }] : []);
    return pods.some(p => p.podcast);
  }).length;

  // Export all data as base64 code
  const handleExport = () => {
    const data = {};
    Object.values(STORAGE_KEYS).forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch { data[k] = null; }
    });
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    setExportCode(code);
  };

  // Import data from base64 code
  const handleImport = async () => {
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(importCode.trim()))));
      if (decoded[STORAGE_KEYS.entries]) { setEntries(decoded[STORAGE_KEYS.entries]); await storage_set(STORAGE_KEYS.entries, decoded[STORAGE_KEYS.entries]); }
      if (decoded[STORAGE_KEYS.currentBooks]) { setCurrentBooks(decoded[STORAGE_KEYS.currentBooks]); await storage_set(STORAGE_KEYS.currentBooks, decoded[STORAGE_KEYS.currentBooks]); }
      if (decoded[STORAGE_KEYS.podcasts]) { setPodcasts(decoded[STORAGE_KEYS.podcasts]); await storage_set(STORAGE_KEYS.podcasts, decoded[STORAGE_KEYS.podcasts]); }
      if (decoded[STORAGE_KEYS.library]) { setLibrary(decoded[STORAGE_KEYS.library]); await storage_set(STORAGE_KEYS.library, decoded[STORAGE_KEYS.library]); }
      setImportMsg("✓ DATA IMPORTED SUCCESSFULLY — ALL YOUR ENTRIES ARE RESTORED");
      setImportCode("");
    } catch(e) {
      setImportMsg("✗ INVALID CODE — PLEASE TRY AGAIN");
    }
  };

  // Library filtered list
  const filteredLibrary = Array.isArray(library) ? library
    .filter(b => b && (libraryFilter === "All" || b.format === libraryFilter || b.genre === libraryFilter))
    .filter(b => {
      if (!librarySearch || !librarySearch.trim()) return true;
      const q = librarySearch.toLowerCase();
      return (b.title || "").toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q) || (b.review || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (librarySort === "date") return (b.dateFinished || "") > (a.dateFinished || "") ? 1 : -1;
      if (librarySort === "title") return (a.title || "").localeCompare(b.title || "");
      if (librarySort === "rating") return (b.rating || 0) - (a.rating || 0);
      return 0;
    }) : [];

  // Search
  const searchResults = searchQuery.length > 1
    ? allDates.flatMap(d => {
        const e = entries[d];
        const hits = [];
        const q = searchQuery.toLowerCase();
        const pods = e.podcastEntries || (e.podcast ? [{ podcast: e.podcast, guest: "", takeaway1: e.takeaway1, takeaway2: e.takeaway2 }] : []);
        pods.forEach(p => {
          const guestMatch = p.guest?.toLowerCase().includes(q);
          if (p.takeaway1?.toLowerCase().includes(q) || guestMatch)
            hits.push({ date: d, type: "Podcast", source: p.podcast, guest: p.guest, text: p.takeaway1 });
          if (p.takeaway2?.toLowerCase().includes(q) || (guestMatch && p.takeaway2))
            hits.push({ date: d, type: "Podcast", source: p.podcast, guest: p.guest, text: p.takeaway2 });
          // Guest-only match with no takeaway hit — show both takeaways
          if (guestMatch && !p.takeaway1?.toLowerCase().includes(q) && !p.takeaway2?.toLowerCase().includes(q)) {
            if (p.takeaway1) hits.push({ date: d, type: "Podcast", source: p.podcast, guest: p.guest, text: p.takeaway1 });
            if (p.takeaway2) hits.push({ date: d, type: "Podcast", source: p.podcast, guest: p.guest, text: p.takeaway2 });
          }
        });
        if (e.geoTakeaway?.toLowerCase().includes(q) || e.geoSubject?.toLowerCase().includes(q))
          hits.push({ date: d, type: "Geopolitical Futures", source: e.geoSubject, guest: "", text: e.geoTakeaway });
        return hits;
      }).filter((r, i, arr) =>
        // Deduplicate
        arr.findIndex(x => x.date === r.date && x.source === r.source && x.text === r.text) === i
      )
    : [];

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia', serif", color: "#666", fontSize: 14, letterSpacing: 2 }}>
      LOADING...
    </div>
  );

  const isComplete = todayEntry.podcast && todayEntry.takeaway1 && todayEntry.takeaway2;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e8e2d9",
      fontFamily: "'Georgia', serif",
      maxWidth: 720,
      margin: "0 auto",
      padding: "0 0 80px 0",
    }}>
      <style>{`
        html, body, #root { background: #0a0a0a; margin: 0; padding: 0; }
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; }
        ::placeholder { color: #3a3a3a !important; }
        textarea:focus, input:focus, select:focus { outline: none; border-color: #c8a96e !important; }
        .field-input { background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e2d9; width: 100%; padding: 8px 0; font-family: 'Georgia', serif; font-size: 15px; transition: border-color 0.2s; resize: none; }
        .field-input:focus { border-bottom-color: #c8a96e; }
        select.field-input option { background: #1a1a1a; color: #e8e2d9; }
        .nav-btn { background: none; border: none; color: #555; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px; padding: 12px 16px; transition: color 0.2s; text-transform: uppercase; }
        .nav-btn:hover { color: #c8a96e; }
        .nav-btn.active { color: #c8a96e; border-bottom: 1px solid #c8a96e; }
        .section-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; color: #c8a96e; text-transform: uppercase; margin-bottom: 16px; }
        .card { background: #111; border: 1px solid #1e1e1e; padding: 24px; margin-bottom: 16px; }
        .toggle-wrap { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .toggle { width: 42px; height: 24px; background: #1e1e1e; border-radius: 12px; position: relative; transition: background 0.2s; border: 1px solid #2a2a2a; }
        .toggle.on { background: #c8a96e; border-color: #c8a96e; }
        .toggle::after { content: ''; position: absolute; width: 18px; height: 18px; background: #0a0a0a; border-radius: 50%; top: 2px; left: 2px; transition: left 0.2s; }
        .toggle.on::after { left: 20px; }
        .cal-day { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 11px; border-radius: 2px; cursor: default; }
        .stat-bar-bg { height: 4px; background: #1e1e1e; border-radius: 2px; flex: 1; }
        .stat-bar-fill { height: 4px; background: #c8a96e; border-radius: 2px; transition: width 0.6s; }
        .takeaway-card { background: #0d0d0d; border-left: 2px solid #c8a96e; padding: 12px 16px; margin-bottom: 8px; }
        .search-input { background: transparent; border: 1px solid #2a2a2a; color: #e8e2d9; padding: 10px 14px; font-family: 'DM Mono', monospace; font-size: 13px; width: 100%; letter-spacing: 1px; transition: border-color 0.2s; }
        .search-input:focus { border-color: #c8a96e; outline: none; }
        .pill { display: inline-flex; align-items: center; gap: 8px; background: #1a1a1a; border: 1px solid #2a2a2a; padding: 4px 12px; font-family: 'DM Mono', monospace; font-size: 11px; color: #888; margin: 4px; border-radius: 2px; cursor: pointer; }
        .pill:hover { border-color: #c8a96e; color: #c8a96e; }
        .pill .remove { color: #444; font-size: 14px; line-height: 1; }
        .pill .remove:hover { color: #c8a96e; }
        .save-btn { background: #c8a96e; color: #0a0a0a; border: none; padding: 10px 24px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px; cursor: pointer; text-transform: uppercase; transition: background 0.2s; }
        .save-btn:hover { background: #d4bb84; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "32px 24px 0", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 4, color: "#555", marginBottom: 6, textTransform: "uppercase" }}>
          Daily Intelligence
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, color: "#e8e2d9", letterSpacing: -0.5, marginBottom: 4 }}>
          Reading Log
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 20 }}>
          {formatDate(today).toUpperCase()} · {streak > 0 ? `${streak}-DAY STREAK` : "START YOUR STREAK"}
        </div>

        {/* Nav */}
        <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
          {[["today", "Today"], ["history", "History"], ["library", "Library"], ["search", "Search"], ["settings", "Settings"]].map(([v, l]) => (
            <button key={v} className={`nav-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "28px 24px 0" }}>

        {/* TODAY VIEW */}
        {view === "today" && (
          <>
            {/* Current Books Banner */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              {[["📖 Physical", currentBooks.physical], ["🎧 Audible", currentBooks.audible]].map(([label, title]) => (
                <div key={label} style={{ flex: 1, background: "#111", border: "1px solid #1e1e1e", padding: "14px 16px" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 3, color: "#555", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 14, color: title ? "#e8e2d9" : "#3a3a3a", fontStyle: title ? "normal" : "italic" }}>
                    {title || "Not set — go to Settings"}
                  </div>
                </div>
              ))}
            </div>

            {/* Podcasts */}
            <div className="card">
              <div className="section-label">🎙 Podcasts</div>
              {todayEntry.podcastEntries.map((pe, idx) => (
                <div key={idx} style={{ marginBottom: idx < todayEntry.podcastEntries.length - 1 ? 28 : 0 }}>
                  {todayEntry.podcastEntries.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 3, color: "#444" }}>EPISODE {idx + 1}</div>
                      <button onClick={() => {
                        const updated = todayEntry.podcastEntries.filter((_, i) => i !== idx);
                        saveEntry({ podcastEntries: updated });
                      }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1 }}>
                        REMOVE
                      </button>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>PODCAST</div>
                    <select
                      className="field-input"
                      value={pe.podcast}
                      onChange={e => {
                        const updated = todayEntry.podcastEntries.map((p, i) => i === idx ? { ...p, podcast: e.target.value } : p);
                        saveEntry({ podcastEntries: updated });
                      }}
                    >
                      <option value="">Select podcast...</option>
                      {podcasts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>GUEST <span style={{ color: "#3a3a3a" }}>— OPTIONAL</span></div>
                    <input
                      className="field-input"
                      placeholder="e.g. Dario Amodei, Howard Marks..."
                      value={pe.guest || ""}
                      onChange={e => {
                        const updated = todayEntry.podcastEntries.map((p, i) => i === idx ? { ...p, guest: e.target.value } : p);
                        saveEntry({ podcastEntries: updated });
                      }}
                    />
                  </div>
                  {[["takeaway1", "Takeaway #1"], ["takeaway2", "Takeaway #2"]].map(([key, label]) => (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>{label}</div>
                      <textarea
                        className="field-input"
                        rows={2}
                        placeholder="What did you learn?"
                        value={pe[key]}
                        onChange={e => {
                          const updated = todayEntry.podcastEntries.map((p, i) => i === idx ? { ...p, [key]: e.target.value } : p);
                          saveEntry({ podcastEntries: updated });
                        }}
                      />
                    </div>
                  ))}
                  {idx < todayEntry.podcastEntries.length - 1 && (
                    <div style={{ borderBottom: "1px solid #1e1e1e", marginTop: 16 }} />
                  )}
                </div>
              ))}
              <button onClick={() => {
                saveEntry({ podcastEntries: [...todayEntry.podcastEntries, { podcast: "", guest: "", takeaway1: "", takeaway2: "" }] });
              }} style={{
                marginTop: 20, background: "none", border: "1px dashed #2a2a2a", color: "#555",
                width: "100%", padding: "10px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
                fontSize: 10, letterSpacing: 2, transition: "all 0.2s"
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#c8a96e"; e.target.style.color = "#c8a96e"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.color = "#555"; }}
              >
                + ADD ANOTHER PODCAST
              </button>
            </div>

            {/* Arabic */}
            <div className="card">
              <div className="section-label">🌙 Arabic Study</div>
              <div className="toggle-wrap" onClick={() => saveEntry({ arabicStudied: !todayEntry.arabicStudied })}>
                <div className={`toggle ${todayEntry.arabicStudied ? "on" : ""}`} />
                <span style={{ fontSize: 15, color: todayEntry.arabicStudied ? "#e8e2d9" : "#555" }}>
                  {todayEntry.arabicStudied ? "Studied today" : "Not studied yet"}
                </span>
              </div>
            </div>

            {/* Geopolitical Futures */}
            <div className="card">
              <div className="section-label">🌐 Geopolitical Futures</div>
              <div className="toggle-wrap" style={{ marginBottom: todayEntry.geoRead ? 20 : 0 }} onClick={() => saveEntry({ geoRead: !todayEntry.geoRead })}>
                <div className={`toggle ${todayEntry.geoRead ? "on" : ""}`} />
                <span style={{ fontSize: 15, color: todayEntry.geoRead ? "#e8e2d9" : "#555" }}>
                  {todayEntry.geoRead ? "Read today" : "Not read today"}
                </span>
              </div>
              {todayEntry.geoRead && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>SUBJECT</div>
                    <input
                      className="field-input"
                      placeholder="e.g. China-Taiwan tensions, US election..."
                      value={todayEntry.geoSubject}
                      onChange={e => saveEntry({ geoSubject: e.target.value })}
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>KEY TAKEAWAY</div>
                    <textarea
                      className="field-input"
                      rows={2}
                      placeholder="Main insight..."
                      value={todayEntry.geoTakeaway}
                      onChange={e => saveEntry({ geoTakeaway: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Completion status */}
            {(() => {
              const isComplete = todayEntry.podcastEntries.some(p => p.podcast && p.takeaway1 && p.takeaway2);
              return (
                <div style={{
                  background: isComplete ? "#0d1a0d" : "#111",
                  border: `1px solid ${isComplete ? "#2a4a2a" : "#1e1e1e"}`,
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: 12
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isComplete ? "#5a9a5a" : "#2a2a2a" }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color: isComplete ? "#5a9a5a" : "#444" }}>
                    {isComplete ? "TODAY'S LOG COMPLETE" : "FILL IN PODCAST + TAKEAWAYS TO COMPLETE"}
                  </span>
                </div>
              );
            })()}
          </>
        )}

        {/* HISTORY VIEW */}
        {view === "history" && (
          <>
            {/* Stats */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="section-label">Completion Rates</div>
              {[
                ["Podcast Logged", podcastDays, totalDays],
                ["Arabic Studied", arabicDays, totalDays],
                ["Geo Futures Read", geoDays, totalDays],
              ].map(([label, count, total]) => (
                <div key={label} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#888", letterSpacing: 1 }}>{label}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#c8a96e" }}>
                      {total ? Math.round((count/total)*100) : 0}% <span style={{ color: "#444" }}>({count}/{total})</span>
                    </span>
                  </div>
                  <div className="stat-bar-bg">
                    <div className="stat-bar-fill" style={{ width: `${total ? (count/total)*100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Calendar */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>
                  {new Date(calMonth.year, calMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["←", "→"].map((ch, i) => (
                    <button key={ch} onClick={() => {
                      setCalMonth(prev => {
                        const d = new Date(prev.year, prev.month + (i === 0 ? -1 : 1));
                        return { year: d.getFullYear(), month: d.getMonth() };
                      });
                    }} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", width: 28, height: 28, cursor: "pointer", fontFamily: "monospace", fontSize: 14 }}>
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: "#444", padding: "4px 0" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {(() => {
                  const firstDay = new Date(calMonth.year, calMonth.month, 1).getDay();
                  const days = getDaysInMonth(calMonth.year, calMonth.month);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
                  for (let d = 1; d <= days; d++) {
                    const key = `${calMonth.year}-${String(calMonth.month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const entry = entries[key];
                    const pods = entry?.podcastEntries || (entry?.podcast ? [{ podcast: entry.podcast, takeaway1: entry.takeaway1, takeaway2: entry.takeaway2 }] : []);
                    const complete = pods.some(p => p.podcast && p.takeaway1 && p.takeaway2);
                    const partial = entry && !complete;
                    const isToday = key === today;
                    cells.push(
                      <div key={d} className="cal-day" style={{
                        background: complete ? "#c8a96e22" : partial ? "#1e1e1e" : "transparent",
                        color: complete ? "#c8a96e" : partial ? "#555" : "#333",
                        border: isToday ? "1px solid #c8a96e55" : "1px solid transparent",
                        fontWeight: complete ? 600 : 400,
                      }}>
                        {d}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
                {[["#c8a96e22", "#c8a96e", "Complete"], ["#1e1e1e", "#555", "Partial"], ["transparent", "#333", "Empty"]].map(([bg, color, label]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 12, height: 12, background: bg, border: `1px solid ${color}`, borderRadius: 1 }} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: "#555" }}>{label.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent entries */}
            <div className="section-label" style={{ marginTop: 8 }}>Recent Entries</div>
            {[...allDates].reverse().slice(0, 30).map(d => {
              const e = entries[d];
              const pods = e.podcastEntries || (e.podcast ? [{ podcast: e.podcast, takeaway1: e.takeaway1, takeaway2: e.takeaway2 }] : []);
              const complete = pods.some(p => p.podcast && p.takeaway1 && p.takeaway2);
              return (
                <div key={d} style={{ borderBottom: "1px solid #1a1a1a", padding: "16px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>{formatDate(d).toUpperCase()}</div>
                      {pods.filter(p => p.podcast).map((p, i) => (
                        <div key={i} style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 14, color: "#e8e2d9" }}>{p.podcast}</div>
                          {p.guest && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#c8a96e88", letterSpacing: 1, marginTop: 2 }}>w/ {p.guest}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {e.arabicStudied && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, color: "#c8a96e", border: "1px solid #c8a96e44", padding: "2px 6px" }}>AR</span>}
                      {e.geoRead && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, color: "#c8a96e", border: "1px solid #c8a96e44", padding: "2px 6px" }}>GEO</span>}
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, color: complete ? "#5a9a5a" : "#444", border: `1px solid ${complete ? "#2a4a2a" : "#2a2a2a"}`, padding: "2px 6px" }}>{complete ? "✓" : "—"}</span>
                    </div>
                  </div>
                  {pods.filter(p => p.takeaway1).map((p, i) => (
                    <div key={i} className="takeaway-card" style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5 }}>
                      {pods.length > 1 && (
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#555", letterSpacing: 2, marginBottom: 4 }}>
                          {p.podcast}{p.guest ? ` · ${p.guest}` : ""}
                        </div>
                      )}
                      {p.takeaway1}
                    </div>
                  ))}
                  {e.geoSubject && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginTop: 8 }}>GEO: {e.geoSubject}</div>}
                </div>
              );
            })}
          </>
        )}

        {/* SEARCH VIEW */}
        {view === "search" && (
          <>
            <div className="section-label">Search Takeaways</div>
              <input
              className="search-input"
              placeholder="Search takeaways, guests, subjects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div style={{ marginTop: 24 }}>
              {searchQuery.length > 1 && searchResults.length === 0 && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#444", letterSpacing: 2 }}>NO RESULTS FOUND</div>
              )}
              {searchResults.map((r, i) => (
                <div key={i} style={{ borderBottom: "1px solid #1a1a1a", padding: "16px 0" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: "#c8a96e", border: "1px solid #c8a96e44", padding: "2px 6px" }}>{r.type.toUpperCase()}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 1 }}>{formatDate(r.date).toUpperCase()}</span>
                    {r.source && <span style={{ fontSize: 12, color: "#666" }}>{r.source}</span>}
                    {r.guest && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#c8a96e88", letterSpacing: 1 }}>w/ {r.guest}</span>}
                  </div>
                  <div className="takeaway-card" style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>{r.text}</div>
                </div>
              ))}
              {searchQuery.length <= 1 && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#333", letterSpacing: 2 }}>TYPE TO SEARCH ACROSS ALL PODCAST TAKEAWAYS, GUEST NAMES, AND GEO SUBJECTS</div>
              )}
            </div>
          </>
        )}


        {/* LIBRARY VIEW */}
        {view === "library" && (
          <>
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>Books Completed</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2 }}>
                    {library.length} BOOK{library.length !== 1 ? "S" : ""} · {library.filter(b => b.format === "Physical").length} PHYSICAL · {library.filter(b => b.format === "Audible").length} AUDIBLE
                  </div>
                </div>
                <button className="save-btn" onClick={() => setShowAddBook(true)}>+ ADD BOOK</button>
              </div>

              {/* Add Book Form */}
              {showAddBook && (
                <div className="card" style={{ marginBottom: 20, border: "1px solid #c8a96e44" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div className="section-label" style={{ marginBottom: 0 }}>Log Completed Book</div>
                    <button onClick={() => setShowAddBook(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1 }}>CANCEL</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>TITLE *</div>
                      <input className="field-input" placeholder="Book title..." value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>AUTHOR</div>
                      <input className="field-input" placeholder="Author name..." value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>FORMAT</div>
                      <select className="field-input" value={bookForm.format} onChange={e => setBookForm(f => ({ ...f, format: e.target.value }))}>
                        <option>Physical</option>
                        <option>Audible</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>GENRE</div>
                      <select className="field-input" value={bookForm.genre} onChange={e => setBookForm(f => ({ ...f, genre: e.target.value }))}>
                        <option value="">Select genre...</option>
                        {GENRES.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>DATE FINISHED</div>
                      <input className="field-input" type="text" placeholder="YYYY-MM-DD" value={bookForm.dateFinished} onChange={e => setBookForm(f => ({ ...f, dateFinished: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>RATING</div>
                      <div style={{ display: "flex", gap: 6, paddingTop: 8 }}>
                        {[1,2,3,4,5].map(n => (
                          <span key={n} onClick={() => setBookForm(f => ({ ...f, rating: n }))}
                            style={{ cursor: "pointer", fontSize: 20, color: n <= bookForm.rating ? "#c8a96e" : "#2a2a2a", transition: "color 0.15s" }}>★</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>TAKEAWAY / REVIEW</div>
                    <textarea className="field-input" rows={3} placeholder="Key ideas, what you'll remember, would you recommend it..." value={bookForm.review} onChange={e => setBookForm(f => ({ ...f, review: e.target.value }))} />
                  </div>
                  <button className="save-btn" onClick={addBookToLibrary} style={{ width: "100%", padding: "12px" }}>SAVE TO LIBRARY</button>
                </div>
              )}

              {/* Filters + Sort */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <input className="search-input" placeholder="Search library..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} style={{ fontSize: 11 }} />
                </div>
                <select value={libraryFilter} onChange={e => setLibraryFilter(e.target.value)} style={{ background: "#111", border: "1px solid #2a2a2a", color: "#888", padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
                  <option>All</option>
                  <option>Physical</option>
                  <option>Audible</option>
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
                <select value={librarySort} onChange={e => setLibrarySort(e.target.value)} style={{ background: "#111", border: "1px solid #2a2a2a", color: "#888", padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
                  <option value="date">Sort: Date</option>
                  <option value="title">Sort: Title</option>
                  <option value="rating">Sort: Rating</option>
                </select>
              </div>

              {/* Book list */}
              {filteredLibrary.length === 0 && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#333", letterSpacing: 2, padding: "40px 0", textAlign: "center" }}>
                  {library.length === 0 ? "NO BOOKS LOGGED YET — ADD YOUR FIRST COMPLETED BOOK" : "NO RESULTS"}
                </div>
              )}
              {filteredLibrary.map(book => (
                <div key={book.id} style={{ borderBottom: "1px solid #1a1a1a", padding: "20px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "#e8e2d9", fontWeight: 700 }}>{book.title}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: book.format === "Physical" ? "#6a9a8a" : "#8a6a9a", border: `1px solid ${book.format === "Physical" ? "#2a4a3a" : "#3a2a4a"}`, padding: "2px 6px" }}>{(book.format || "Physical").toUpperCase()}</span>
                        {book.genre && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: "#555", border: "1px solid #2a2a2a", padding: "2px 6px" }}>{book.genre.toUpperCase()}</span>}
                      </div>
                      {book.author && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>by {book.author}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {book.rating > 0 && (
                          <span style={{ color: "#c8a96e", fontSize: 13, letterSpacing: 2 }}>{[1,2,3,4,5].map(n => n <= book.rating ? "★" : "☆").join("")}</span>
                        )}
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#444", letterSpacing: 1 }}>{book.dateFinished ? formatDate(book.dateFinished) : ""}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteBook(book.id)} style={{ background: "none", border: "none", color: "#2a2a2a", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 16, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                      onMouseEnter={e => e.target.style.color = "#c84a4a"}
                      onMouseLeave={e => e.target.style.color = "#2a2a2a"}>×</button>
                  </div>
                  {book.review && (
                    <div style={{ marginTop: 12, background: "#0d0d0d", borderLeft: "2px solid #2a2a2a", padding: "10px 14px", fontSize: 13, color: "#888", lineHeight: 1.6, fontStyle: "italic" }}>
                      {book.review}
                    </div>
                  )}
                </div>
              ))}
            </>
        )}

        {/* SETTINGS VIEW */}
        {view === "settings" && (
          <>
            {/* Current Books */}
            <div className="card">
              <div className="section-label">Current Books</div>
              {[["physical", "📖 Physical Book"], ["audible", "🎧 Audible Book"]].map(([key, label]) => (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>{label}</div>
                  <input
                    className="field-input"
                    placeholder="Enter title..."
                    value={currentBooks[key]}
                    onChange={e => {
                      const updated = { ...currentBooks, [key]: e.target.value };
                      saveBooks(updated);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Podcast List */}
            <div className="card">
              <div className="section-label">Podcast List</div>
              <div style={{ marginBottom: 16 }}>
                {podcasts.map((p, i) => (
                  <span key={p} className="pill">
                    {p}
                    <span className="remove" onClick={() => savePodcasts(podcasts.filter((_, j) => j !== i))}>×</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  className="field-input"
                  placeholder="Add podcast..."
                  value={newPodcast}
                  onChange={e => setNewPodcast(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newPodcast.trim()) {
                      savePodcasts([...podcasts, newPodcast.trim()]);
                      setNewPodcast("");
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="save-btn" onClick={() => {
                  if (newPodcast.trim()) {
                    savePodcasts([...podcasts, newPodcast.trim()]);
                    setNewPodcast("");
                  }
                }}>Add</button>
              </div>
            </div>

            {/* Export / Import */}
            <div className="card">
              <div className="section-label">Data Export / Import</div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 10 }}>EXPORT — generate a code to back up all your data</div>
                <button className="save-btn" onClick={handleExport} style={{ width: "100%", padding: "12px" }}>GENERATE EXPORT CODE</button>
                {exportCode && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#c8a96e", letterSpacing: 2, marginBottom: 6 }}>COPY THIS CODE AND SAVE IT IN NOTES:</div>
                    <textarea
                      readOnly
                      value={exportCode}
                      onClick={e => e.target.select()}
                      style={{ width: "100%", background: "#0d0d0d", border: "1px solid #c8a96e44", color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "10px", resize: "none", height: 80, letterSpacing: 0.5 }}
                    />
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#555", letterSpacing: 1, marginTop: 4 }}>Tap the box to select all, then copy</div>
                  </div>
                )}
              </div>
              <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 20 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 10 }}>IMPORT — paste a previously generated export code</div>
                <textarea
                  className="field-input"
                  rows={3}
                  placeholder="Paste export code here..."
                  value={importCode}
                  onChange={e => { setImportCode(e.target.value); setImportMsg(""); }}
                />
                <button className="save-btn" onClick={handleImport} style={{ width: "100%", padding: "12px", marginTop: 10 }}>RESTORE FROM CODE</button>
                {importMsg && (
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1, marginTop: 10, color: importMsg.startsWith("✓") ? "#5a9a5a" : "#c84a4a" }}>{importMsg}</div>
                )}
              </div>
            </div>

            {/* Stats summary */}
            <div className="card">
              <div className="section-label">Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  ["Total Days Logged", totalDays],
                  ["Current Streak", `${streak} days`],
                  ["Arabic Sessions", arabicDays],
                  ["Geo Futures Read", geoDays],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 3, color: "#555", marginBottom: 4 }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#c8a96e" }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
