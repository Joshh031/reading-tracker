import React, { useEffect, useState } from "react";
import { vault } from "./vaultClient.js";

export default function Connections() {
  const [records, setRecords] = useState([]),
    [created, setCreated] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setRecords((await vault("connections")).connections);
  }
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  async function create() {
    setBusy(true);
    setMessage("");
    try {
      setCreated(await vault("connection_create"));
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id) {
    setBusy(true);
    try {
      await vault("connection_revoke", { id });
      if (created?.id === id) setCreated(null);
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="journal">
      <p className="eyebrow">CHATGPT CONNECTION</p>
      <h2>Your archive, in conversation</h2>
      <p>
        Create a private connection key for the Knowledge Vault plugin. It lets
        ChatGPT retrieve your archive, add episodes and save reviews or
        reflections. Keys expire after 30 days and can be revoked here.
      </p>
      <p>
        Paste the key only into the plugin’s secure API-key connection field,
        never into a conversation.
      </p>
      <button className="primary" disabled={busy} onClick={create}>
        Create ChatGPT connection key
      </button>
      {created && (
        <div>
          <p>
            This key is shown only during this visit. Expires{" "}
            {new Date(created.expiresAt).toLocaleDateString()}.
          </p>
          <label>
            Private connection key
            <input
              aria-label="Private connection key"
              type="password"
              readOnly
              value={created.token}
              autoComplete="off"
            />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(created.token);
                setMessage(
                  "Key copied. Paste it into the secure plugin connection field.",
                );
              } catch {
                setMessage(
                  "Clipboard unavailable. Select and copy the key field.",
                );
              }
            }}
          >
            Copy connection key
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <h3>Connections</h3>
      {records.length === 0 && <p>No connection keys yet.</p>}
      {records.map((r) => (
        <div key={r.id}>
          <p>
            {r.name} ·{" "}
            {r.revoked
              ? "Revoked"
              : Date.parse(r.expiresAt) <= Date.now()
                ? "Expired"
                : "Active"}{" "}
            · expires {new Date(r.expiresAt).toLocaleDateString()}
          </p>
          {!r.revoked && (
            <button disabled={busy} onClick={() => revoke(r.id)}>
              Revoke connection
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
