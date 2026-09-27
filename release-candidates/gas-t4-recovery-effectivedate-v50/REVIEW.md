# V50 T4 effectiveDate recovery candidate — READY FOR HUMAN REVIEW

Production recovery remains HOLD. Worker flag ABSENT is user-supplied state, not remotely verified here.
No Production service was contacted. All Sheet/permit/LINE operations in tests are in-memory mocks.

## Branch and fixed provenance

- Branch: `codex/t4-recovery-effectivedate-v50`
- Base: `0f3b154cff1e4788afb61c9684d792b2fb02531c`
- Source: that commit's `release-candidates/gas-t4-recovery-channelid-v49/sources/`.
- Eleven deployable source files; only `EmployeeLifecycleBaseline.gs` differs from V49, exactly +12 / -1.
- Other ten source files are byte-identical. Existing V49/V48 candidates and repo runtime paths are untouched.
- Generic identity/audit/store/date/comparison/hash helpers, dispatcher, claim/permit, locks, checkpoints/flushes, strict input, requestId/snapshot/reason and v3 paths are unchanged.

## Forensic proof retained

The original forensic evidence is preserved byte-for-byte, including its historical 4 PASS / 2 FAIL results.
`evidence/seal.json` still verifies the original forensic bundle:
`469531b65e4ed463b8359d7aca40f35605f22ab3fe57014140ba835d2ab5e1ad`.
The original stopped REVIEW and failing test source are retained under `evidence/pre-approval/`.
The current forensic test suite preserves the four V49 controls and runs the two newly approved assertions against V50.
The historical FAIL records describe the prior V49 policy; they are not the current V50 run result.

The fixture produces the observed checkpoint through real V48 functions, with synthetic identity/master and real SHA-256.
Sheet mocks return actual same-VM Date instances for audit effectiveDate and employment baselineDate.
The real `employeeRowObject_` converts those through `toISOString()`:

| Representation | Value |
|---|---|
| Cell DATE serial | 46292 |
| Taipei calendar date | 2026-09-27 |
| audit effectiveDate after row conversion | 2026-09-26T16:00:00.000Z |
| employment baselineDate after row conversion | 2026-09-26T16:00:00.000Z |
| existing period image | 2026-09-27 |
| intent afterJson baselineDate | 2026-09-27 |
| persisted channelId | Number 2011467618 |
| intent channelId | String "2011467618" |

Other effectiveAt/createdAt/validFrom/operatedAt timestamps remain strings.
The exact V49 failing predicate is `p.baselineDate !== intent.effectiveDate`.
V49 status rejects before Inspect, while independently running Inspect confirms both rows match.
A counterfactual changing only effectiveDate's representation back to the calendar string makes the unmodified V49 status MATCHED.

AST-based predicate tracing is test-only; no verbose runtime diagnostics were added.
Individual operands are evaluated independently, while original AND/OR/guard semantics determine rejection.
Unreached Inspect is explicitly labelled independent, not claimed to have executed in the failed normal path.
Both the preserved V49 trace and new V50 trace contain source expressions and booleans, not private row values.

## Approved narrow patch

Full exact patch: `evidence/v50/runtime.patch`.

1. Add `employeeBaselineAuditDate_` as a pure comparison-image helper.
   - Canonical valid yyyy-MM-dd remains unchanged.
   - ISO must have exact millisecond-Z syntax, survive `Date.toISOString()` equality, and format as **exact Asia/Taipei local midnight**.
   - No trim, loose date parsing, numeric serial coercion, or arbitrary same-day timestamp acceptance.
   - Invalid/non-string inputs produce no valid calendar image.
2. Only format-4 STARTED intent uses that image when comparing audit effectiveDate to intent employment baselineDate.
3. Only format-4 STARTED intent additionally requires `operatedAt === effectiveAt`.

The extra STARTED invariant was explicitly approved after forensic discovery: the original producer assigns both from the same `now`.
COMPLETED is not subject to that equality. Its existing valid time and `COMPLETED operatedAt >= STARTED operatedAt` checks remain unchanged.
COMPLETED's effectiveDate and other unchanged receipt fields still use the existing strict receipt equality; both DATE cells round-trip consistently in tests.
V49 channelId normalization remains exactly intact, and v3 receives neither new rule.
Receipt objects and persisted values are never rewritten by the comparison helper.

## Differential and full recovery

| Version | requestStatus | historicalCompletion | currentConsistency |
|---|---|---|---|
| V48 | RECOVERY_REQUIRED | null | CONFLICT |
| V49 | RECOVERY_REQUIRED | null | CONFLICT |
| V50 | STARTED | false | MATCHED |

All statuses retain recoveryAllowed=false and newRequestAllowed=false.

The full real-function offline recovery simulation verifies:

- Starting CLAIMED / INITIAL / generation 1, one STARTED, one employment, one binding, no COMPLETED.
- No reapproval: RECOVERY_APPROVAL_REQUIRED and zero new data writes.
- Separate mock Prepare: ARMED / RECOVER_ORIGINAL / generation 2; original history preserved.
- Original requestId, synthetic snapshot, real computed requestHash, reason and confirmed=true unchanged.
- Generation-2 claim occurs before the only Sheet write.
- Finish sees employmentDone=true and bindingDone=true.
- Employment added=0, binding added=0, master mutation=0, COMPLETED added=1.
- Full second Sheet round-trip: STARTED and COMPLETED effectiveDate both become Date then ISO.
- Final COMPLETED / historicalCompletion=true / MATCHED, both Allowed false.
- COMPLETED operatedAt may be later than effectiveAt; an earlier/invalid completed time is rejected.
- Explicit offline completed replay is read-only; no automatic retry was added.

Fresh INITIAL also runs through real functions with DATE and numeric-channel round-trips:
LEGACY_NOT_BASELINED → ARMED gen1 → claim → STARTED → employment → binding → COMPLETED → RECORDED.
Subsequent status is COMPLETED/MATCHED; master unchanged, unknown hire date still blank.
Missing binding remains STARTED/PARTIAL and requires separate approval; after approved recovery only the missing binding and COMPLETED are written.

## Fail-closed coverage

Current tests cover changed/different/malformed dates, invalid leap days, leading/trailing whitespace, noncanonical ISO, non-midnight instants, milliseconds/seconds drift, another Taipei day, non-string values, and preserved valid leap-day midnight equivalence.
They cover changed STARTED operatedAt, effectiveAt, createdAt, request hash, requestId, snapshot, before-master, employment/binding identity and contents, lineSub, numeric/string/leading-zero channel, duplicate/missing rows, second STARTED, malformed/extra COMPLETED, unrelated audit, action/source/version/operator drift, changed master, invalid permit history/generation/mode, and full completed read-back.

Wrong audit operator is checked through the real outer dispatcher boundary: status returns NOT_OBSERVED/UNKNOWN to avoid identity disclosure; Prepare and migrate reject with zero writes. It is not incorrectly tested as though the inner helper owned that authorization responsibility.
The original 69 V49 negative/recovery cases run unchanged against both V49 and V50; no cases removed or skipped.

## Executed tests and reproducibility

Run:

```powershell
python release-candidates/gas-t4-recovery-effectivedate-v50/tests/run.py
node release-candidates/gas-t4-recovery-effectivedate-v50/tests/static.cjs
git diff --check
```

Actual Python executable used:
`C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
Node: v24.19.0.

| Executed suite | PASS |
|---|---:|
| V44 pinned reference | 89 |
| V48 pinned wrapper/hash | 47 |
| V48 existing GAS regression | 331 |
| V49 existing GAS regression | 331 |
| V50 same existing GAS regression | 331 |
| Original V49 channel recovery tests on V49 | 69 |
| Same unchanged channel recovery tests on V50 | 69 |
| Preserved forensic controls + approved gates | 6 |
| V50 faithful round-trip/recovery/rejection/v3 tests | 107 |
| Total | **1380** |

**1380 PASS / 0 FAIL / 0 SKIP**. Counts are executed groups/cases, not unique business requirements; version control groups are explicitly separated.
Static checks cover exact one-file patch, all eleven source hashes, immutable old forensic evidence, nine GAS syntax checks, one existing HTML inline script, seven test JS files, JSON, branch/scope and whitespace checks.
The old tests' source-specific wrapper hash assertion runs on V48 without changing its expected hash.
Worker/browser are unchanged and outside this GAS-only run; they are not counted as PASS or SKIP.

The driver exports pinned test dependencies into a temporary directory. It never modifies old source/test paths in the repository.
Network APIs are blocked; all service implementations are in-memory. No live endpoint test is needed.
New output digests omit only TAP durations and variable checkout/temp prefixes, preserving status/count/assertion output.
Input hashes bind the exact candidate and tests; deterministic evidence uses sorted relative path + NUL + byte length + NUL + bytes.
Original forensic files are not regenerated. The current manifest seals both old evidence and new V50 evidence.
Two consecutive full driver runs returned identical candidate and evidence hashes, each with 1380 PASS / 0 FAIL / 0 SKIP. TAP subtest and final-summary duration lines are both excluded; test statuses and assertion output remain included.

One new operator test initially called the inner helper instead of the outer authorization boundary. It was corrected to verify the existing non-disclosure response plus real Prepare/migrate rejection; no runtime was changed to accommodate it.

## Hashes

- V49 bundle: `57e8a16ec0088d1bd4c024a453b60f3365b70c4c47247ec925c933117ba49cc0`
- V50 bundle: `05d7ecc706de930c262663e9dd8b33ce1988811f36186a96750331c01940e0f1`
- V50 Baseline: `5d47e0336cc2e57819cd8bda3b6be76f5d3905de3b4748e0776ecc75c9e8258b`
- Full evidence: `f25bf72cbc98c20a0ff7575eb4bb60ec7849250c8516f8be8cb184f16811bbd3`
- `source-manifest.json` lists eleven exact source hashes; `MANIFEST.json` lists evidence files/hashes.
- The evidence seal includes previous forensic failure records as historical evidence; the authoritative current outcome is root `TEST_RESULTS.json` and `evidence/v50/test-results.json`.
- REVIEW.md is explanatory, excluded from the evidence seal to avoid self-reference. New commit SHA is not embedded into files requiring a second commit.

## Scope, limits, and release stop

All 34 added files are under `release-candidates/gas-t4-recovery-effectivedate-v50/`: 11 sources, 8 test/runner files, manifests/results, original/new evidence, preserved pre-approval artifacts, attributes and this review.
No file outside this candidate is modified. Complete inventory is available from git and the manifests.

No remaining P0/P1 was found in the approved narrow candidate. The prior STARTED-time blocker is resolved by the explicitly approved producer invariant.
P2/evidence limits remain: no complete Production master/LINE-sub preimage is available. This is a de-identified invariant fixture with internally consistent real hashes, not a byte-identical Production replay.
No claim is made that production has recovered, that hashes reconstruct confidential inputs, or that Sheet/Script Properties are transactional.
Deployment, current data verification and any future recovery approval remain separate human Production gates.

No PR, merge, deploy, Production request, Cloudflare/GAS/LINE/Sheets operation, Script Property/Worker flag/Permit change, Production recovery execution or Migration retry.

READY FOR HUMAN REVIEW
