// Reuse the reviewed harness; adapt only its expected transport version.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=path.resolve(__dirname,'../../t4-recovery-runner-final/tests/harness.cjs');
const source=fs.readFileSync(original,'utf8');
const old="const version='t4-safety-2-gas-read-diag'";
if(source.split(old).length!==2)throw Error('HARNESS_PROVENANCE_DRIFT');
const m=new Module(original,module);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));
m._compile(source.replace(old,"const version='t4-safety-3-content-redirect'"),original);
module.exports=m.exports;
