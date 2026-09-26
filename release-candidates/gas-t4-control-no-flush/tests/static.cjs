// Offline source/dependency/provenance checks. Does not execute GAS services.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const m=new Module('bundled-acorn');m._compile(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],'bundled-acorn');const acorn=m.exports;
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('source-manifest.json')),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function bundle(dir,names){return hash(Buffer.concat([...names].sort().flatMap(n=>{const b=fs.readFileSync(path.join(dir,n));return[Buffer.from(n+'\0'+b.length+'\0'),b];})));}
const files=fs.readdirSync(path.join(root,'sources')).sort();
assert.equal(files.length,11);assert.deepEqual(files,manifest.matrix.map(x=>x.file).sort());
assert.equal(bundle(path.join(root,'sources'),files),manifest.candidateSha256);
const old=path.join(repo,'release-candidates/gas-t4-read-diagnostics');
assert.equal(bundle(path.join(old,'sources'),files),'279af27a24eeeffebc7114cea795bdf9a0bef682cf2c2721d18ad94e50817449');
assert.deepEqual(manifest.matrix.filter(x=>x.status!=='UNCHANGED').map(x=>x.file),['EmployeeBaselineControl.gs']);
for(const row of manifest.matrix){assert.equal(hash(fs.readFileSync(path.join(root,'sources',row.file))),row.candidateSha256);assert.equal(hash(fs.readFileSync(path.join(old,'sources',row.file))),row.baseSha256);}
const gs=files.filter(f=>f.endsWith('.gs')),sources=Object.fromEntries(gs.map(f=>[f,read('sources/'+f)]));
const parse=s=>acorn.parse(s,{ecmaVersion:'latest',locations:true});
const children=n=>Object.entries(n).filter(([k,v])=>!['loc'].includes(k)&&v&&typeof v==='object').flatMap(([k,v])=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object').map(x=>[x,k]):[[v,k]]);
const globalScope={parent:null,kind:'global',bindings:new Set(),owner:null},scopes=new WeakMap(),declarations=new WeakSet(),globals={},asts={},edges={};
const scope=(parent,kind,owner=parent.owner)=>({parent,kind,bindings:new Set(),owner});
function bind(pattern,s){if(!pattern)return;if(pattern.type==='Identifier'){s.bindings.add(pattern.name);declarations.add(pattern);return;}
  if(pattern.type==='AssignmentPattern')return bind(pattern.left,s);if(pattern.type==='RestElement')return bind(pattern.argument,s);
  if(pattern.type==='ObjectPattern')return pattern.properties.forEach(p=>bind(p.type==='RestElement'?p.argument:p.value,s));
  if(pattern.type==='ArrayPattern')return pattern.elements.forEach(p=>bind(p,s));throw Error('unsupported binding '+pattern.type);}
function first(n,s){scopes.set(n,s);
  if(/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)){
    if(n.type==='FunctionDeclaration')bind(n.id,s);
    const f=scope(s,'function',s===globalScope&&n.id?n.id.name:s.owner);scopes.set(n,f);if(n.id)bind(n.id,f);n.params.forEach(p=>bind(p,f));
    if(n.id)scopes.set(n.id,f);n.params.forEach(p=>first(p,f));first(n.body,f);return;
  }
  if(n.type==='BlockStatement')s=scope(s,'block');if(n.type==='CatchClause'){s=scope(s,'catch');bind(n.param,s);}scopes.set(n,s);
  if(n.type==='VariableDeclaration'){let target=s;if(n.kind==='var')while(target.parent&&target.kind!=='function')target=target.parent;n.declarations.forEach(d=>bind(d.id,target));}
  for(const [child]of children(n))first(child,s);
}
for(const[file,source]of Object.entries(sources)){
  new vm.Script(source,{filename:file});const ast=asts[file]=parse(source);
  for(const n of ast.body){const entries=n.type==='FunctionDeclaration'?[[n.id.name,n]]:n.type==='VariableDeclaration'?n.declarations.map(d=>[d.id.name,d]):[];
    for(const[name,node]of entries){assert(name);assert(!globals[name],'duplicate global '+name);globals[name]={file,line:node.loc.start.line,kind:n.type,sourceHash:hash(source.slice(node.start,node.end))};edges[name]=new Set();}}
  first(ast,globalScope);
}
const externals=new Set(['undefined','NaN','Infinity','Date','Object','Array','JSON','String','Number','Boolean','Math','RegExp','Error','TypeError','Set','Map','parseInt','parseFloat','isNaN','isFinite','decodeURIComponent','encodeURIComponent','eval',
  'SpreadsheetApp','UrlFetchApp','PropertiesService','LockService','Utilities','ContentService','Logger','console','Session']);
const unresolved=[],services=new Set();
function reference(n,p,k){if(n.type!=='Identifier'||declarations.has(n))return false;
  if(p?.type==='MemberExpression'&&k==='property'&&!p.computed)return false;
  if(['Property','MethodDefinition'].includes(p?.type)&&k==='key'&&!p.computed)return false;
  if(['LabeledStatement','BreakStatement','ContinueStatement'].includes(p?.type)&&k==='label')return false;
  return true;}
function second(n,file,p,k){if(reference(n,p,k)){
  let s=scopes.get(n);const owner=s.owner;while(s&&!s.bindings.has(n.name))s=s.parent;
  if(!s&&!externals.has(n.name))unresolved.push({name:n.name,file,line:n.loc.start.line});
  if(s===globalScope&&owner&&edges[owner])edges[owner].add(n.name);
  if(!s&&/App$|Service$|^Utilities$|^Logger$/.test(n.name))services.add(n.name);
}for(const[c,key]of children(n))second(c,file,n,key);}
for(const[file,ast]of Object.entries(asts))second(ast,file);
assert.deepEqual(unresolved,[],'unresolved runtime identifier');
function closure(roots){const found=new Set(),todo=[...roots];while(todo.length){const name=todo.pop();if(found.has(name))continue;assert(globals[name],name);found.add(name);todo.push(...edges[name]);}return[...found].sort();}
const t4roots=Object.keys(globals).filter(n=>['EmployeeLifecycleBaseline.gs','EmployeeBaselineControl.gs'].includes(globals[n].file));
function functions(text){const out={};for(const n of parse(text).body)if(n.type==='FunctionDeclaration')out[n.id.name]=text.slice(n.start,n.end);return out;}
const oldControl=fs.readFileSync(path.join(old,'sources/EmployeeBaselineControl.gs'),'utf8');
const previous=functions(oldControl),current=functions(sources['EmployeeBaselineControl.gs']);
assert.deepEqual(Object.keys(current).sort(),[...Object.keys(previous),'employeeBaselineControlWithLock_'].sort());
for(const[name,text]of Object.entries(previous)){
  const expected=['employeeBaselineControlPrepare_','employeeBaselineControlClose_'].includes(name)?text.replace('employeeWithLock_(', 'employeeBaselineControlWithLock_('):text;
  assert.equal(current[name],expected,'unapproved function change '+name);
}
const shared=functions(sources['EmployeeLifecycleStore.gs']).employeeWithLock_;
const expectedHelper=shared.replace('employeeWithLock_(', 'employeeBaselineControlWithLock_(').replace('finally { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } }','finally { lock.releaseLock(); }');
assert.equal(current.employeeBaselineControlWithLock_.replace(/\r\n/g,'\n'),expectedHelper.replace(/\r\n/g,'\n'));
assert(!/SpreadsheetApp|setValue|appendRow|clearContent/.test(current.employeeBaselineControlWithLock_));
assert.equal((sources['EmployeeBaselineControl.gs'].match(/return employeeBaselineControlWithLock_\(/g)||[]).length,2);
assert(!sources['EmployeeBaselineControl.gs'].includes('return employeeWithLock_('));
// Evaluate only global declarations, never business handlers/services.
const e=require('./service-fixture.cjs').env(),ref=require('../../gas-t4-read-diagnostics/tests/service-fixture.cjs').env();
assert.deepEqual(JSON.parse(JSON.stringify(e.ctx.EMPLOYEE_ACTIONS_)),JSON.parse(JSON.stringify(ref.ctx.EMPLOYEE_ACTIONS_)));
assert(!e.ctx.EMPLOYEE_ACTIONS_.some(n=>/Control|Prepare|Claim|Close|Integrity/.test(n)));
const json=JSON.parse(read('sources/appsscript.json'));assert.deepEqual(json.oauthScopes,['https://www.googleapis.com/auth/spreadsheets.currentonly','https://www.googleapis.com/auth/script.external_request']);
assert.deepEqual(json.webapp,{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'});
let inline=0;for(const match of read('sources/index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim()){new vm.Script(match[1]);inline++;}
for(const f of fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs')))new vm.Script(fs.readFileSync(path.join(__dirname,f),'utf8'),{filename:f});
for(const name of ['EmployeeApplication.gs','EmployeeLifecycleBaseline.gs','EmployeeBaselineControl.gs'])assert(!/\b(?:Logger|console)\s*\.|deleteRows?\s*\(|deleteSheet\s*\(|setTimeout|setInterval|CacheService/.test(sources[name]));
for(const text of Object.values(sources))assert(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|['"]U[a-f0-9]{32}['"]/.test(text),'secret signature');
const worker=fs.readFileSync(path.join(repo,'transport-v2/worker/relay.mjs'),'utf8');
// Git's Windows checkout may use CRLF; compare the unchanged LF Git artifact.
assert.equal(hash(worker.replace(/\r\n/g,'\n')),'172353c88ff9ed6b41b0640f5536b3a792ba9f8f1fbb22e1ad69131eb696bf68');
assert(!/employee-baseline-migrate|T4_CONTROLLED_MIGRATION_ENABLED/.test(worker));
const report={method:'Acorn lexical scope identifier resolution + global reference closure; fixed eval integrity helper separately runtime-tested. Static analysis is not a proof of Google service authorization or atomicity.',globals:Object.keys(globals).length,functions:Object.values(globals).filter(g=>g.kind==='FunctionDeclaration').length,
  duplicateGlobals:[],duplicateFunctions:[],unresolvedRuntimeSymbols:unresolved,t4Closure:closure(t4roots),dispatcherClosure:closure(['doPost']),services:[...services].sort(),actionSet:plain(e.ctx.EMPLOYEE_ACTIONS_),symbols:globals,
  checks:{gasSyntax:gs.length,htmlInlineSyntax:inline,manifest:true,dispatcherUnchanged:true,maintenanceOnlyPatch:true,migrationSharedLockPreserved:true,sourceBundlesUnchanged:true}};
function plain(x){return JSON.parse(JSON.stringify(x));}
fs.writeFileSync(path.join(root,'evidence/dependency-closure.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS STATIC '+JSON.stringify({globals:report.globals,functions:report.functions,t4Closure:report.t4Closure.length,dispatcherClosure:report.dispatcherClosure.length,...report.checks}));
