# Development acceptance record — 2026-10-23

This branch is a development implementation, **not cleared for production**. Keep PR #3 in draft. No production deployment or database migration has been performed.

## Verified against live sources

| Apple episode                                       | Identity and guest metadata             | Transcript result                                                                                                                            |
| --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1000797748298 — Meb / Vincent Deluard               | Exact ID + unique RSS match, October 23 | Official publisher JSON, 11,328 words, 195 segments; Meb Faber/Vincent Deluard speaker mapping; 98.9% of duration covered by timed intervals |
| 1000796472885 — BG2 / Jensen Huang                  | Exact ID + unique RSS match, October 15 | Exact audio located; no complete transcript retrieved by configured public paths                                                             |
| 1000796803517 — GZERO / Amy Walter and Liam Donovan | Exact ID + unique RSS match, October 17 | Exact audio located; no complete transcript retrieved by configured public paths                                                             |
| 1000796973676 — Excess Returns / Paisley Nardini    | Exact ID + unique RSS match, October 18 | Exact audio located; no complete transcript retrieved by configured public paths                                                             |

These identifiers exist only in regression probes, not ingestion matching logic. Apple app transcripts are not assumed to have a usable public endpoint. No neighboring episode has been substituted.

## Tests completed

- 35 Node tests: identities, source parsing, conflicting dates, sparse excerpts, SSRF, citation validation, duplicate/concurrent imports, processing state, reflection conflicts, stance retention, production guards, runtime imports, HTTP authentication/body limits, safe retry recovery, embedding failure fallback, legacy search and research evidence validation. Provider-driven lifecycle tests use explicitly synthetic provider fixtures.
- 2 real Firestore emulator integration tests: persistence, transactional duplicate handling/leases/reflections, transcript chunks, account separation and direct unauthenticated denial.
- 1 compiled Workflow SDK integration test with real Firestore emulator: durable pause/wake, processing completion, concurrent journal preservation, full-text indexing after unavailable embeddings and user isolation. Synthetic review fixture; no claim of real model generation.
- 4 browser tests: desktop and iPhone-sized Chromium. Signed-in flows use auth/API fixtures; these do **not** prove live Google login or physical-iPhone Safari behavior.
- Vite production build; zero reported dependency vulnerabilities at the last npm audit.
- GitHub Actions passed for the deployment-runtime fix.
- Deployed preview: HTTP 200 frontend/health, HTTP 401 without credentials. Real-source ingestion reached the provider; AI Gateway rejected generation because the team has no payment card. MCP initialization and all seven tool descriptions were verified live. Live analysis and database writes are not yet accepted.

## Activation dependencies and unresolved acceptance work

1. Server-side Firebase credential and a verified owner UID; Google sign-in/authorized preview domain. Configure an isolated private preview database or project. `FIRESTORE_DATABASE_ID` selects a named database; optional `VITE_FIREBASE_*` variables select a separate Auth project. Validate its client rules before setting `KV_STORAGE_RULES_VERIFIED=true`.
2. AI Gateway requires a valid payment card on the Vercel team before servicing requests, including free credits (confirmed HTTP 403 response). Bounded speech-to-text credentials are also required. No paid provider subscription has been opened. Verify actual summaries, citation audits, embeddings and all four transcriptions after configuration.
3. Durable Vercel Workflow implementation is included and locally integration-tested. Deployed queue/sleep verification and actual private-data ingestion still need live acceptance. Workflow run IDs and episode state are persisted; no separate paid scheduler was provisioned.
4. Install and authenticate the private ChatGPT connection only after the live storage/processing flow passes. The MCP endpoint is implemented; it is not yet an installed ordinary-chat connection.
5. Run cross-episode real-data synthesis and physical iPhone/PWA acceptance. Validate Daily Tracker under an approved production release. Preview Daily Tracker writes remain disabled. Existing reading editing remains in the unchanged production tracker; the new preview displays legacy history and exports the original records.

## Existing-data baseline and security finding

Read-only inventory: 4 dated entries, 5 podcast records, 5 unique podcast identities, 9 chapter logs, 2 current-book selections, 0 completed-library book records. Raw records were retained without rewrite; baseline export and full transcripts are not committed to Git.

The existing legacy Firestore document was readable through the unauthenticated REST API. This is an **existing production privacy issue**, not a protection provided by the new sign-in screen. New archive saving fails closed pending verified private rules. Production rules have not been changed because that requires explicit approval and checks for other applications sharing this Firebase project.

Retain Firebase for the ingestion critical path. Postgres is preferable for a commercial multi-user relational archive and indexed hybrid retrieval, but migrating now would not resolve missing transcripts or credentials. No Supabase project or paid service was provisioned. A deterministic read-only migration inventory script is included for a later validated cutover.
