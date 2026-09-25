// Local release manifest only. Never talks to Apps Script or any remote service.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline={
  '程式碼.gs':'7382764a0446a8937913789623516257ccb26c5162c155838be8d3d867fd1651',
  'appsscript.json':'788d42fd367f154e0fc730f8953b842365de440f58560dc4333f723e0c8b44f3',
  'index.html':'523048d4eae2135528794580ca57bdf93bddefcf550caf9fdeb0f9f650c63ff2',
  'EmployeeIdentity.gs':'c6d8dad46ee6e0b5ed31408b6f6a80144f8e017d623b06100fca3b21a3ee74cf',
  'EmployeeLifecycleStore.gs':'40990ea7487a3588ee91b937b62ca91f4d461a51c3acb2de5893e015f171b951',
  'EmployeeApplication.gs':'d560abdab333a73e36dc7ead0e30906593fa8d00c9f0f0e43ee091af2e37f169',
  'EmployeeApplicationAdmin.gs':'b5761d9ab6c5027766955f96bfb2765d0d84e6348b97b160d361bba277e4ca46',
  'EmployeeLifecycleRead.gs':'602a7157ed5e9756947aa14ae546263b5593fed420f74b04e5a8e99c8cb3a56d',
  'EmployeeLifecycleMutation.gs':'7d3c454f37f9f0e1d60eaaa0415ae7c10f2fa1f44834fe571f3bc5199ecaf083',
  'EmployeeLifecycleBaseline.gs':'3582ce0afa4841664887ade1dd96f2969bac0b82c7aa167987a4ed8378296156'
};
const changed={
  'EmployeeApplication.gs':['employeeFoundationRequest_','handleEmployeeFoundation_'],
  'EmployeeLifecycleBaseline.gs':['employeeBaselineRequestStatus_']
};
function functions(text){
  const found=[...text.matchAll(/^function (\w+)\(/gm)],result={};
  found.forEach((m,i)=>result[m[1]]=text.slice(m.index,found[i+1]?.index||text.length).trim());return result;
}
function bundle(directory){
  // Concatenate UTF-8 filename + NUL + ASCII byteLength + NUL + exact file bytes.
  return hash(Buffer.concat(Object.keys(baseline).sort().flatMap(file=>{
    const bytes=fs.readFileSync(path.join(root,directory,file));return [Buffer.from(file+'\0'+bytes.length+'\0','utf8'),bytes];
  })));
}
function manifest(){
  const files=Object.keys(baseline).sort();
  for(const dir of ['evidence/v44-sources','sources'])assert.deepEqual(fs.readdirSync(path.join(root,dir)).sort(),files);
  const matrix=files.map(file=>{
    const original=fs.readFileSync(path.join(root,'evidence/v44-sources',file)),candidate=fs.readFileSync(path.join(root,'sources',file));
    assert.equal(hash(original),baseline[file],'immutable V44 '+file);
    const before=functions(original.toString('utf8')),after=functions(candidate.toString('utf8'));
    const modifiedFunctions=Object.keys(before).filter(name=>before[name]!==after[name]);
    const addedFunctions=Object.keys(after).filter(name=>!Object.hasOwn(before,name));
    const removedFunctions=Object.keys(before).filter(name=>!Object.hasOwn(after,name));
    assert.deepEqual(modifiedFunctions,changed[file]||[],file+' changed functions');assert.deepEqual(removedFunctions,[]);
    if(!Object.hasOwn(changed,file)){assert(original.equals(candidate));assert.deepEqual(addedFunctions,[]);}
    else assert(!original.equals(candidate));
    return {file,status:original.equals(candidate)?'UNCHANGED':'MODIFIED',baseSha256:hash(original),candidateSha256:hash(candidate),
      baseSize:original.length,size:candidate.length,modifiedFunctions,addedFunctions,removedFunctions};
  });
  return {format:1,status:'OFFLINE_REVIEW_CANDIDATE',productionMigration:'HOLD',
    source:{version:44,exportSha256:'804c166e5b6e77ea9b4286d7a5bc9d26f9fe7216eb44aa86a6930c41cf0a6ca4',
      assurance:'Saved export and prior projects.getContent(versionNumber=44) report; no fresh Production query. Never derived from main/V45 sources.'},
    workerBase:'c4ba55ca147da676759d7098f60ce4a4e31a77d3',frontendBase:'ebe52b07ee307f4b615af478775c32f0ceb99ef3',
    bundleHashFormat:'SHA-256 of concatenated sorted UTF-8 filename + NUL + ASCII byteLength + NUL + exact bytes; covers all 10 deployable files, not manifest/tests/docs',
    fullCandidateSha256:bundle('sources'),evidenceBundleSha256:bundle('evidence/v44-sources'),
    matrix,addedGasFiles:[],removedGasFiles:[]};
}
if(require.main===module){
  const data=manifest();
  if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'source-manifest.json'),JSON.stringify(data,null,2)+'\n');
  else assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json'),'utf8')),data);
  console.log(JSON.stringify({matrix:data.matrix.map(({file,status})=>({file,status})),fullCandidateSha256:data.fullCandidateSha256,evidenceBundleSha256:data.evidenceBundleSha256}));
}
module.exports={manifest};
