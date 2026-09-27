# V51 offline validation

- Exact base/artifact and five-file runtime delta checks; no protected source changes.
- Candidate Worker: exact/root/dynamic host, root → dynamic → success, 302/303, three-hop ceiling, strict scheme/host/path/components; fixed seven-key write and exact flag; GET has no body/headers/cookies/Authorization and only the opaque redirect query.
- Host fuzz: 1,000 independently labeled generated host cases; seed `0x51510001`, parsed host trust rather than substring matching.
- Runner: synchronous latch; fresh identity/status denial/timeout/late resolution → PREWRITE_STOP and zero migration; post-write transport/contract errors → unknown; successful exact receipt; DOM/double click/status cannot unlock; new version required; old runner rejects new version.
- Recovery model: 1,000 sequences, seed `0x52560001`. Unchanged migration model: 1,000 sequences, seed `0x54740002`.
- Existing Worker mutation/response/race hardening seed `0x54740001`; deadline/body/cancellation/privacy regressions retained.
- Real Chromium at 360px, all requests intercepted; fixed cache-busters; no token/sub/raw-error DOM/log leakage; no storage/cookie usage.
- Read capability matrix covers t1-1, t3-1, t3-2-status-only, t3-3-timing-diag, t3-4-gas-read-diag, t4-safety-1, t4-safety-2-gas-read-diag, t4-safety-3-content-redirect. Old versions without status remain fail-closed.
- Pinned legacy suites run unchanged matching old artifacts; they are reported separately from candidate suites. Adapted suites retain all old negative assertions; adaptation diffs and source digests are evidence.
- Production timing buckets are not converted to exact durations or acceleration claims. No Production request, GAS/Sheets operation, permit action, or migration is executed.

Evidence hashing: SHA-256 over sorted relative UTF-8 filename + NUL + ASCII byte length + NUL + file bytes. Unchanged runtime references use exact pinned Git blobs, verified against checkout filters. Modified runtime and evidence use exact LF bytes. No containing-commit SHA self-reference. Two identical reruns must yield the same evidence bundle.
