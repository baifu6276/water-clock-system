// New actions only. Never log tokens, request bodies or LINE error responses.
function employeeFailure_(code, message) {
  var error = new Error(message);
  error.employeeCode = code;
  throw error;
}

function verifyLiffIdentity_(idToken) {
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channelId) employeeFailure_('CONFIG_ERROR', '身分驗證尚未設定，請聯絡管理員。');
  if (typeof idToken !== 'string' || !idToken.trim() || idToken.length > 16384) {
    employeeFailure_('AUTH_ERROR', '請重新開啟 LINE 並登入。');
  }
  var response;
  try {
    response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: { id_token: idToken, client_id: channelId }, muteHttpExceptions: true
    });
  } catch (_) { employeeFailure_('AUTH_ERROR', '目前無法驗證 LINE 身分，請稍後再試。'); }
  var claims;
  try { claims = JSON.parse(response.getContentText()); }
  catch (_) { employeeFailure_('AUTH_ERROR', 'LINE 身分驗證失敗，請重新登入。'); }
  if (response.getResponseCode() !== 200 || !claims || claims.iss !== 'https://access.line.me' ||
      String(claims.aud) !== String(channelId) || typeof claims.sub !== 'string' || !claims.sub.trim() ||
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    employeeFailure_('AUTH_ERROR', 'LINE 身分驗證失敗，請重新登入。');
  }
  return { sub: claims.sub, channelId: String(channelId) };
}

function resolveEmployeeIdentity_(idToken) {
  return employeeContext_(verifyLiffIdentity_(idToken));
}

function employeeContext_(identity) {
  var employees = employeeLegacyRows_();
  var bindings = employeeStoreRows_('bindings', true);
  var ownedBindings = bindings.filter(function(b) { return b.lineSub === identity.sub; });
  var matches;
  if (ownedBindings.length) {
    var active = ownedBindings.filter(function(b) {
      return b.status === '有效' && String(b.channelId) === identity.channelId &&
        b.validFrom && Number.isFinite(new Date(b.validFrom).getTime()) && new Date(b.validFrom).getTime() <= Date.now() &&
        (!b.validTo || (Number.isFinite(new Date(b.validTo).getTime()) && new Date(b.validTo).getTime() > Date.now()));
    });
    if (active.length !== 1) employeeFailure_('IDENTITY_CONFLICT', 'LINE 綁定需要管理員確認。');
    matches = employees.filter(function(e) { return e.employeeId === active[0].employeeId; });
  } else {
    matches = employees.filter(function(e) { return e.lineUid === identity.sub; });
    // A managed employee must not regain a retired binding via the legacy B column.
    if (matches.some(function(e) { return bindings.some(function(b) { return b.employeeId === e.employeeId; }); })) {
      employeeFailure_('IDENTITY_CONFLICT', 'LINE 綁定需要管理員確認。');
    }
  }
  if (matches.length > 1 || (ownedBindings.length && matches.length !== 1)) {
    employeeFailure_('IDENTITY_CONFLICT', '員工身分有重複或缺漏，請聯絡管理員。');
  }
  var employee = matches[0] || null;
  if (employee && (!employee.employeeId || employees.filter(function(e) { return e.employeeId === employee.employeeId; }).length !== 1)) {
    employeeFailure_('IDENTITY_CONFLICT', '員工資料需要管理員確認。');
  }
  return { sub: identity.sub, channelId: identity.channelId, employee: employee };
}

function employeeIdentityState_(context) {
  if (!context.employee) return 'UNREGISTERED';
  var states = { '在職': 'ACTIVE_EMPLOYEE', '停職': 'SUSPENDED', '留停': 'LEAVE', '離職': 'TERMINATED' };
  if (!states[context.employee.status]) employeeFailure_('IDENTITY_CONFLICT', '員工狀態需要管理員確認。');
  return states[context.employee.status];
}
