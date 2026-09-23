// Isolated T1/T3 reads only. No logging, storage, retries, or business authorization.
export const VERSION = 't3-2-status-only';
const routes = Object.freeze({
  '/identity': { action: 'identityBootstrap', keys: ['action', 'idToken'] },
  '/employee-read': { action: 'employeeLifecycleBaselineDryRun', keys: ['action', 'idToken', 'employeeId'] },
  '/employee-operation-status': { action: 'employeeLifecycleBaselineRequestStatus', keys: ['action', 'idToken', 'employeeId', 'requestId'] }
});
const timeoutStages = new Set(['READ_REQUEST', 'POST_HEADERS', 'REDIRECT_GET_HEADERS', 'FINAL_BODY']);
const fail = code => { throw new Error(code); };
const errors = new Set(['CONFIG_ERROR', 'HTTPS_REQUIRED', 'PATH_DENIED', 'ORIGIN_DENIED',
  'METHOD_DENIED', 'CONTENT_TYPE_INVALID', 'REQUEST_INVALID', 'REQUEST_TOO_LARGE',
  'TOKEN_REQUIRED', 'ACTION_DENIED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR',
  'UPSTREAM_HTTP_ERROR', 'UPSTREAM_REDIRECT_DENIED', 'UPSTREAM_REDIRECT_LIMIT',
  'UPSTREAM_RESPONSE_TOO_LARGE', 'UPSTREAM_JSON_INVALID']);

async function limitedText(message, limit, code) {
  if (Number(message.headers.get('content-length')) > limit) fail(code);
  const reader = message.body?.getReader();
  if (!reader) return '';
  const parts = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); fail(code); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}

function configuration(env) {
  try {
    const upstream = new URL(env.GAS_UPSTREAM);
    if (upstream.protocol !== 'https:' || upstream.hostname !== 'script.google.com' ||
      upstream.port || upstream.username || upstream.password || upstream.search || upstream.hash ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(upstream.pathname)) fail('CONFIG_ERROR');
    const origins = JSON.parse(env.ALLOWED_ORIGINS);
    if (!Array.isArray(origins) || !origins.length || origins.some(origin => {
      const url = new URL(origin);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /\.(test|example|localhost)$/.test(url.hostname);
      return url.origin !== origin || (local && env.ENVIRONMENT !== 'development') || (url.protocol !== 'https:' &&
        !(env.ENVIRONMENT === 'development' && url.protocol === 'http:' && url.hostname === 'localhost'));
    })) fail('CONFIG_ERROR');
    return { upstream: upstream.href, origins };
  } catch { fail('CONFIG_ERROR'); }
}

// Dependencies are injectable for fully offline tests; runtime uses web standards.
export async function handle(request, env, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const correlationId = crypto.randomUUID();
  let origin = null;
  function reply(body, status = 200) {
    const headers = { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
      'X-Transport-Version': VERSION, 'X-Correlation-Id': correlationId };
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': 'X-Transport-Version, X-Correlation-Id' });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  }
  const controller = new AbortController(); let timer;
  let stage = 'READ_REQUEST';
  try {
    const config = configuration(env);
    const url = new URL(request.url);
    if (url.protocol !== 'https:') fail('HTTPS_REQUIRED');
    if (!Object.hasOwn(routes, url.pathname) || url.search) fail('PATH_DENIED');
    const route = routes[url.pathname];
    const candidate = request.headers.get('origin');
    if (!config.origins.includes(candidate)) fail('ORIGIN_DENIED');
    origin = candidate;
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== 'POST' ||
        (request.headers.get('access-control-request-headers') || '').split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'content-type')) fail('METHOD_DENIED');
      return reply(null, 204);
    }
    if (request.method !== 'POST') fail('METHOD_DENIED');
    if (!/^(text\/plain|application\/json)(;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) fail('CONTENT_TYPE_INVALID');
    // Deadline also bounds inbound/body reads; it covers the entire redirect chain.
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('UPSTREAM_TIMEOUT')); }, timeoutMs);
    });
    const operation = async () => {
      let data;
      stage = 'READ_REQUEST';
      const text = await limitedText(request, 16384, 'REQUEST_TOO_LARGE');
      try { data = JSON.parse(text); } catch { fail('REQUEST_INVALID'); }
      if (!data || Array.isArray(data) || typeof data !== 'object') fail('REQUEST_INVALID');
      if (data.action !== route.action) fail('ACTION_DENIED');
      if (Object.keys(data).some(key => !route.keys.includes(key))) fail('REQUEST_INVALID');
      // Scope restriction only. GAS still verifies the actor and management authority.
      if (url.pathname !== '/identity' && data.employeeId !== 'EMP001') fail('REQUEST_INVALID');
      if (url.pathname === '/employee-operation-status' &&
          (typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.requestId))) fail('REQUEST_INVALID');
      if (typeof data.idToken !== 'string' || !data.idToken.trim() || data.idToken.length > 12000) fail('TOKEN_REQUIRED');
      if (controller.signal.aborted) fail('UPSTREAM_TIMEOUT');
      let target = config.upstream;
      let options = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(url.pathname === '/identity' ? { action: route.action, idToken: data.idToken } :
          { action: route.action, idToken: data.idToken, employeeId: 'EMP001',
            ...(url.pathname === '/employee-operation-status' ? { requestId: data.requestId } : {}) }) };
      for (let redirects = 0; ; redirects++) {
        if (controller.signal.aborted) fail('UPSTREAM_TIMEOUT');
        let response;
        try {
          stage = options.method === 'POST' ? 'POST_HEADERS' : 'REDIRECT_GET_HEADERS';
          response = await fetchImpl(target, { ...options, redirect: 'manual', credentials: 'omit',
            cache: 'no-store', signal: controller.signal });
        } catch { fail(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR'); }
        if (response.status >= 300 && response.status < 400) {
          void response.body?.cancel().catch(() => {});
          if (redirects >= 3) fail('UPSTREAM_REDIRECT_LIMIT');
          if (![302, 303].includes(response.status)) fail('UPSTREAM_REDIRECT_DENIED');
          let next;
          try { next = new URL(response.headers.get('location')); } catch { fail('UPSTREAM_REDIRECT_DENIED'); }
          if (next.protocol !== 'https:' || next.hostname !== 'script.googleusercontent.com' ||
            next.port || next.username || next.password || next.hash) fail('UPSTREAM_REDIRECT_DENIED');
          target = next.href;
          // ContentService retrieval is GET: never resend the token/body/cookies.
          options = { method: 'GET' };
          continue;
        }
        if (!response.ok) { void response.body?.cancel().catch(() => {}); fail('UPSTREAM_HTTP_ERROR'); }
        stage = 'FINAL_BODY';
        const body = await limitedText(response, 65536, 'UPSTREAM_RESPONSE_TOO_LARGE');
        let result;
        try { result = JSON.parse(body); } catch { fail('UPSTREAM_JSON_INVALID'); }
        if (!result || Array.isArray(result) || typeof result !== 'object' || typeof result.success !== 'boolean') fail('UPSTREAM_JSON_INVALID');
        // Preserve GAS business JSON; headers carry transport metadata separately.
        return reply(result);
      }
    };
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    const code = errors.has(error.message) ? error.message : 'TRANSPORT_ERROR';
    const body = { success: false, transportError: code };
    if (code === 'UPSTREAM_TIMEOUT' && timeoutStages.has(stage)) body.transportStage = stage;
    return reply(body, code === 'UPSTREAM_TIMEOUT' ? 504 :
      code.startsWith('UPSTREAM_') ? 502 : code === 'CONFIG_ERROR' || code === 'TRANSPORT_ERROR' ? 500 : 400);
  } finally { clearTimeout(timer); }
}

export default { fetch: (request, env) => handle(request, env) };
