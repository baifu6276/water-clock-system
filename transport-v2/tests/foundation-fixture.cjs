// Version-pinned, local Git objects only. Never fetches, writes files, or calls GAS.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const ref = 'c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd';
const cache = new Map();
function source(file) {
  if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true }));
  return cache.get(file);
}
const fixture = source('tests/employee-foundation.test.cjs');
const boundary = fixture.indexOf('\nconst payload =');
if (boundary < 0) throw Error('Pinned fixture boundary missing');
const fixtureRoot = path.join(root, '__pinned_fixture__');
function fixtureRequire(name) {
  if (name !== 'node:fs') return require(name);
  return { ...fs, readdirSync(dir) {
    const rel = path.relative(fixtureRoot, dir).split(path.sep).join('/');
    if (rel.startsWith('..')) throw Error('Fixture path denied');
    return execFileSync('git', ['ls-tree', '--name-only', `${ref}:${rel}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(Boolean);
  }, readFileSync(file, encoding) {
    const rel = path.relative(fixtureRoot, file).split(path.sep).join('/');
    if (rel.startsWith('..')) throw Error('Fixture path denied');
    const text = source(rel); return encoding ? text : Buffer.from(text);
  } };
}
function sandbox() { return { require: fixtureRequire, __dirname: path.join(fixtureRoot, 'tests'), console }; }
const factory = sandbox();
vm.runInNewContext(fixture.slice(0, boundary) + '\nglobalThis.makeEnv = env;', factory);
function upgrade(e) {
  for (const file of ['EmployeeBaselineControl', 'EmployeeLifecycleBaseline']) vm.runInContext(fs.readFileSync(path.join(root, 'gas', file + '.gs'), 'utf8'), e.ctx);
  return e;
}
function makeEnv(role = 'ADMIN', targetRole = role, targetStatus = '在職') {
  const e = factory.makeEnv();
  e.tables['員工資料表'].rows[1] = ['EMP001', 'owner', '測試', '師傅', '日薪', 2200, targetRole, '', '', targetStatus, '', ''];
  if (role !== targetRole) e.tables['員工資料表'].rows.push(['EMP002', 'actor', '管理測試', '', '', 0, role, '', '', '在職', '', '']);
  e.actor = role === targetRole ? 'owner' : 'actor';
  e.operatorId = role === targetRole ? 'EMP001' : 'EMP002';
  const properties = new Map([['LINE_LOGIN_CHANNEL_ID', 'test-channel']]);
  e.props = properties; e.propFailure = null; e.flushFailure = null;
  e.ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => {
      const fail = e.propFailure; e.propFailure = null;
      if (fail === 'before') throw Error('PRIVATE_PROPERTY_EXCEPTION');
      properties.set(key, value);
      if (fail === 'after') throw Error('PRIVATE_PROPERTY_EXCEPTION');
    }
  }) };
  e.ctx.Utilities.newBlob = text => ({ getBytes: () => [...Buffer.from(text)] });
  e.ctx.SpreadsheetApp.flush = () => { if (e.flushFailure) { e.flushFailure = null; throw Error('PRIVATE_FLUSH_EXCEPTION'); } };
  upgrade(e);
  e.rows = table => JSON.parse(JSON.stringify(e.ctx.employeeStoreRows_(table)));
  e.preview = () => e.call('employeeLifecycleBaselineDryRun', { employeeId: 'EMP001' }, e.actor);
  e.input = (requestId = 't4-baseline-request-0001') => ({ employeeId: 'EMP001', requestId, expectedSnapshotVersion: e.preview().snapshotVersion, reason: '受控測試', confirmed: true });
  e.prepare = (p, mode = 'INITIAL') => e.ctx.employeeBaselineControlPrepare_({ operatorId: e.operatorId, approvedBy: e.operatorId,
    approvalReference: 'approval-offline-0001', requestId: p.requestId, expectedSnapshotVersion: p.expectedSnapshotVersion, reason: p.reason, mode });
  e.migrate = p => e.call('employeeLifecycleBaselineMigrate', p, e.actor);
  e.status = p => e.call('employeeLifecycleBaselineRequestStatus', { employeeId: 'EMP001', requestId: p.requestId }, e.actor);
  return e;
}
module.exports = { makeEnv, upgrade, legacyEnv: factory.makeEnv, ref, source, root };
if (require.main === module) {
  const box = sandbox();
  // Legacy writes seed v3 fixtures; all 35 original status groups exercise the
  // current read/inspection implementation, not a historical copy of it.
  box.installCurrentReads = ctx => {
    const saved = Object.fromEntries(Object.entries(ctx)); upgrade({ ctx });
    const keep = new Set(['employeeBaselineDecode_', 'employeeBaselineInspect_', 'employeeBaselineRequestStatus_',
      'employeeBaselineStatusEvidence_', 'employeeBaselineStatusResult_', 'employeeBaselineApprovalRef_']);
    for (const key of Object.keys(ctx)) if (!keep.has(key)) {
      if (Object.hasOwn(saved, key)) ctx[key] = saved[key]; else delete ctx[key];
    }
  };
  const hook = 'return {ctx, tables, logs,';
  if (!fixture.includes(hook)) throw Error('Fixture hook missing');
  const Module = require('node:module');
  const file = path.join(fixtureRoot, 'tests', 'employee-foundation.test.cjs');
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.require = name => name === 't4-current-reads' ? box.installCurrentReads : fixtureRequire(name);
  compiled._compile(fixture.replace(hook, "require('t4-current-reads')(ctx);\n  " + hook), file);
}
