// New actions only. Never log tokens, request bodies or LINE error responses.
// TEMPORARY EDITOR-ONLY probe: deliberately absent from every API dispatcher.
// Select this no-argument function in the Apps Script editor and click Run.
function employeeIdentityEditorConnectivityTest() {
  var result;
  try {
    var response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: { id_token: 'dummy-invalid-editor-probe', client_id: '0' },
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Unexpected HTTP status type');
    result = { success: true, category: 'HTTP_RESPONSE_RECEIVED', httpStatus: status };
    // Do not read response headers/body. HTTP 400/401 is expected for dummy data.
  } catch (error) {
    var type = 'UNCLASSIFIED', hint = 'UNCLASSIFIED';
    // Only fixed labels leave this function. Even exception names/stacks may be unsafe.
    try {
      if (error && ['Error', 'TypeError', 'ReferenceError', 'Exception'].indexOf(error.name) >= 0) type = error.name;
      var message = error && typeof error.message === 'string' ? error.message : '';
      if (/script\.external_request/i.test(message)) hint = 'EXTERNAL_REQUEST_SCOPE_MENTIONED';
      else if (/UrlFetchApp is not defined/i.test(message)) hint = 'URLFETCH_SERVICE_UNAVAILABLE';
      else if (/fetch is not a function/i.test(message)) hint = 'FETCH_METHOD_UNAVAILABLE';
      else if (/Unexpected error while getting.*(?:fetch|UrlFetchApp)/i.test(message)) hint = 'SERVICE_METHOD_ACCESS_ERROR';
      else if (/Service unavailable|Internal error|server error occurred/i.test(message)) hint = 'SERVICE_INTERNAL_ERROR';
    } catch (_) {}
    result = { success: false, category: employeeUrlFetchDiagnostic_(error), exceptionType: type, hint: hint };
  }
  // This exact allowlisted object is the ONLY editor log; no exception/body logging.
  console.log(JSON.stringify(result));
  return result;
}

function employeeFailure_(code, message) {
  var error = new Error(message);
  error.employeeCode = code;
  throw error;
}

// Only locally authored diagnostic codes/messages cross the API boundary.
function employeeAuthFailure_(diagnosticCode) {
  var error = new Error('LINE 身分驗證未完成，請依安全診斷代碼確認。');
  error.employeeCode = diagnosticCode === 'LINE_CHANNEL_ID_MISSING' ? 'CONFIG_ERROR' : 'AUTH_ERROR';
  error.employeeDiagnosticCode = diagnosticCode;
  throw error;
}
// GAS has no stable typed UrlFetch exception API. Match only recognizable service
// phrases in memory; never return/log the message (it may contain request data).
// Unrecognized/localized messages deliberately remain generic.
function employeeUrlFetchDiagnostic_(error) {
  var message = '';
  try { if (error && typeof error.message === 'string') message = error.message; } catch (_) {}
  if (/^(?:Exception:\s*)?(?:You do not have permission to call|You do not have permission to access|Authorization is required|Required permissions:)/i.test(message)) {
    return 'LINE_VERIFY_PERMISSION_ERROR';
  }
  if (/^(?:Exception:\s*)?(?:Service invoked too many times|Service using too much computer time|Limit exceeded:|Quota exceeded|Too many scripts running simultaneously)/i.test(message)) {
    return 'LINE_VERIFY_QUOTA_ERROR';
  }
  if (/^(?:Exception:\s*)?(?:DNS error|Address unavailable|Connection timed out|Connection refused|Socket timeout|Timeout:|SSL error|SSL handshake)/i.test(message)) {
    return 'LINE_VERIFY_CONNECTIVITY_ERROR';
  }
  if (/^(?:Exception:\s*)?(?:Invalid argument:|Invalid arguments:|Invalid value:|The parameters .* don't match the method signature for UrlFetchApp\.fetch)/i.test(message)) {
    return 'LINE_VERIFY_REQUEST_ERROR';
  }
  return 'LINE_VERIFY_FETCH_ERROR';
}
function verifyLiffIdentity_(idToken) {
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channelId || !String(channelId).trim()) employeeAuthFailure_('LINE_CHANNEL_ID_MISSING');
  if (typeof idToken !== 'string' || !idToken.trim() || idToken.length > 16384) employeeAuthFailure_('LINE_TOKEN_MISSING_OR_INVALID');
  var response, status;
  try {
    response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: { id_token: idToken, client_id: channelId }, muteHttpExceptions: true
    });
    status = response.getResponseCode();
  } catch (error) { employeeAuthFailure_(employeeUrlFetchDiagnostic_(error)); }
  // Do not inspect or return error bodies for redirects/rate limits/server errors.
  if (status !== 200 && status !== 400 && status !== 401) employeeAuthFailure_('LINE_VERIFY_HTTP_ERROR');
  var claims;
  try { claims = JSON.parse(response.getContentText()); }
  catch (_) { employeeAuthFailure_('LINE_VERIFY_MALFORMED_RESPONSE'); }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) employeeAuthFailure_('LINE_VERIFY_MALFORMED_RESPONSE');
  if (status !== 200) {
    // Exact documented LINE descriptions only; never forward raw error text.
    var known = {
      'Invalid IdToken Audience.': 'LINE_AUDIENCE_MISMATCH',
      'Invalid IdToken Issuer.': 'LINE_ISSUER_MISMATCH',
      'IdToken expired.': 'LINE_TOKEN_EXPIRED'
    };
    employeeAuthFailure_(Object.prototype.hasOwnProperty.call(known, claims.error_description) ? known[claims.error_description] : 'LINE_TOKEN_REJECTED');
  }
  if (claims.iss !== 'https://access.line.me') employeeAuthFailure_('LINE_ISSUER_MISMATCH');
  if (String(claims.aud) !== String(channelId)) employeeAuthFailure_('LINE_AUDIENCE_MISMATCH');
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) employeeAuthFailure_('LINE_VERIFY_MALFORMED_RESPONSE');
  if (claims.exp <= Date.now() / 1000) employeeAuthFailure_('LINE_TOKEN_EXPIRED');
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) employeeAuthFailure_('LINE_SUB_MISSING');
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

/**
 * EDITOR-ONLY project integrity diagnostic.
 * Read-only: does not write Sheets, create baseline, mutate employee data,
 * call LINE API, or deploy anything.
 */
function employeeProjectIntegrityCheck() {
  var expected = [
    // Identity / routing
    'verifyLiffIdentity_',
    'employeeFoundationRequest_',
    'handleEmployeeFoundation_',

    // Store / context
    'employeeContext_',
    'employeeStoreRows_',

    // Application
    'employeeSubmit_',
    'employeeCancel_',
    'employeeApplicationAdminList_',
    'employeeApplicationReview_',

    // Lifecycle read
    'employeeLifecycleRead_',

    // Baseline
    'employeeLifecycleBaselineDryRun_',
    'employeeBaselineRequestStatus_',
    'employeeBaselineMigrate_',

    // Lifecycle mutation
    'employeeLifecycleMutate_'
  ];

  var result = expected.map(function(name) {
    var exists = false;
    var type = 'undefined';

    try {
      var value = eval('typeof ' + name);
      type = value;
      exists = value === 'function';
    } catch (error) {
      type = 'ERROR';
    }

    return {
      name: name,
      exists: exists,
      type: type
    };
  });

  var missing = result
    .filter(function(item) {
      return !item.exists;
    })
    .map(function(item) {
      return item.name;
    });

  var summary = {
    success: missing.length === 0,
    checked: result.length,
    missingCount: missing.length,
    missing: missing,
    functions: result
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}