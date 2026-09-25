# V44 read diagnostics — human review candidate

Production Migration: **HOLD**. Local candidate only; no deployment, permit,
Script Property operation, Production request, or business-data write was performed.

## Source provenance

The ten files in `evidence/v44-sources/` are exact copies of the previously saved
V44 export. Each digest is pinned in `tests/package-candidate.cjs`. The old export
manifest records `projects.getContent(versionNumber=44)` provenance; the export
itself has no intrinsic version field. This is not a fresh Production source check.

Export SHA-256: `804c166e5b6e77ea9b4286d7a5bc9d26f9fe7216eb44aa86a6930c41cf0a6ca4`.
No current-main GAS, V45 candidate, or T4 control source was imported.

Worker branch: `codex/t3-gas-read-diagnostics`, base
`c4ba55ca147da676759d7098f60ce4a4e31a77d3`.
Frontend branch: `codex/t3-gas-read-frontend`, base
`ebe52b07ee307f4b615af478775c32f0ceb99ef3` (current main at implementation).
The branches remain separate; this Worker artifact is not a main integration PR.

## Exact source matrix

| File | Status | Modified existing functions |
|---|---|---|
| EmployeeApplication.gs | MODIFIED | employeeFoundationRequest_, handleEmployeeFoundation_ |
| EmployeeLifecycleBaseline.gs | MODIFIED | employeeBaselineRequestStatus_ |
| 程式碼.gs | UNCHANGED | None |
| EmployeeIdentity.gs | UNCHANGED | None |
| EmployeeLifecycleStore.gs | UNCHANGED | None |
| EmployeeApplicationAdmin.gs | UNCHANGED | None |
| EmployeeLifecycleRead.gs | UNCHANGED | None |
| EmployeeLifecycleMutation.gs | UNCHANGED | None |
| appsscript.json | UNCHANGED | None |
| index.html (GAS HTML) | UNCHANGED | None |

Added/removed GAS files: **0 / 0**. `EmployeeBaselineControl.gs` is absent.
Four private helpers were added within EmployeeApplication.gs:
`employeeReadDiagnosticInput_`, `employeeReadDiagnosticEnabled_`,
`employeeReadDiagnostics_`, `employeeReadDiagnosticResponse_`.
Original migration/mutation functions remain unchanged. This does not disable
V44's existing business APIs; only the added diagnostic feature is read-only.

`source-manifest.json` contains all ten base/candidate SHA-256 values, byte sizes,
changed/added function names, and both complete source-bundle digests.
Bundle algorithm: sort all ten filenames by JS ordinal order; concatenate each
UTF-8 filename, NUL, ASCII decimal byte length, NUL, and exact file bytes; SHA-256
that byte sequence. It covers all deployable sources, not this document or tests.
The candidate `.gitattributes` prevents Git newline normalization of source/evidence.

## Contract and safety

Worker version: `t3-4-gas-read-diag`. Exact routes:
`/identity`, `/employee-read`, `/employee-operation-status`.
Original browser request keys stay unchanged. After validation Worker injects
`_transportDiagnostics: { version: 1, traceId: correlationId }`.
UUIDs are random, canonical lowercase v4, and unrelated to tokens or requestId.

GAS accepts the namespace only for identityBootstrap,
employeeLifecycleBaselineDryRun and employeeLifecycleBaselineRequestStatus.
Malformed metadata and all non-read actions carrying it receive fixed
VALIDATION_ERROR before business dispatch. The reserved namespace is intercepted
before legacy routing, so legacy write actions cannot silently ignore it.
Only this namespace is separated; other unknown fields are not silently discarded.
Metadata never enters business context, snapshot, hash, audit, or Sheets.

`READ_DIAGNOSTICS_ENABLED` must equal the exact string `true`. Absent, false,
invalid, or read failure disables diagnostics, while metadata validation/separation
remains active. The code never writes Script Properties.

Exposure requires verified active OWNER/ADMIN. Status revokes exposure immediately
inside the acquired lock and restores it only after context and reviewer validation.
Unregistered/inactive/EMPLOYEE/SITE_MANAGER and pre-authorization errors get no
diagnostics. Authorized action errors and lock-unavailable UNKNOWN may include it.

Five exclusive stages: VERIFY_LINE, EMPLOYEE_CONTEXT, ACTION_READ, LOCK_WAIT,
RESPONSE_PREP. Context intervals accumulate before bucketing. Clock errors disable
diagnostics only; there is no fallback clock. Total starts immediately before verify,
after metadata and property lookup, and ends at freeze's final sample. RESPONSE_PREP
starts after business/safe-error result construction. Final JSON serialization,
ContentService, platform delivery and redirect GET are excluded. No second response
serialization is added for measurement. GAS never reports a TIMEOUT bucket.

Worker removes raw `_gasReadDiagnostics`, validates exact fields, buckets and UUID
matching its correlation ID, then reconstructs only the fixed safe fields. Invalid
diagnostics are omitted without changing other business fields. No logging, storage,
retry, fallback, timeout increase, redirect relaxation or write route was added.

Frontend preserves t1-1, t3-1, t3-2-status-only, t3-3-timing-diag, t4-safety-1
capabilities and adds t3-4-gas-read-diag. It displays only fixed bucket labels;
invalid/absent/mismatched diagnostics show 無法取得. No new trace display exists.
Client cache version is fixed at `client.js?v=t3-4-gas-read-diag`.

## Offline validation

See `tests/TEST_RESULTS.json` for executed commands, counts and resolved test-harness
issues. `foundation-regression.cjs` derives from the existing 89-group suite at
`c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd`. Its loader maps Code.gs to the original
V44 程式碼.gs and loads this candidate's files; the legacy-source check now compares
exact V44 bytes. Production frontend syntax is validated in its own artifact.
The fixture can be imported without running the regression groups.

All LINE/GAS/Sheet services in tests are mocks. Browser URLs are intercepted.
Cross-artifact tests use actual candidate GAS and Worker code plus actual frontend
from the separate worktree. Negative tests cover incorrect rollback order, a GAS
execution followed by a timed-out redirect GET, and permission loss under lock.

## Release and rollback — instructions only, not executed

After separate human approval: offline review/tests and exact hash validation;
manually update the existing GAS deployment ID to a new version with flag off;
publish frontend first and confirm Pages/client version; deploy the read-only Worker;
manually enable READ_DIAGNOSTICS_ENABLED. At most identity, then successful dry-run,
then successful status; any failure or unavailable required diagnostics means STOP.
No Migration or permit operation is authorized by this candidate.

For diagnostics-only disablement, set the flag false. For Worker failure, restore
3b6efb31 (t3-3), or the approved b7f72c2f baseline (t3-2). To restore GAS V44, first
stop tests and restore a Worker that does not inject the namespace, then update the
same GAS deployment back to V44. New Worker + old V44 status is intentionally
incompatible: old status strict-input validation rejects the namespace. No retry or
automatic fallback conceals this. New frontend can remain during rollback.

## Limits

Root cause is not proven. A Worker timeout can prevent GAS JSON diagnostics from
arriving. Date.now is not monotonic; backward values are rejected but forward jumps
cannot all be distinguished from elapsed time. Coarse buckets exclude pre-entry
platform time and final delivery, and ACTION_READ does not separate individual
Sheet latency. A 10–20 second read does not establish Migration deadline margin.
Production Migration remains HOLD.
