// Run the pinned 89-group suite against V44 evidence, not the combined runtime.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const file=path.resolve(__dirname,'../../gas-v44-read-diagnostics/tests/foundation-regression.cjs');
const original=fs.readFileSync(file,'utf8'),needle="p.replace(/^gas\\//, 'sources/')";
assert(original.includes(needle));
const compiled=new Module(file);compiled.filename=file;compiled.paths=module.paths;
compiled._compile(original.replace(needle,"p.replace(/^gas\\//, 'evidence/v44-sources/')"),file);
