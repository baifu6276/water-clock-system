// All runtime is loaded from ../../sources; services only are mocked.
const {env}=require('./service-fixture.cjs');
function makeEnv(role = 'ADMIN', targetRole = role, targetStatus = '在職') {
  const e = env();
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
  e.rows = table => JSON.parse(JSON.stringify(e.ctx.employeeStoreRows_(table)));
  e.preview = () => e.call('employeeLifecycleBaselineDryRun', { employeeId: 'EMP001' }, e.actor);
  e.input = (requestId = 't4-baseline-request-0001') => ({ employeeId: 'EMP001', requestId, expectedSnapshotVersion: e.preview().snapshotVersion, reason: '受控測試', confirmed: true });
  e.prepare = (p, mode = 'INITIAL') => e.ctx.employeeBaselineControlPrepare_({ operatorId: e.operatorId, approvedBy: e.operatorId,
    approvalReference: 'approval-offline-0001', requestId: p.requestId, expectedSnapshotVersion: p.expectedSnapshotVersion, reason: p.reason, mode });
  e.migrate = p => e.call('employeeLifecycleBaselineMigrate', p, e.actor);
  e.status = p => e.call('employeeLifecycleBaselineRequestStatus', { employeeId: 'EMP001', requestId: p.requestId }, e.actor);
  return e;
}
module.exports={makeEnv,legacyEnv:env,env};
