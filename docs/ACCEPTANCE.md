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

- 36 Node tests: identities, source parsing, conflicting dates, sparse excerpts, SSRF, citation validation, duplicate/concurrent imports, processing state, reflection conflicts, stance retention, production guards, runtime imports, HTTP authentication/body limits, safe retry recovery, embedding failure fallback, legacy search and research evidence validation. Provider-driven lifecycle tests use explicitly synthetic provider fixtures.
- 2 real Firestore emulator integration tests: persistence, transactional duplicate handling/leases/reflections, transcript chunks, account separation and direct unauthenticated denial.
- 1 compiled Workflow SDK integration test with real Firestore emulator: durable pause/wake, processing completion, concurrent journal preservation, full-text indexing after unavailable embeddings and user isolation. Synthetic review fixture; no claim of real model generation.
- Deployable-bundle smoke test: native dependency startup, real HTTP routes, private-access denial, PWA shell and private queue trigger. Against the Firestore emulator, the compiled API also passes authenticated list, journal save and full-text search.
- 4 browser tests: desktop and iPhone-sized Chromium. Signed-in flows use auth/API fixtures; these do **not** prove live Google login or physical-iPhone Safari behavior.
- Vite production build; zero reported dependency vulnerabilities at the last npm audit.
- GitHub Actions includes all Node, database, workflow, deployable-bundle and browser checks. The last verified run for commit `e6870c0` passed; this follow-up adds a quota regression test.
- Deployed preview: HTTP 200 frontend/health, HTTP 401 without credentials. Real-source ingestion reached the provider; AI Gateway rejected generation because the team has no payment card. MCP initialization and all seven tool descriptions were verified live. Live model analysis remains blocked by provider billing; live private database writes are now verified below.

## Activation dependencies and unresolved acceptance work

1. Server-side Firebase credential, verified owner UID, isolated named preview database and deny-all client rules are configured. Stable preview domain is authorized in Firebase Auth. Live Google sign-in is still blocked by API-key HTTP referrer restrictions on both the preview origin and Firebase auth-handler origin. Google Cloud console was unavailable from the engineering browser; API Keys API is disabled, so the server credential could not inspect these restrictions. Do not remove API-key restrictions globally.
2. AI Gateway requires a valid payment card on the Vercel team before servicing requests, including free credits (confirmed HTTP 403 response). Bounded speech-to-text credentials are also required. No paid provider subscription has been opened. Verify actual summaries, citation audits, embeddings and all four transcriptions after configuration.
3. Durable Vercel Workflow is verified on the deployed preview: run `wrun_41M5MCB2EQ0GM16BG21FDCB4K8` completed with `{ok:true,resumedAfterDurableSleep:true}` after a real durable sleep. This proves cloud execution/resumption, not private archive ingestion. Actual private-data ingestion now persists all four exact episode records and the complete publisher transcript for the Meb episode. No separate paid scheduler was provisioned.
4. Install and authenticate the private ChatGPT connection only after the live storage/processing flow passes. The MCP endpoint is implemented; it is not yet an installed ordinary-chat connection.
5. Run cross-episode real-data synthesis and physical iPhone/PWA acceptance. Validate Daily Tracker under an approved production release. Preview Daily Tracker writes remain disabled. Existing reading editing remains in the unchanged production tracker; the new preview displays legacy history and exports the original records.

## Existing-data baseline and security finding

Read-only inventory: 4 dated entries, 5 podcast records, 5 unique podcast identities, 9 chapter logs, 2 current-book selections, 0 completed-library book records. Raw records were retained without rewrite; baseline export and full transcripts are not committed to Git.

After the durable-worker changes, a fresh read again matched the baseline document's entire fields and update time. Production `main` still points to `e6a59db708656cf42d0e17394515061764dacee2`.

The existing legacy Firestore document was readable through the unauthenticated REST API. This is an **existing production privacy issue**, not a protection provided by the new sign-in screen. The separate preview database has deny-all client rules; unauthenticated REST access returned PERMISSION_DENIED. The server-only preview archive passes authenticated read/write and account-isolation checks. Production rules have not been changed because that requires explicit approval and checks for other applications sharing this Firebase project.

Retain Firebase for the ingestion critical path. Postgres is preferable for a commercial multi-user relational archive and indexed hybrid retrieval, but migrating now would not resolve missing transcripts or credentials. No Supabase project or paid service was provisioned. A deterministic read-only migration inventory script is included for a later validated cutover.

## Live private-storage acceptance

On the deployed preview with real Firebase storage:

- Four requested URLs created four owner episode records; repeating an import returned `created:false` without scheduling a duplicate workflow.
- Meb/Vincent's official transcript persisted as 195 segments (retrieved in pages of 100 and 95) and 11,328 words. The durable worker reached analysis and preserved the transcript after the AI Gateway billing rejection.
- BG2 and GZERO resolved exact audio and stopped at `TRANSCRIPTION_NOT_CONFIGURED`. Excess Returns exposed a quota bug: missing configuration consumed the daily transcription budget. Configuration is now checked before reserving paid-job allowance, with a regression test covering repeated blocked attempts.
- A separately scoped engineering test identity saved a clearly labeled synthetic partial-listening journal, read it back and found it through full-text search. The owner reflection stayed empty. That identity could not read the owner's other episode (404); unauthenticated API access returned 401.
- Legacy history loaded with four dated entries. No legacy record, production rule, production environment variable or production branch was changed.

This verifies persistent ingestion, transcript storage, journal retention and isolation, not successful generation of a model review. Semantic synthesis, live Google login, the ordinary-chat connection and physical-iPhone acceptance remain incomplete.

## ChatGPT-first follow-up (no paid AI)

- Default provider guard prevents model, embedding, paid-adapter and speech-to-text requests even when credentials exist. Public sources remain available.
- Complete source retrieval stops at `awaiting_review`. ChatGPT review context is paginated with schema, evidence instructions, source provenance and transcript hash.
- Review saves are scoped, source-validated, versioned, retry-idempotent and lease-protected. Personal reflections are preserved. No independent semantic audit is claimed for conversation-written reviews.
- PWA source-packet download and review import are tested in desktop and iPhone-sized Chromium with explicit transport/auth fixtures. The test checks all source pages are downloaded and a saved journal survives review import.
- 39 Node/API tests pass, including disabled-provider guards and review save/staleness/fabrication/version checks. Firestore emulator and durable-workflow tests pass.
- GitHub was disconnected during this follow-up; remote publication needs reconnection. Google sign-in and a usable external MCP connection remain blocked. No production release or paid AI activation occurred.
- Cost correction: disabling paid AI does not make the named Firebase database free. Firestore's free quota does not cover this named preview database. Live database testing is paused; existing records are preserved. A strictly zero-billing hosted trial needs a free-tier database.
# Free trial acceptance — October 23, 2026

- Separate Firebase project `knowledge-vault-trial`: Spark/no billing, default Standard database with deny-all client rules. Anonymous REST read returned 403.
- Four canonical episode records, the 195-segment Meb transcript, and the complete exported legacy Reading Tracker document copied and read back identically. Repeat copy was idempotent. Original project and records retained. Owner UID preserved in the new Auth project.
- Real Google sign-in succeeded in the hosted preview and survived reload. Browser showed all four current records plus five legacy podcast records.
- A real ChatGPT-authored Meb/Vincent review was saved through the PWA's authenticated API, rendered after reload, and retrieved by the inflation question. Five developed takeaways, 12 attributed claims, five shareable insights; exact citations validated. This is not an independent audit of transcript accuracy or guest attribution.
- Paid model/transcription processing stays disabled. The other three current episodes still require accessible transcripts or a no-paid-service transcription path. Ordinary ChatGPT plugin connection is not accepted until installed/authenticated and exercised through its actual tools. Physical iPhone acceptance and cross-episode synthesis remain incomplete.
- New expiring/revocable connector credentials have unit and actual emulator checks for hashed storage, owner isolation, expiry, scope, revocation and prohibition on credential management by connector tokens.


### Verified private ChatGPT endpoint (2026-10-23)
- Isolated trial preview `knowledge-vault-trial`, deployment `dpl_DffVVVwF3A4d3i1vknuZ2gKpR6aD`, commit `87527d3`, is READY. Existing production is untouched.
- Actual MCP HTTP acceptance passed: anonymous access 401; authenticated initialize; all 10 tools discovered; saved review read; attributed search; duplicate add preserved 4 canonical episodes; revoked token 401. Acceptance tokens were revoked.
- Meb review version 2 saved through the signed-in PWA, with improved exact source excerpts; personal reflection unchanged. Live duplicate-add notice confirmed.
- Private plugin created: https://chatgpt.com/plugins/plugins_6adb9257bbdc8191a0261646b0ecfb79 . Package includes the verified durable endpoint and Bearer API-key configuration, with no credentials. User installation/secure key connection and a real ordinary-conversation tool call remain required; creation alone is not an end-to-end ChatGPT pass.
- Source tests: 41 unit, 4 Firestore integration, 1 workflow, 4 browser checks passed; compiled-server smoke passed. iPhone-sized automated checks are not a physical iPhone installation test.
