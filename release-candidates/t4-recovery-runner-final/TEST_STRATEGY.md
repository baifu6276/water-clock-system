# Recovery runner offline validation

All production actions remain HOLD. No real LINE, Worker, GAS, Pages or Sheets request is used.

## Inputs and execution

- Base main: 34e1cb77a972b1a600d0ea5eed60927fcef15059.
- Backend reference: 7bb207e6e14c1471198bc06a596b4d4805346b04, exact 11-file V50 source read with git show; never copied or executed against a service.
- New tests load the real new client, not a reimplemented state machine.
- Unit/model VM supplies DOM, LIFF, fetch, response and timer mocks. Forbidden browser APIs throw. Fresh token sentinels change on each retrieval.
- Chromium intercepts EVERY URL with context.route; routes only fulfill or abort, never continue. Service workers disabled. LIFF SDK is replaced by a local mock. Network-failure scenarios are route.abort, not a failed real connection.
- Browser console methods are instrumented separately from Chromium's own fixed "Failed to load resource: net::ERR_FAILED" when a mock route aborts. Runtime console calls must be zero; private sentinels must appear nowhere in DOM/logs.
- Worker contract tests import the unchanged main Worker and inject fetchImpl. global fetch fails. Script Properties/Sheets/permit are not touched.
- Existing relay/live-test/staging regressions run unchanged. Existing fixtures inject fetch or intercept all browser routes.

## Requirements mapped to checks

| Guarantee | Tests |
|---|---|
| Fixed dedicated LIFF, query cannot configure operation | Static mutation rejection, Chromium attacker query/hash, LIFF init options |
| Initial LINE/login/token/actor/permission conditions | Unit init/identity matrices; OWNER/ADMIN and role/browser cases |
| Only STARTED/false/MATCHED; no dry-run | Unit status matrices in both PRECHECK and REVALIDATING; static routes |
| Exact RECOVER EMP001 phrase, no trim | Unit/browser phrase variants, forced enabled controls |
| Latch before async/token/fetch | Source ordering, token/fetch reentrant handlers, duplicate/pending browser cases |
| Fresh identity then status then write | Exact ordered request assertions; state/token changes and read timeouts |
| Fresh token; exact seven fields | Every mocked fetch checks payload; actual Worker reconstructed payload assertions |
| Strict six-field success | Missing/extra/wrong value/type matrix, browser malformed/network cases |
| Status never authorizes another write | Post-attempt cases, locked() controls, 1000 randomized document sequences |
| Deadline spans headers and body; late results inert | Virtual 20000ms timeout at revalidation and submission, browser intercepted pending response |
| Flag exact true; server Permit authority | Real Worker flag variants; V50 fixed-byte static recovery branch/claim/finish checks |
| Privacy, zero persistent storage | Static forbidden APIs, VM traps, browser instrumentation/cookies/private sentinels |
| Mobile layout | Chromium 360px viewport, no horizontal overflow |
| Old runtime untouched | Git base blob and checkout-filter comparisons, fixed release artifact hashes |

Model seed: 0x52560001. 1000 independently seeded sequences. Explicit attack tests supplement the model; this is not exhaustive proof of all possible JS execution.

## Optional read metadata

Pinned Worker may return `_gasReadDiagnostics` on read actions. The runner neither renders nor uses its contents. It is the ONLY permitted optional status field; unknown status fields fail closed. Write success remains exactly six fields with no metadata allowed. No new timing parser/UI is introduced.

## Reproduction

Run `python release-candidates/t4-recovery-runner-final/tests/run.py`, then `node release-candidates/t4-recovery-runner-final/tests/static.cjs` and `git diff --check`.
Python/Node plus Playwright and Chromium are required. Set PLAYWRIGHT_MODULE/CHROME_PATH if not using bundled Node modules and Windows Chrome.
The driver writes ONLY this candidate's review/evidence files. It does not stage, commit, modify runtime, or deploy. The base is provenance/ancestor, not a required current HEAD. No containing-commit SHA is embedded.
Evidence records exact local inputs, pinned Git dependency hashes, actual exit codes/counts and normalized output hashes. Only TAP durations, Node PID and checkout prefix are removed from output digests. Rerun twice and compare evidence SHA before release.
Windows Git checkout filters may convert pinned LF blobs to CRLF; release hashes and exact local checkout hashes are recorded separately. Existing files must match their baseline checkout bytes and remain Git-unchanged. No line-ending rewrite of existing files is permitted.

## Limits

Human-provided Production V50/status/permit/flag state is not reverified here. Offline success does not authorize enabling Worker, deployment, changing LIFF Endpoint or Production RECOVER_ORIGINAL. A page refresh/new tab creates a new document: no persistence is intentionally used. The page warns against both; server Permit and status enforce final authority. Script Properties and Sheets are not a transaction.

Original pinned regression includes byte-equality assertions against historical LF sources. Its disposable runtime exports therefore use exact fixed main Git blobs (not CRLF checkout copies); source provenance is recorded. Direct current-worktree tests still test the unchanged actual checkout. No assertions or runtime bytes were relaxed or rewritten.
