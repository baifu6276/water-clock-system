# T4 one-shot RECOVER_ORIGINAL runner — offline candidate

Production Recovery remains HOLD. This branch is NOT a deployment or authorization to execute.

## Provenance and scope

- Branch: codex/t4-recovery-runner-final.
- Fixed current-main base: 34e1cb77a972b1a600d0ea5eed60927fcef15059 (remote verified before editing).
- Fixed V50 backend: 7bb207e6e14c1471198bc06a596b4d4805346b04.
- New deployable files ONLY: transport-v2/t4-recovery-runner/index.html and client.js.
- All new tests/docs/evidence live under release-candidates/t4-recovery-runner-final/.
- No edits to old migration runner, read-only live-test/config, Worker, GAS, production homepage or other existing tracked files.
- Git's Windows checkout filters produce CRLF for old files. Static checks verify those exact checkout bytes against base filters, require zero tracked modifications, and separately verify pinned Git artifact hashes. No old file was rewritten to make a hash pass.

## Design and behavior

This is an isolated continuation of ONE original fixed request, never a new baseline operation. Dedicated LIFF is pinned to 2011467618-QZYsTwb9; read-only LIFF remains 2011467618-R76314It. No query/hash/config override or persistent storage.

Initialization only runs LIFF init and token-availability checks. It sends zero application API requests. A manual precheck calls identityBootstrap followed by employeeLifecycleBaselineRequestStatus for the fixed requestId. Only ACTIVE_EMPLOYEE / EMP001 / OWNER or ADMIN plus STARTED / historicalCompletion=false / MATCHED / both Allowed=false reaches READY. There is no dry-run action.

READY is NOT backend authorization. Exact untrimmed phrase RECOVER EMP001 and a separate final human approval are required. The page explains server generation-2 Permit authority and separately approved Worker flag.

Recover click synchronously sets attempted=true and busy=true before token retrieval, Promise creation, await, identity/status read or write fetch. A second private writeSent latch is consumed before the write token/fetch. DOM force-enable and reentrant handlers cannot bypass either guard.

Flow:
PRECHECK -> READY -> REVALIDATING -> SUBMITTING -> SUCCESS or WRITE_RESULT_UNKNOWN.
REVALIDATING always obtains a fresh token and verifies identity, then a fresh token and original request status. Both must still meet the same exact conditions. Failure consumes this document's chance with ZERO write POST. No terminal path transitions to READY/PRECHECK.

Write reconstructs exactly seven keys: action, idToken, employeeId, requestId, expectedSnapshotVersion, reason, confirmed. It sends employeeLifecycleBaselineMigrate, EMP001, original c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab, original f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd, original fixed reason, true and a newly obtained current LIFF token. No recoveryMode/generation/diagnostics field is sent.

Success requires exactly six fields and values: success=true, EMP001, original requestId, baselineState=RECORDED, numeric version=1, recoveryStatus=COMPLETED. Extra/missing/incorrect fields become WRITE_RESULT_UNKNOWN. There is no resend.

After attempt, manually requested same-request status may report STATUS_COMPLETED (COMPLETED/true/MATCHED), STATUS_STARTED (STARTED/false/MATCHED, STOP), or STATUS_RECOVERY_REQUIRED (RECOVERY_REQUIRED/CONFLICT, STOP). UNKNOWN, NOT_OBSERVED, ABSENT, PARTIAL, malformed, unknown fields, network/timeout all STOP as WRITE_RESULT_UNKNOWN. None grants another write.

Pinned Worker optionally supplies _gasReadDiagnostics on reads. This known optional status metadata is ignored, never rendered or used for decisions. Every other unknown status field rejects. Write response still rejects all extra fields. Expected Worker version is strictly t4-safety-2-gas-read-diag, including post-attempt reads; no fallback is added.

## Fixed contracts inspected

V50 employeeBaselineMigrate_: original logs are checked for actor/action/hash, employeeBaselineStatusEvidence_ runs, STARTED with one format-4 receipt is required, then employeeBaselineClaim_(..., 'RECOVER_ORIGINAL'), then employeeBaselineFinish_(context, logs[0]).
EmployeeBaselineClaim_ reads private server control, requires ARMED / matching mode / requestId / requestHash / snapshot / operator / role, and persists CLAIMED before Sheet writes. The browser neither reads nor changes Permit. No V50 source was copied into main or altered.

Current-main Worker has the existing fixed write route, exact-string true opt-in, fixed operation and exact seven keys. It reconstructs write payload without _transportDiagnostics and retains its 20-second deadline and no retry. Tests invoke this exact Worker with fake upstream responses; they do not call a deployed Worker.

## Privacy and network behavior

POST text/plain;charset=utf-8; redirect=error; credentials=omit; cache=no-store; referrerPolicy=no-referrer; per-request 20-second deadline covering fetch/body. Late completion after deadline cannot update state or send a write. No automatic retries/fallback/polling.
No token/sub/raw exception/response/body display or logging. Text uses textContent. No storage/cookies/analytics/GAS URL/new ID. Explicit fixed client.js?v=t4-recovery-original-1. Mobile 360px checked; long identifiers wrap.

## Verification

See TEST_STRATEGY.md, TEST_RESULTS.json and evidence/inputs.json for executed commands, precise inputs, actual counts and test mapping. Full rerun: python release-candidates/t4-recovery-runner-final/tests/run.py. Static: node release-candidates/t4-recovery-runner-final/tests/static.cjs.

New coverage includes typed phrase, authorization, changed fresh identity/status, headers/body timeouts, double-click/reentrancy, exact success schema, all terminal statuses, forbidden storage/logs and fixed operation. Model seed 0x52560001 executes 1000 document event sequences.
Existing relay/read browser/old runner/compatibility/GAS contract and hardening regressions are rerun without edits. Full previous harnesses are exported temporarily from fixed Git refs, not duplicated into this candidate. Evidence counts are executed tests/groups, not a claim of exhaustive mathematical state coverage.

During development, a newly appended test line had CRLF mixed with LF; it was normalized and a permanent new-file whitespace check added. Chromium exposed a 360px heading overflow; only the new page's wrapping was fixed. The offline harness distinguishes Chromium's own fixed resource-load failure on a deliberately aborted mock route from runtime console calls (which must remain zero). No runtime security rule was relaxed to make tests pass.

Evidence contains no containing-commit SHA/self-reference. Pinned inputs and normalized output hashes are sealed; repeated runs must produce identical evidence hash. TAP timing/footer durations and temporary checkout/PID text are removed only from output digests, not status/assertion results. Prior failed development attempts are not claimed as passing executions.

## Final executed result

Full run: **4183 PASS / 0 FAIL / 0 SKIP**.

- New unit/negative matrix: 175.
- New recovery model sequences: 1000 (seed 0x52560001).
- Real Worker + fake upstream contract: 19.
- New real Chromium: 35.
- Existing Relay: 273.
- Existing read browser including old cross-branch contract: 269.
- Existing Worker hardening: 1256.
- Existing migration runner model: 1000.
- Existing Pages/rollback: 12.
- Pinned migration transport: 71.
- Pinned old migration runner Chromium: 56.
- Pinned read compatibility: 10.
- Pinned V48 GAS rejection contract: 7.
- Static/provenance/privacy/syntax: PASS, not counted as test cases.

All 14 final suite output digests match the prior repeated passing runs. Two complete runs of the final LF/static-gated inputs each passed 4183/0/0 and produced identical evidence SHA-256 ef2a8f27b487e39064abcc6758de91e27b0d615744766045c7363bc4eb53abce. Authoritative exact counts/commands/hashes are in TEST_RESULTS.json and MANIFEST.json. No test was deleted or skipped. All new source files are additions; total scope is 18 files: 2 runtime, 7 tests/rerun scripts, 9 review/evidence artifacts.

## Human release stop and remaining limitations

No P0/P1 known after the passing final checks. P2: frontend latch is one-document only and intentionally not persistent; refreshing or a new tab creates a new document. Page explicitly prohibits doing so after click. Backend Permit remains final authority, including changes between the fresh checks and the write. A timeout does not prove no backend write occurred. Only original-request read-only status and separately approved human investigation may follow.

User-reported Production GAS V50, STARTED/MATCHED, ARMED RECOVER_ORIGINAL generation 2 and absent Worker flag were NOT verified through Production calls. Script Properties and Sheets are not transactions. Offline tests do not prove Production completion.

Publishing this new path, changing the dedicated LIFF Endpoint, platform checks, enabling Worker, and executing Recovery each require separate explicit human authorization. This task performs none. Never create another requestId or retry Migration.

No PR, merge, deploy, Pages Production change, Production request, LINE/Cloudflare/GAS/Sheets operation, Worker flag/Script Property/Permit change, Recovery execution or Migration retry.


Original pinned regression includes byte-equality assertions against historical LF sources. Its disposable runtime exports therefore use exact fixed main Git blobs (not CRLF checkout copies); source provenance is recorded. Direct current-worktree tests still test the unchanged actual checkout. No assertions or runtime bytes were relaxed or rewritten.

READY FOR HUMAN REVIEW
