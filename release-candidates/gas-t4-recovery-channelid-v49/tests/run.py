"""Offline only; exports exact pinned test dependencies into a temporary directory.
Runs original V48 and candidate V49 with the SAME unmodified GAS regression tests.
Never changes pinned sources, performs network requests, stages or commits.
Re-run: python release-candidates/gas-t4-recovery-channelid-v49/tests/run.py
"""
from pathlib import Path
import difflib, hashlib, json, os, re, shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
REF = '08359639eda194a2c6183e715d6d5bb44878c086'
OLD = 'release-candidates/gas-t4-control-no-flush/'
NODE = shutil.which('node')
assert NODE, 'Node.js is required'
EXPECTED_OLD = 'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def bundle(files):
    return sha(b''.join(n.encode() + b'\0' + str(len(b)).encode() + b'\0' + b for n, b in sorted(files.items())))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')


names = sorted(p.name for p in (ROOT / 'sources').iterdir())
assert len(names) == 11
old_sources = {n: git('show', REF + ':' + OLD + 'sources/' + n) for n in names}
new_sources = {n: (ROOT / 'sources' / n).read_bytes() for n in names}
assert bundle(old_sources) == EXPECTED_OLD
assert [n for n in names if old_sources[n] != new_sources[n]] == ['EmployeeLifecycleBaseline.gs']
manifest = {
    'baseCommit': REF, 'basePath': OLD + 'sources/',
    'bundleAlgorithm': 'SHA256(sorted UTF8 relative name + NUL + ASCII byte length + NUL + exact bytes)',
    'baseBundleSha256': bundle(old_sources), 'candidateBundleSha256': bundle(new_sources),
    'files': [{'file': n, 'baseSha256': sha(old_sources[n]), 'candidateSha256': sha(new_sources[n]),
               'bytes': len(new_sources[n]), 'status': 'UNCHANGED' if old_sources[n] == new_sources[n] else 'MODIFIED'} for n in names]
}
save(ROOT / 'source-manifest.json', manifest)
diff = ''.join(difflib.unified_diff(old_sources['EmployeeLifecycleBaseline.gs'].decode().splitlines(True),
    new_sources['EmployeeLifecycleBaseline.gs'].decode().splitlines(True),
    fromfile='V48/EmployeeLifecycleBaseline.gs', tofile='V49/EmployeeLifecycleBaseline.gs', n=0))
(ROOT / 'evidence/runtime.patch').write_text(diff, encoding='utf8', newline='\n')

# Export only exact git blobs needed by the pinned GAS tests. No copied evidence tree in the repository.
paths = git('ls-tree', '-r', '-z', '--name-only', REF).decode('utf8').strip('\0').split('\0')
deps = {}
for p in paths:
    candidate = p.startswith(tuple('release-candidates/' + n + '/' for n in [
        'gas-t4-control-no-flush', 'gas-t4-read-diagnostics', 'gas-v44-read-diagnostics']))
    needed = candidate and ('/sources/' in p or ('/tests/' in p and p.endswith('.cjs'))
        or '/evidence/v44-sources/' in p or p.endswith('/evidence/t4/EmployeeLifecycleBaseline.gs')
        or p == OLD + 'source-manifest.json')
    if needed or p in ['experiments/t4-initial-prepare-wrapper/TEMP_T4_PREPARE.gs',
                        'experiments/t4-initial-prepare-wrapper/wrapper.test.cjs']:
        deps[p] = git('show', REF + ':' + p)
inputs = {'sourceManifestSha256': sha((ROOT / 'source-manifest.json').read_bytes()),
          'baseCommit': REF, 'candidateBundleSha256': bundle(new_sources),
          'pinnedDependencies': [{'path': p, 'sha256': sha(b)} for p, b in sorted(deps.items())],
          'localTestInputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p.read_bytes())}
              for p in sorted((ROOT / 'tests').iterdir()) if p.is_file()]}
save(ROOT / 'evidence/test-inputs.json', inputs)
results = []


def run(name, args, cwd, env, flavor='tap'):
    proc = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True,
                          encoding='utf8', errors='replace', timeout=120)
    output = proc.stdout + proc.stderr
    if flavor == 'tap':
        counts = {}
        for key in ['tests', 'pass', 'fail', 'skipped', 'cancelled']:
            match = re.search(r'^# ' + key + r' (\d+)$', output, re.M)
            if match:
                counts[key] = int(match[1])
    elif flavor == 'groups':
        match = re.search(r'(\d+) total foundation groups passed', output)
        counts = {'pass': int(match[1]), 'fail': 0, 'skipped': 0} if match else {}
    else:
        counts = {'checks': 'PASS' if proc.returncode == 0 else 'FAIL'}
    # Record reproducible commands using an explicit temporary-root placeholder.
    command = [('node' if str(a) == NODE else str(a).replace(str(temp), '${PINNED_TEMP_ROOT}').replace(str(REPO), '${REPO}')) for a in args]
    record = {'suite': name, 'command': command,
              'cwd': '${PINNED_TEMP_ROOT}' if cwd != REPO else '${REPO}', 'exitCode': proc.returncode,
              'counts': counts, 'outputSha256': sha(output.encode())}
    if flavor == 'static' and proc.returncode == 0:
        record['checkResult'] = json.loads(proc.stdout)
    results.append(record)
    print(name, 'exit=' + str(proc.returncode), json.dumps(counts), flush=True)
    if proc.returncode or (flavor in ('tap', 'groups') and not counts.get('pass')) or counts.get('fail', 0) or counts.get('skipped', 0) or counts.get('cancelled', 0):
        save(ROOT / 'evidence/last-failure.json', record)
        print(output[-15000:], flush=True)
        raise SystemExit('Offline suite failed; do not accept evidence')


with tempfile.TemporaryDirectory(prefix='v49-offline-') as td:
    temp = Path(td)
    for p, data in deps.items():
        out = temp / p
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
    guard = temp / OLD / 'tests/deny-network.cjs'
    testdir = temp / OLD / 'tests'
    env = dict(os.environ, V48_SERVICE_FIXTURE=str(testdir / 'service-fixture.cjs'))
    def node(file, tap=True):
        return [NODE, '--require', str(guard)] + (['--test', '--test-reporter=tap'] if tap else []) + [str(file)]
    run('V44-pinned-reference', node(testdir / 'v44-foundation.cjs', False), temp, env, 'groups')
    run('V48-wrapper-pinned-hash', node(temp / 'experiments/t4-initial-prepare-wrapper/wrapper.test.cjs'), temp, env)
    for label in ['V48', 'V49']:
        if label == 'V49':
            for n, data in new_sources.items():
                (temp / OLD / 'sources' / n).write_bytes(data)
        for suite in ['foundation.test.cjs', 'gas-diagnostics.test.cjs', 't4-gas.test.cjs',
                      'combined-contract.test.cjs', 'maintenance.test.cjs']:
            group = suite == 'foundation.test.cjs'
            run(label + '-' + suite, node(testdir / suite, not group), temp, env, 'groups' if group else 'tap')
        if label == 'V48':
            run('V48-to-V49-channel-recovery', node(ROOT / 'tests/recovery.test.cjs'), temp, env)
    # Static runs against local candidate and pinned git blobs; no temporary source substitution.
    run('candidate-static', [NODE, '--require', str(guard), str(ROOT / 'tests/static.cjs')], REPO, env, 'static')

# Assert no tested input drift occurred during execution.
for entry in inputs['localTestInputs']:
    assert sha((ROOT / entry['path']).read_bytes()) == entry['sha256']
assert {n: (ROOT / 'sources' / n).read_bytes() for n in names} == new_sources
summary = {'pass': sum(r['counts'].get('pass', 0) for r in results), 'fail': 0, 'skipped': 0}
report = {'offlineOnly': True, 'productionReplay': False, 'syntheticInternallyConsistentHashes': True,
          'baseCommit': REF, 'baseBundleSha256': bundle(old_sources), 'candidateBundleSha256': bundle(new_sources),
          'testInputsSha256': sha((ROOT / 'evidence/test-inputs.json').read_bytes()),
          'counting': 'Executed assertions/groups per suite; original V48 control runs and V49 candidate runs listed separately. Imported reference-suite groups are not double-counted within TAP totals.',
          'totals': summary, 'runs': results}
save(ROOT / 'evidence/test-results.json', report)
save(ROOT / 'TEST_RESULTS.json', report)
# Review seal excludes itself. It includes source/test inputs, output digests and exact patch.
evidence = {p.name: p.read_bytes() for p in sorted((ROOT / 'evidence').iterdir()) if p.is_file() and p.name not in ('seal.json', 'last-failure.json', 'failed-run.json')}
save(ROOT / 'evidence/seal.json', {'algorithm': manifest['bundleAlgorithm'],
    'evidenceSha256': bundle(evidence), 'files': [{'file': n, 'bytes': len(b), 'sha256': sha(b)} for n, b in sorted(evidence.items())]})
print('ALL OFFLINE CHECKS PASS', json.dumps(summary), flush=True)
print('CANDIDATE_SHA256', bundle(new_sources), flush=True)
print('EVIDENCE_SHA256', bundle(evidence), flush=True)
