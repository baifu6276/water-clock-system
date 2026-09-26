// TEMPORARY EDITOR-ONLY REVIEW ARTIFACT. Never deploy or add a dispatcher route.
// Run only after separate explicit human permit approval; migration remains HOLD.
function employeeT4InitialPrepareOnce() {
  if (arguments.length !== 0) employeeBaselineDenied_();
  var channel = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  var actor = employeeBaselineEditorActor_('EMP001', channel);
  var preview = employeeBaselinePreview_(actor, 'EMP001');
  if (!preview || preview.success !== true || preview.employeeId !== 'EMP001' ||
      preview.baselineState !== 'LEGACY_NOT_BASELINED' || preview.eligible !== true) {
    employeeBaselineDenied_();
  }
  return employeeBaselineControlPrepare_({
    operatorId: 'EMP001',
    approvedBy: 'EMP001',
    approvalReference: 'T4_EMP001_20260926_01',
    requestId: 'c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab',
    expectedSnapshotVersion: preview.snapshotVersion,
    reason: '建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。',
    mode: 'INITIAL'
  });
}
