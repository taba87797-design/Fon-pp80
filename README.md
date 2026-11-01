# My Homework - p01

Thai homework journal for confirmed project p01 (application port 31111).
Runtime: Node CommonJS, entry server.js, frontend public/. Current release uses MariaDB and anonymous browser ownership.

## Current release: MariaDB and private browser notebooks

- Install with npm.cmd install --ignore-scripts. Start with npm.cmd start after configuring private .env and applying the schema separately.
- Read DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD only from process.env. The local owner's LAN connection and platform-managed runtime connection are different; never copy one over the other.
- GET /api/session sets a 256-bit random HttpOnly, SameSite=Strict identity cookie. The follow-up API request must carry it; cookies-disabled clients cannot read or write homework. Web Locks serializes initial setup across supporting browser tabs.
- Only a SHA-256 owner hash is stored in DB. It never appears in API payloads, URLs, DOM or application logs. All list/item/statistics/calendar/update/delete and import dedup queries are owner-scoped.
- No signup, password, recovery or cross-device sync. People sharing a browser profile share a notebook. Clearing cookies, private browsing or changing browser loses access to the old notebook; existing records are not reassigned.
- Remote hosting REQUIRES an approved dedicated HTTPS hostname, APP_ORIGIN set to that exact origin, and COOKIE_SECURE=true. Without APP_ORIGIN only loopback Host headers are accepted. Shared-IP HTTP is rejected because cookies are not port-isolated. The proxy must preserve the configured Host. Public publication remains disabled.
- Web Locks support in a secure browser context is required. Failed session setup keeps mutations disabled; refresh can retry. One Node process enforces a project-wide 5,000-row cap (including unowned records) and at most 32 pending creates; do not run overlapping writers.
- Persistence is MariaDB in db_std11_p01, table homework_entries. Startup only checks connectivity/schema and NEVER runs migrations. Existing local data/ is preserved and not exposed or automatically imported. The local legacy JSON had zero records when inspected.
- Schema revision 1 was submitted separately through the database Portal after preview. Apply is disabled there; the single CREATE TABLE was executed directly from this workstation with the project owner's DB account after verifying SELECT DATABASE(). Portal applied history remains unknown, not fabricated.
- Server managed env revision 1 was inspected and preserved. It contains platform-assigned runtime DB credentials, not local LAN credentials. Applied revision and deployment verification are still pending.
- Three direct production dependencies: dotenv, express and mysql2. Formal platform Semgrep/OSV/Gitleaks scan gates remain required; npm audit is supplemental only.

## Current verification (2026-11-01)

- Prior MariaDB/API integration: 50 checks passed, including actual CRUD/readback, owner isolation, import deduplication, persistence and cleanup. Prior browser CRUD/edit/refresh/delete and independent-browser isolation also passed. These are prior results, not rerun claims.
- Latest targeted verification: 24 checks passed against the real p01 schema/indexes plus HTTP Host/cookie guards, including IPv6 rejection, wrong-host blocking and full-origin enforcement. Confirmed the earlier browser test record is absent from DB. No DB rows changed in this run.
- Latest browser checks: no horizontal overflow at 375/768/1440px; updated HTTPS notice visible; aborted session bootstrap locks mutations, refresh recovers, HttpOnly identity is absent from document.cookie. No CRUD rerun: current edits affect security guards and notice only.
- Syntax checks passed; npm audit reported zero vulnerabilities. Simulated hostname tests are NOT live HTTPS/TLS verification. Concurrent first-open-tab behavior remains unverified by browser automation.
- MCP confirms env revision 1 unapplied, migration revision 1 accepted with execution unavailable, no deployed release and no scan report. Direct schema execution is not Portal applied history.
- Owner chose to wait for a dedicated HTTPS hostname. No deployment is claimed; live routing, runtime, managed-env application and fresh platform scans remain pending.

## Historical JSON release notes (superseded)

The remaining JSON storage instructions and earlier test results describe the previous release only. They are not instructions or test evidence for the current MariaDB implementation. See DEPLOY.md for current deployment requirements.

## Upload deployment

Follow DEPLOY.md for the five-file upload allowlist, private environment setup, readiness probe, scan gates, smoke tests and rollback. GET /api/health reports read readiness without exposing homework or configuration. It is not an authentication or persistence guarantee. No platform upload/deployment has been performed; private routing, durable storage and blocking scans still require confirmation.

## Local operation

- Use a supported Node.js LTS release. This workspace was tested with Node v24.22.1.
- Install with `npm.cmd install --ignore-scripts` on Windows. Installation lifecycle scripts must remain disabled.
- Configure private `.env`: PORT=31111, HOST=127.0.0.1, DATA_DIR=data, NODE_ENV=production. The supplied values contain no secrets.
- Start with `npm.cmd start`; open http://localhost:31111.
- Run `npm.cmd run check` for JavaScript syntax checks. `npm.cmd audit --omit=dev` checks the installed dependency graph.
- PowerShell may block npm.ps1; use npm.cmd rather than weakening machine execution policy.
- HOST=127.0.0.1 is local-only. Set a platform-approved bind address through managed environment when deploying behind the private project router. Do not guess platform routing settings.

## Features and data

- Persistent create, read, edit, completion status and confirmed deletion through /api/homework.
- Dashboard counts derive from the same /api/homework snapshot as the list; /api/stats remains available. Bangkok date boundaries, overdue display, search and status filtering are supported.
- Google Calendar opens a template for manual confirmation; it does not synchronize or notify automatically.
- ICS downloads contain an all-day event with exclusive next-day end date and UTF-8 line folding.
- Existing localStorage key myHomework is never automatically overwritten or cleared. Explicit import requires HTTPS or localhost and uses a deterministic server-side deduplication key. Invalid legacy entries are skipped, not erased. Reload and retry after partial failures.
- Browser storage is origin-specific: import from the browser/origin holding the original data. A changed hostname or port cannot read the previous origin's localStorage.
- JSON data lives in private DATA_DIR/homework.json. Each successful mutation keeps the previous version in homework.json.bak and atomically replaces the main file. These are not long-term or off-machine backups.
- Back up both files to private storage while the app is stopped; never upload them under public/. To restore, stop the app, preserve the current file, and restore a validated private backup before restarting.
- Invalid existing storage causes startup to fail without resetting it. Resolve the file or permissions issue rather than deleting original data.
- Maximum 5,000 tasks and 8 MiB JSON. Writes are serialized within ONE Node process only. Do not use clustering or multiple instances sharing this directory.
- Deployment requires a durable, writable private project directory. Redeploying an ephemeral filesystem may lose data. Confirm the platform's persistent-storage support before deploying.

## Security and deployment policy

Policy revision 2; hash bef855c538ab3b91967a18c7dcc5cbb73a3cb55c7c0119187c17816d769529a7.

- This is a shared single-project notebook WITHOUT login, per-user authorization, or app-level ownership checks. Anyone able to reach its API can read and modify it. Do not expose it to untrusted users; platform owner/project isolation must be confirmed. Public publication is disabled for this room.
- Only package.json, server.js, public/index.html, public/style.css and public/index.js are application source. Nonexecutable documentation is allowed separately.
- .env is required as private managed configuration, never a source/Git/public artifact. .gitignore excludes .env variants, node_modules, private data and temporary tests.
- Original misspelled packahe.json and packahe-iock.json were removed with user confirmation. Backups in ORIGINAL-BACKUP.md and FRONTEND-BACKUP.md normalize formatting and are not byte-exact originals; do not include these source transcripts in the upload artifact.
- npm generates a local package-lock.json, ignored here because it is outside the room's application allowlist. This limits reproducibility of future installs. Confirm lockfile handling with the platform before deployment; do not bypass the allowlist.
- Two production dependencies: Express and dotenv. Local npm audit reported zero vulnerabilities on 2026-11-01; this does not replace OSV.
- Recheck backend immediately before deployment. Semgrep, OSV and Gitleaks must pass the room's high-severity blocking checks with results no older than 24 hours. They were not installed on this workstation during validation, so deployment scan approval remains pending.
- No DB credentials were inferred. If a database is later required, confirm the current p01 connection details and use server-only process.env variables. SQL migrations must go through the platform database UI, never startup or npm scripts.
- Platform must enforce non-root execution, resource limits (192 MiB), private routing, isolation and retention (365 days including backups).

## Validation performed (2026-11-01)

- JavaScript syntax checks passed; VS Code reported no errors in the five application files checked (package manifest installed successfully).
- Isolated backend integration tests passed: CRUD, statistics, invalid dates/fields/types, cross-origin rejection, 16 KiB request limit, duplicate import, 20 simultaneous creates, persistence using a new storage instance, private-file denial, ICS dates and preservation of corrupted existing JSON.
- Found and fixed DELETE returning 415 without a request body; rerun passed.
- Browser workflow passed: create, edit, mark done, reload persistence, search, filter, cancel deletion, confirm deletion, and repeated legacy import preserving the original browser entry.
- No horizontal overflow at widths 320, 375, 390, 430, 768, 1024, 1280 and 1440 pixels in the test browser. Desktop screenshot inspected.
- Tests used temporary private data, not the real data directory. The isolated browser test server was stopped after validation; a separate local-use server may be running.
- Upload preparation recheck passed: syntax, npm audit (zero reported vulnerabilities), five-file size limits, readiness HTTP 200/no-store and generic 500 on corrupt data, CRUD, date validation, cross-origin rejection, restarted storage reads and private-file denial. Tests preserved corrupt input and cleaned only temporary test data. The deliberate corrupt-data test logged Request failed: SyntaxError as expected.
- Local source edits require restarting an already-running server. During the follow-up review the old p01 process was restarted, /api/health returned ready, list date metadata was verified, and SHA-256 comparison confirmed the real homework.json was unchanged.
- Not verified: platform deployment/router behavior, full browser/device matrix, load/resource ceiling, crash/power-loss durability, cross-process locking, formal Semgrep/OSV/Gitleaks scans, authentication or public release. No PWA/offline service worker or automatic calendar synchronization is implemented.

## Follow-up integration review (2026-11-01)

This section records newly executed results, separately from the earlier validation above. Scope: frontend loading/mutation state, dashboard/list consistency, Bangkok day changes, affected API and actual private JSON storage. No DB is used, so SQL testing is not applicable. No CSS/layout changes were made; the earlier responsive-width results were not rerun or presented as new results.

Fixes: disable mutations during initial loading, derive dashboard and list from one response snapshot, include server Bangkok date in the list response, and refresh overdue/date labels on visibility return and a one-minute check.

| Scenario | Expected | Newly observed result / evidence |
| --- | --- | --- |
| API integration and validation | Correct CRUD, statuses, private-file denial and dates | PASS: inline backend suite reported 52 assertions/HTTP checks, including real disk readback; malformed JSON, invalid fields/dates, foreign Origin, wrong content type and oversized requests rejected |
| Concurrent persistence | No lost writes or duplicate imports | PASS: 20 simultaneous creates retained; 8 identical import requests produced exactly one 201 and seven 200 responses; new storage instance read identical records |
| Corrupt storage | Fail without resetting original data | PASS: health 500, initialization rejected, corrupt bytes unchanged; intentional SyntaxError logged |
| Browser CRUD and retrieval | Edited fields/status survive reload; cancellation retains and confirmation deletes | PASS: Thai text/detail, edited deadline and done status survived reload; cancel retained one item, confirmed delete and reload left zero |
| Search, filters and safe rendering | Correct matches/counts; markup remains text | PASS: pending/done filters and subject/detail search; HTML-like subject rendered literally with no injected image |
| Calendar export | Correct all-day dates | PASS: browser fetch returned ICS 200 with DTSTART 20261102 / exclusive DTEND 20261103; Google template URL had the same date range. External Google account save was not tested |
| Initial-load race | Cannot mutate until snapshot returns | PASS: delayed real GET using browser interception; form disabled before release, enabled after real response |
| Failed save / recovery | Preserve draft and storage, then allow retry | PASS: deliberately aborted POST retained subject/detail and left server count zero; restored network saved exactly one record, verified through API and direct UTF-8 JSON file read |
| Day rollover | Update overdue and date without reload | PASS under simulated browser clock: visibility return on Bangkok 2026-11-04 changed overdue 0 to 1. This is a controlled clock test, not an overnight real-time test |
| Static checks | Syntax clean and no reported dependency vulnerabilities | PASS: npm.cmd run check; npm.cmd audit --omit=dev --ignore-scripts reported zero; editor diagnostics clean for all five application files |

Browser automation on an older hidden tab timed out on pointer/animation checks; the deletion scenario was rerun successfully with normal clicks in a newly opened visible tab. These tool timeouts were not treated as app failures. The backend suite's initial import-status test expectation was corrected before the final passing run. Tests used only isolated temporary data; no real homework was created, edited or deleted. Formal platform scans and private durable hosting approval remain required before deployment. If a normal create loses its response after the server commits, reload and inspect before retrying; ordinary creates do not have an idempotency key.

# Fon-pp80
