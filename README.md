# Knowledge Vault

Private podcast research and listening journal. React/Vite PWA, Vercel Node API, Firebase Auth and server-only Firestore. Development branch: `feature/knowledge-vault-v1`. **Production is not enabled.**

## Run and verify

Node 24 recommended. `npm ci`, `npm test`, `npm run build`.

- `npm run test:live`: read-only metadata/RSS/publisher probes for the four regression episodes. Actual transcript text stays in `/tmp/knowledge-vault-live`, never in Git.
- `npm run test:browser`: desktop and iPhone viewport checks; requires Playwright Chromium. The signed-in UI test explicitly mocks auth/API and is not proof of live sign-in.
- `npm exec --package=firebase-tools@13.35.1 -- firebase emulators:exec --only firestore --project demo-knowledge-vault 'npm run test:firestore'`: real Firestore protocol, persistence, transactions and security rule tests in an isolated local emulator.

Copy `.env.example` to `.env.local` for server development. Vite + Nitro serve the PWA and existing `/api/*` routes together and compile the Workflow SDK's private worker. For durable-worker integration tests, run `npm run test:workflow` inside the demo Firestore emulator with `FIREBASE_PROJECT_ID=demo-knowledge-vault`.

## Data safety and activation

New writes use `knowledgeVaultPreviewUsers/{uid}/episodes/{canonical episode ID}`. Production requires `KV_PRODUCTION_ENABLED=true` and uses a separate collection. Legacy `readingTracker/joshh031` is read only via the server for `KV_LEGACY_OWNER_UID`. No normalization writes on load. Complete raw legacy data is included in backups, including current books, chapter logs, custom fields, and original reflections.

`FIREBASE_SERVICE_ACCOUNT_JSON`, a verified Firebase user UID in `KV_ALLOWED_UIDS`, and verified private database rules are required. The server fails closed until `KV_STORAGE_RULES_VERIFIED=true`. **Do not set that flag merely to bypass setup.** A broad legacy allow rule can defeat more specific deny rules: validate anonymous/authenticated client access to the archive before enabling storage. Prefer an isolated preview Firebase project/database if the current rules cannot be restricted without breaking legacy apps. `firestore.preview.rules` is for a new isolated database/emulator only, not a replacement for production rules.

Google sign-in must be enabled for the Firebase project, with the stable preview domain authorized. PWA sign-in uses local persistence. Server verifies account identity and an explicit UID allowlist. Connector tokens are SHA-256 hashes scoped to a user and permissions, with optional expiry, in server-only `KV_API_KEYS_JSON`.

## Ingestion and evidence

Exact Apple episode ID → collection/direct metadata fallback → unique RSS title/date or exact audio match → RSS transcript → linked publisher page/index → embedded public transcript JSON → explicitly authorized third-party adapter → authorized YouTube captions → bounded AssemblyAI transcription.

VTT, SRT, plain text, JSON segments and publisher Deepgram exports preserve timestamps/speakers. Publisher Nuxt payloads are parsed as JSON references, never executed. Conflicting IDs, ambiguous RSS matches and mismatched pages are rejected. Public downloads are size/time bounded; DNS is checked and pinned, including at redirects.

Jobs are persisted between stages, leased transactionally, deduplicated by canonical ID, and retain source attempts/errors/backoff. Adding or resuming an episode starts a Vercel Workflow. Durable sleeps handle transcription polling and retry delays after the browser closes; a deterministic hook prevents overlapping workflow runs for the same owner/episode. The private queue-triggered handler is emitted by the SDK, with deployment pinning and environment isolation. Only identifiers and processing status cross workflow boundaries; transcripts remain in Firestore. Polling is capped at 120 iterations; further retries resume the same transcription job. Explicit retries have their own daily limit. A bounded `waitUntil` fallback reports scheduling failure instead of claiming a durable run started. Ambiguous paid submission timeouts are held for reconciliation instead of risking duplicate charges; definitive provider rejections can safely retry after correction.

Verified reviews remain readable and full-text searchable if embeddings fail, with a separate retryable indexing warning. Original tracker notes are included in search with their original/unverified basis. Research briefs validate every paragraph's references and undergo a second evidence audit before display. Personal notes never establish a guest's investment stance.

Full reviews require likely complete transcripts. Exact quotes/segment IDs are validated, then a second model pass audits evidence. This reduces unsupported output; it does not establish that model judgments are infallible. Review data distinguishes guest claims from analyst implications and personal reflections. Risk discussion alone does not imply bearishness. Reflections retain raw text, an editable organized version, listening percentage, questions and version history.

## Providers and cost limits

AI Gateway uses Vercel OIDC or `AI_GATEWAY_API_KEY`. Model IDs were verified against the live catalog. Defaults: `openai/gpt-4.1-mini` for analysis/audit, `openai/text-embedding-3-small` for retrieval. AssemblyAI is disabled until explicitly configured; no subscription is provisioned. Default caps: 2 transcription jobs/day/user, 2 hours/250 MB per job, 10 analysis attempts/day, 10 imports/day. Imports/search/briefs/reflection operations have separate durable limits. Configure account-level provider spend limits too; application caps are not a billing guarantee.

YouTube captions require an OAuth token authorized for the video; the implementation does not scrape private captions or bypass access controls. Apple in-app transcript availability does not imply public API access.

## API and ChatGPT

`POST /api/vault` with Bearer auth and JSON `{action, ...fields}`. Actions: add, get, list, process, transcript, search, research, reflect, organize, legacy, export, sync_daily, work. GET reports configuration presence only. Streamable HTTP MCP endpoint: `POST /api/mcp`. Private read/write tools use the same store as the PWA. Connection installation/authentication remains a separate live verification step; a deployed endpoint alone does not mean ordinary ChatGPT conversations are connected.

`/api/verify` is an optional preview-only, expiring diagnostics-key harness for live source/model verification without database writes. It is off by default and cannot run in production.

## Storage decision and rollback

Retain Firebase for this critical path. A migration cannot fix missing transcripts and would add identity/data-loss risk. Postgres is a stronger long-term fit for relational guests/positions and indexed hybrid retrieval; reconsider after the private archive and ingestion acceptance tests pass. Current structured claims and 256-dimensional embeddings are persisted per episode; full-text + cosine retrieval scans the user's archive, suitable for a personal archive but not a scalable commercial search service.

No irreversible migration has been performed. `scripts/legacy-plan.mjs` produces a deterministic inventory with source/record hashes and duplicate counts, preserving the entire source document. Rollback is redeploying the previous preview commit; legacy production data is untouched. Before any later migration: save a private export, compare record identities/counts and hashes, validate authentication/ownership, dual-read, then request cutover approval. Never commit private exports.

Daily Tracker writes are disabled in preview. The production adapter requires explicit `KV_DAILY_TRACKER_ENABLED=true`, owner linkage, and a completed-listening action. It updates only the podcast points field, transactionally deduplicates canonical episodes, caps at existing 15 points/day, and preserves other tracker fields. Adding an episode does not award listening points.

The install step applies a narrow dynamic-import compatibility patch for upstream `auth0/node-jwks-rsa#507` in Vercel’s loader. The supported jose version is retained; installation fails if the upstream source changes. A regression test imports the API with native require(ESM) disabled.
