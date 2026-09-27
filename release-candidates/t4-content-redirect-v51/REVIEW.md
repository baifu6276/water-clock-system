# V51 ContentService redirect / recovery clarity — offline review

Production recovery remains **HOLD**. This patch is not authorization to retry.

## Provenance and evidence limits

Base: `16bf1e13c6afc86d0701e0d3441ca1cdd9fcf57b` (remote main verified before creating this branch).
V50 GAS reference: `7bb207e6e14c1471198bc06a596b4d4805346b04`, eleven original sources retained unchanged.
No GAS source is copied or modified here. Existing migration runner and read config remain unchanged.

The user's Production observations indicate the prior Recovery migrate POST did not reach GAS: the document latch was consumed, the permit remained ARMED generation 2, no new claim/completed audit appeared, and only two nearby doPost executions were observed. Fresh pre-write identity/status revalidation is the strongest supported failure location. These observations were supplied by the user, not re-observed by these tests; they do not establish an exact request-to-execution correlation or identify which fresh read failed.

A later read returned REDIRECT_HOST_DENIED at REDIRECT_GET_HEADERS after one hop. Repository code proves that the previous Worker denies all parsed hosts except script.googleusercontent.com, including the user-approved dynamic form. The actual rejected Production Location/hostname was not supplied. The patch tests the approved hypothesis; it does not prove the exact Production redirect URL, repair a measured latency problem, or authorize another recovery attempt.

## Exact runtime change

Five files only:

- Worker relay: transport version becomes `t4-safety-3-content-redirect`; add one host predicate; replace exact-host check with that predicate; require parsed pathname `/macros/echo` in the existing component check.
- Read frontend client: add the new version to the two existing capability lists, retaining all prior versions.
- Read frontend HTML: fixed client cache-buster only.
- Recovery client: pin the new version; catch before writeSent becomes PREWRITE_STOP, otherwise retain WRITE_RESULT_UNKNOWN.
- Recovery HTML: fixed client cache-buster only.

The exact runtime patch is in `evidence/runtime.patch`; static reconstructs these exact changes from base and rejects any other bytes.

Allowed parsed hosts are exactly `script.googleusercontent.com` or `^n-[a-z0-9-]+-script\.googleusercontent\.com$`. No wildcard suffix trust. HTTPS, empty parsed port/credentials/hash, and exact `/macros/echo` are required. Query is opaque and forwarded only as part of the validated Google URL. URL parser normalization remains unchanged: case is normalized, explicit default HTTPS :443 becomes an empty port, and a bare # becomes an empty fragment. Non-default port and nonempty fragment/credentials are rejected. This does not add a raw-URL normalization policy.

Redirect predicate precedence remains limit → 302/303 → absolute URL parse → HTTPS → host → components (now including path). Three redirects maximum. Every post-redirect request is a newly constructed GET with no body or headers, credentials omit, redirect manual, cache no-store. Initial incoming Cookie/Authorization are not copied. No automatic follow/retry/fallback. The shared 20-second deadline is unchanged.

The existing four routes and exact-string write flag remain unchanged. Controlled writes retain the fixed seven-key payload with no _transportDiagnostics. Worker business JSON passthrough is unchanged; it is not a generic business-data sanitizer. Existing clients render approved fields only, and diagnostics never copy upstream URL/body/headers/exception values.

## Runner state proof and limits

attempted is set synchronously before any await/token/fetch. The document never returns to READY/PRECHECK after that point.

- Fresh identity/status transport or validation failure, while writeSent is false: PREWRITE_STOP, zero migration POST, exact approved Chinese stop message.
- writeSent becomes true before migration token retrieval/fetch: any subsequent failure remains WRITE_RESULT_UNKNOWN (including a token failure that prevents fetch, conservatively).
- Only the exact six-key success response becomes SUCCESS.
- Post-attempt status reads remain possible and never reopen writes. A later status error may show the existing generic unknown status; it never resets attempted/writeSent or grants retry.

No LIFF ID, employee, requestId, snapshot, reason, confirmation phrase, migration payload, success shape, permit, backend, or timeout changes. No browser storage, cookies, profile/sub/token logging, raw exception rendering, or query-derived operation inputs.

The old migration runner is deliberately unchanged: it rejects the new Worker version before write. It is not the V51 recovery UI. Read frontend supports both old and new versions; recovery runner intentionally requires this exact Worker version.

## Test reproducibility

Run `python release-candidates/t4-content-redirect-v51/tests/run.py` using Python 3, Node 24, Playwright and local Chrome. Set PLAYWRIGHT_MODULE / CHROME_PATH if needed. All browser requests are fulfilled/aborted locally and Node network APIs are guarded. No platform calls are made.

Two complete identical-input reruns each produced **5,284 PASS / 0 FAIL / 0 SKIP**, with the same evidence SHA-256 `9ca3357c56e8e87f28cd3ab9c5958ab8c252ae39e1300f9ceabdd01446e548af`. New redirect/fuzz 1,050; new prewrite 27; read version matrix 24; existing/adapted regression 4,183. Static/provenance, syntax, HTML and diff checks PASS.

The driver records exact local/pinned input digests, test-only adaptations, command exits/counts, and normalized output digests. It works at base with modifications or committed descendants; HEAD need not equal base. No evidence field contains a future containing-commit SHA.

Existing tests are not changed in the repository. A disposable fixture mirror adapts expected Worker version and PREWRITE_STOP classification, retaining all assertions and zero/max-one write checks. Synthetic success redirects using `/`, `/echo`, `/private` or `/PRIVATE_PATH` are set to `/macros/echo`; these fixtures are not Google provenance. Their former paths now have explicit denial coverage. Existing negative host/component/status assertions remain. Full adaptation diff is `evidence/adaptations.json`.

Suites labeled pinned/prior run the original unchanged migration runtime with its matching prior Worker. They do not claim the old migration runner supports V51. Candidate Worker tests, recovery tests, host fuzz, and current read-browser tests run the new artifacts. TEST_RESULTS records these categories separately. Static checks do not inflate case totals.

## Human release gates, not executed

No deployment has occurred. After separate review/approval and any future deployment, keep the Worker write flag ABSENT. Measure Production read-only latency separately before considering recovery. The 20-second timeout is not increased here. Any recovery execution requires fresh explicit human approval and the existing server permit checks; this patch grants neither.

P0/P1 found in the completed offline patch: none. Remaining Production uncertainty (P2 / acceptance gate): exact rejected host was not captured; real read-only acceptance/latency is still required. Offline tests cannot prove Production latency or authorize retry. Recovery HOLD.
