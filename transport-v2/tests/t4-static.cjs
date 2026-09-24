// Offline syntax, HTML structure and change-scope checks. No business execution.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const scripts=['transport-v2/worker/relay.mjs','transport-v2/live-test/client.js','transport-v2/controlled-test/client.js',
  ...fs.readdirSync(__dirname).filter(f=>/\.(cjs|mjs)$/.test(f)).map(f=>'transport-v2/tests/'+f)];
for(const file of scripts)execFileSync(process.execPath,['--check',path.join(root,file)],{windowsHide:true});
for(const file of ['EmployeeBaselineControl','EmployeeLifecycleBaseline'])new vm.Script(fs.readFileSync(path.join(root,'gas',file+'.gs'),'utf8'),{filename:file+'.gs'});
const htmlFiles=['transport-v2/live-test/index.html','transport-v2/controlled-test/index.html'];
const python=process.env.PYTHON_BIN||'python';
const parser=String.raw`
import sys
from html.parser import HTMLParser
from pathlib import Path
class Check(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack=[]; self.ids=set(); self.scripts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, 'duplicate id'; self.ids.add(a['id'])
        assert not any(k.startswith('on') for k in a), 'inline event'
        if tag=='script': self.scripts.append(a.get('src',''))
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}: self.stack.append(tag)
    def handle_endtag(self,tag):
        assert self.stack and self.stack.pop()==tag, 'unbalanced HTML: '+tag
for file in sys.argv[1:]:
    p=Check(); p.feed(Path(file).read_text(encoding='utf-8')); p.close()
    assert not p.stack, 'unclosed HTML'
    assert all(p.scripts), 'inline script'
print('PASS: 2 HTML documents, balanced structure, unique ids, no inline handlers')
`;
process.stdout.write(execFileSync(python,['-c',parser,...htmlFiles.map(f=>path.join(root,f))],{encoding:'utf8',windowsHide:true}));
for(const dir of ['live-test','controlled-test']){
  const code=fs.readFileSync(path.join(root,'transport-v2',dir,'client.js'),'utf8');
  assert(!/console\.|innerHTML|document\.cookie|eval\(/.test(code));
  assert(!/employeeLifecycle(?:Suspend|Leave|Resume|Terminate)|employeeApplication(?:Approve|Reject)/.test(code));
}
const changes=execFileSync('git',['diff','--name-only','HEAD','--','index.html','js','css','transport-v2/live-test/config.js'],{cwd:root,encoding:'utf8',windowsHide:true});
assert.equal(changes,'','production frontend/config untouched');
console.log(`PASS: ${scripts.length} JS syntax checks; 2 GAS parsers; privacy/static and production scope checks`);
