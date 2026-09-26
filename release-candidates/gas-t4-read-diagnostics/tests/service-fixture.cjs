// Offline only: GAS services are in-memory; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = ['程式碼', 'EmployeeBaselineControl', 'EmployeeIdentity', 'EmployeeLifecycleStore', 'EmployeeApplication', 'EmployeeApplicationAdmin', 'EmployeeLifecycleRead', 'EmployeeLifecycleMutation', 'EmployeeLifecycleBaseline'];
let checks = 0;
function test(name, work) { work(); checks++; console.log('PASS', name); }
function env(allowEmployeeWrites = false) {
  let locked = false, writes = 0, verifies = 0, failTable = null, failAfter = 0, failPersisted = false, beforeLock = null, onWrite = null;
  const tables = {}, logs = [];
  function sheet(name, rows) {
    const s = { rows, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
      getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
      getRange: (r, c, n, m) => ({
        getValues: () => Array.from({length:n}, (_, i) => Array.from({length:m}, (_, j) => rows[r-1+i]?.[c-1+j] ?? '')),
        setValues: values => {
          assert.equal(locked, true, 'writes must hold lock');
          if (!allowEmployeeWrites) assert.notEqual(name, '員工資料表');
          const fail = failTable === name && failAfter-- === 0;
          if (fail) failTable = null;
          if (fail && !failPersisted) throw Error('simulated storage failure');
          writes++;
          values.forEach((row, i) => { rows[r-1+i] ||= []; row.forEach((v,j) => {
            rows[r-1+i][c-1+j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
          }); });
          if (onWrite) { const hook=onWrite; onWrite=null; hook(); }
          if (fail) throw Error('simulated uncertain storage acknowledgement');
        }
      }) };
    tables[name] = s; return s;
  }
  const ctx = vm.createContext({ console: {log: (...v) => logs.push(v), error: (...v) => logs.push(v)},
    Logger: {log: (...v) => logs.push(v)},
    PropertiesService: { getScriptProperties: () => ({getProperty: () => 'test-channel'}) },
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => tables[name] || null}), flush: () => {}},
    LockService: {getScriptLock: () => ({tryLock: () => { if(locked)return false; if(beforeLock){const hook=beforeLock;beforeLock=null;hook();} locked=true; return true; }, waitLock: () => { assert(!locked); locked=true; }, releaseLock: () => {locked=false;}})},
    Utilities: {getUuid: crypto.randomUUID, DigestAlgorithm: {SHA_256:'sha256'}, Charset:{UTF_8:'utf8'},
      formatDate: date => new Date(date.getTime()+8*3600000).toISOString().slice(0,10),
      computeDigest: (_, str) => [...crypto.createHash('sha256').update(str).digest()]},
    ContentService: {MimeType:{JSON:'json'}, createTextOutput: text => ({setMimeType: () => JSON.parse(text)})},
    UrlFetchApp: {fetch: (url, options) => {
      assert.equal(locked, false, 'LINE verification must run outside lock'); verifies++;
      assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
      assert.equal(options.payload.client_id, 'test-channel');
      const token = options.payload.id_token;
      if (token === 'network-secret') throw Error(token);
      const claims = {iss:'https://access.line.me', aud:'test-channel', sub:token.replace('token:', ''), exp:Date.now()/1000+600};
      if (token === 'expired') claims.exp=1;
      if (token === 'wrong-channel') claims.aud='other';
      return {getResponseCode: () => token === 'invalid-secret' ? 400 : 200,
        getContentText: () => JSON.stringify(token === 'invalid-secret' ? {error:token} : claims)};
    }} });
  files.forEach(f => vm.runInContext(read('sources/'+f+'.gs'), ctx, {filename:f+'.gs'}));
  sheet('員工資料表', [Array(12).fill('header'), ['E-owner','owner','測試管理員','', '', 0,'OWNER','','','在職','','']]);
  Object.values(ctx.EMPLOYEE_TABLES_).forEach(s => sheet(s.name, [[...s.headers]]));
  return {ctx, tables, logs, get writes(){return writes;}, get verifies(){return verifies;}, get locked(){return locked;},
    fail: (name, after=0, persisted=false) => {failTable=name;failAfter=after;failPersisted=persisted;},
    beforeLock: hook => {beforeLock=hook;}, onWrite: hook => {onWrite=hook;},
    call: (action, data={}, sub='new') => ctx.doPost({postData:{contents:JSON.stringify({action,idToken:'token:'+sub,...data})}}) };
}
module.exports = { env, files, root };
