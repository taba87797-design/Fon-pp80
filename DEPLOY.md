# Deployment runbook - p01

## Current MariaDB release

Status: implementation/testing in progress; no application deployment has been performed.

- Confirmed project room1/std11/p01; saved GitHub link https://github.com/taba87797-design/Fon-pp80; use main after authorized commit and push. Do not deploy a README-only repository.
- Git application artifacts: package.json, server.js, public/index.html, public/style.css, public/index.js. Documentation is allowed; exclude .env, migrations.sql, node_modules, data, lockfiles, editor tasks and source-backup transcripts.
- Install with lifecycle scripts disabled. Runtime is node-commonjs/server.js/public, non-root, memory ceiling 192 MiB; Public stays off.
- Backend uses MariaDB, not JSON. Required env: PORT, NODE_ENV, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD. Optional HOST overrides bind address (default 0.0.0.0); local .env retains 127.0.0.1.
- Remote operation requires an actual approved dedicated HTTPS hostname, APP_ORIGIN set to its exact origin and COOKIE_SECURE=true. Preserve Host through the private proxy. No APP_ORIGIN means loopback-only access. Shared-IP HTTP is rejected: cookies do not isolate ports. Do not remove this gate or invent a hostname.
- A secure-context browser with Web Locks is required. Run one Node writer only; project capacity is 5,000 rows including unowned records, with at most 32 queued creates. Failed bootstrap disables mutations but leaves refresh available.
- Owner confirmed on 2026-11-01 that no dedicated HTTPS hostname is available and chose to retain the private design and wait. Deployment is blocked until that route exists; do not queue a known-unusable release.
- Preserve managed runtime env and its revision; never replace platform DB identity/host/password with local owner connection values. Managed revision 1 was present, not yet confirmed applied.
- DB db_std11_p01 initially had no tables. Migration 001 creates homework_entries. Revision 1 was saved through Portal preview; Portal Apply is disabled. It was executed directly with the owner's project DB account after SELECT DATABASE(). Do not rerun or claim Portal applied history is known.
- Never run schema creation/seeding from server.js or npm startup. Preserve existing records and unowned legacy data; no reset/drop/truncate.
- Private browser identity uses random HttpOnly/SameSite cookies and server-side owner-hash predicates. Same browser profile shares identity; no account recovery or cross-device sync. Require platform isolation and approved private routing as well.
- Before deployment, run affected browser/API/DB integration tests, cross-owner read/write/delete/ICS denial, owner-scoped dedup, persistence and private-file denial. Use only own disposable records. Record exact expected/actual results separately from historical JSON tests.
- Push only reviewed changes on main, verify remote commit, then deploy the saved GitHub URL. Require fresh high-blocking Semgrep/OSV/Gitleaks results; inspect job to completion, env applied revision, status, logs and actual private URL. Syntax/audit alone are not approval.
- If Git author identity/push authorization, Portal access, scanner or runtime is blocked, report it and leave deployment pending rather than bypassing the gate.

### Verification and remaining gates (2026-11-01)

- Prior integration evidence: 50 real MariaDB/API checks and browser CRUD/refresh/isolation passed. See README for scope; do not substitute historical JSON tests.
- Current targeted stage: 24 checks passed for actual schema/indexes, prior test-record cleanup, Host validation, cookie flags and full-origin checks. Read-only DB verification; no destructive SQL or schema rerun.
- Current browser stage: widths 375/768/1440 have no horizontal overflow; session failure disables writes and refresh recovers; HttpOnly identity stays hidden. No data flow changed in the latest notice edit, so CRUD was not repeated.
- Concurrent first-open tabs and actual dedicated-host HTTPS remain unverified. Host simulation is not TLS verification. Syntax and npm audit passed (zero findings); MCP platform scan report is not_scanned, gate unknown.
- MCP status: unprepared/stopped with no release. Managed env revision 1 is unapplied and preserved. SQL revision 1 is accepted, executionAvailable=false, appliedRevision=null; schema exists from authorized direct owner-account execution.
- Deployment gate: owner explicitly chose to retain private identity and wait for a real dedicated HTTPS hostname. Do not fake APP_ORIGIN, weaken Host restrictions, publish publicly or deploy an unusable IP-only release.

## Archived JSON runbook (superseded; not current deployment instructions)

Status of the historical release: PREPARATION ONLY. No upload or server deployment had been performed.
Target: room r0001 / membership r0001_u11 / project p01 / application port 31111.
Policy revision 2, hash bef855c538ab3b91967a18c7dcc5cbb73a3cb55c7c0119187c17816d769529a7.
Public publication is disabled. Use only the platform's approved private project route.

## 1. Required platform confirmations (stop if unknown)

- Select p01 explicitly in the current project list. Do not select legacy.
- Confirm supported Node LTS runtime for node-commonjs, server.js entry and public frontend directory.
- Confirm the platform-provided HOST/bind address, project working directory, and private route. Loopback may not be reachable from a container proxy; 0.0.0.0 must not be chosen without platform confirmation. No deployment URL is inferred here.
- Confirm the proxy preserves the original Host header. Unsafe API requests compare Origin.host with Host. Do not disable the check or trust arbitrary forwarded headers to resolve a 403.
- Confirm durable private writable storage under the project's directory and how it survives uploads/redeploys. DATA_DIR must be project-relative, not public or a child of public, with no symlink escape. External absolute mount paths are not supported by this backend.
- If the platform replaces the entire project filesystem or cannot preserve DATA_DIR, STOP: this JSON storage design is not safe to deploy there. Arrange approved persistence or separately implement the confirmed p01 database integration.
- Confirm platform owner/project access control before exposing any route. This app has NO login or per-user authorization. Private visibility alone is not proof of authorization. Any reachable client can use the API.
- Confirm non-root execution, one process/one instance, 192 MiB resource limit, no control-plane access, install lifecycle scripts disabled, and retention <=365 days including backups. Avoid overlapping old/new processes using the same JSON file.
- Confirm existing local homework should remain local or be migrated through an approved private data transfer. Source upload does not transfer data/ or browser localStorage.

## 2. Upload artifact

Upload only these five application files, preserving paths and exact filename case:

- package.json
- server.js
- public/index.html
- public/style.css
- public/index.js

Every file must be <=1,048,576 bytes. All five should be included in each release to avoid mixed frontend/backend versions. Only two direct production dependencies are currently declared, below the limit of 30.

Do NOT upload the whole workspace. Exclude .env, .env.example, .vscode/, node_modules/, data/, temporary test files, package-lock.json, old misspelled manifests, Git metadata, logs, and source-backup documents from the application artifact. Nonexecutable documents such as this runbook may be attached separately if the platform supports documentation; they are not application source. Never put private config or storage in public/.

The local generated package-lock.json is outside this room's application-source allowlist. Do not use npm ci without an approved uploaded lockfile. Dependency versions use ranges, so the server installation may resolve differently from local tests. Require platform scans of the actual resolved dependency graph on every release. Ask the administrator about approved reproducible-install support rather than bypassing the allowlist.

## 3. Private environment and runtime configuration

Create/configure the required .env through the platform's private managed-environment mechanism, separately from source upload. Preserve any platform-injected PORT and do not expose .env in source artifacts or logs.

| Setting | Value or requirement |
| --- | --- |
| runtime preset | node-commonjs |
| entry | server.js |
| static directory | public |
| working directory | project root containing package.json |
| start command | node server.js (npm start is equivalent) |
| install command | npm install --omit=dev --ignore-scripts |
| PORT | 31111, confirmed for p01; revalidate in current project settings |
| HOST | platform-confirmed address; 127.0.0.1 is the existing local-only default |
| DATA_DIR | data only if confirmed durable/private/writable; otherwise an approved relative directory |
| NODE_ENV | production |
| instances | 1, no clustering/overlapping writers |
| readiness path | GET /api/health |

These application values contain no secrets. No DB environment values are needed: this release does not use MariaDB, even though p01 has a provisioned database. Never reuse legacy DB credentials or connect with root. Any future SQL migrations must use the platform database UI only.

Health response: HTTP 200 with success=true and status=ready after reading and validating storage. A storage failure returns a generic HTTP 500 without data or configuration. This is a read-readiness probe, NOT proof of write permission, authentication, resource headroom or durable persistence. It reads the whole bounded JSON file; use a moderate platform-approved probe interval (for example 60 seconds), not a high-frequency load loop.

## 4. Preflight gate

1. Stop edits and identify the exact five-file release. Record release timestamp and SHA-256 digests privately for comparison with the uploaded files.
2. Run npm run check and npm audit --omit=dev against the local installed dependencies. Local npm audit is supplemental, NOT equivalent to OSV.
3. Recheck the backend: input validation, POST/PATCH/DELETE, origin rejection, static allowlist and private-file denial, safe storage paths, concurrent writes and restart persistence. Use isolated test data, not production records.
4. Back up existing server data privately using the platform-approved method before replacing source. Stop the app first for a consistent backup. Preserve homework.json and its previous-version .bak if present. Do not treat the in-directory .bak as an independent backup.
5. Upload the five source files to p01. Keep public OFF and do not start/open a user route until access isolation and deployment gates pass.
6. Require successful Semgrep, OSV and Gitleaks scans in high-severity block mode, attached to this exact uploaded release and actual dependency graph. Results must be <=24 hours old. A missing, timed-out, failed or stale scan is NOT approval. All three scanners were unavailable locally during preparation; use the platform scan queue.
7. If source/dependencies change after scanning, scan the new release again. Local syntax/audit success is not authorization to bypass blocking scans.

## 5. Private start and smoke test

1. Configure the approved private environment, resource limits and persistent directory; start exactly one instance after gates pass.
2. Inspect sanitized platform startup logs. Startup should identify p01 and port 31111. If it fails, inspect permissions/config privately; do not reset existing JSON or paste environment contents into chat.
3. Via the confirmed private route, check /api/health, /, /style.css and /index.js. Expect HTTP 200.
4. Check /.env, /server.js, /package.json and /data/homework.json: expect 404. Verify no other platform static route exposes project files or source artifacts.
5. Create a clearly labeled smoke-test task, edit it, change status, download ICS and delete it. Confirm dashboard/search/filter behavior. Do not alter existing homework for testing.
6. To verify persistence, create a disposable marker task, restart the one instance, confirm it remains, then delete it. Separately verify the platform's redeploy preservation procedure before relying on it; process restart alone does not prove redeploy durability.
7. Check platform owner isolation using its approved procedure. Keep routing blocked if unauthorized callers can access the API.
8. Record actual scan IDs/times, source hashes, dependency resolution, private-route test result, storage confirmation, runtime version and approval. Never include passwords or complete managed environment dumps.

## 6. Failure and rollback

- If scans fail, remain private/stopped and fix findings; do not override policy.
- If POST/PATCH/DELETE fails with 403 behind a proxy, verify original Host and Origin routing. Do not enable permissive CORS or remove origin validation.
- On storage/startup errors, stop the app and preserve current files before investigation. Do not replace corrupt data with an empty array.
- Roll back only through an approved prior five-file release whose scans remain valid, or rescan it. Preserve current data separately first. If storage format compatibility is uncertain, do not start the old release against current data.
- Restore data only while stopped, after explicit owner approval and validation of a private backup. A data restore may discard newer changes; source rollback alone should not overwrite data.
- Never run a second instance during rollback. No public release is permitted in this room.

## Preparation evidence

Local syntax/dependency checks and isolated readiness/CRUD tests are recorded in README.md. They are local verification only, not platform deployment approval. Platform HOST, private route, persistence guarantees, supported runtime version, owner isolation and blocking scan approval remain pending until confirmed by the platform/operator.
