const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
exports.outputFixture=t=>{
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'harness-private-output-'))),harness=path.join(directory,'harness');
 const privateRoot=path.join(harness,'functional-output/tests/harness/private'),job=path.join(privateRoot,'native-ci/job');
 fs.mkdirSync(path.join(job,'native-output/private'),{recursive:true,mode:0o700});fs.chmodSync(privateRoot,0o700);
 for(const name of ['scripts','src','node_modules','.git'])fs.mkdirSync(path.join(harness,name));
 for(const name of ['package.json','yarn.lock'])fs.writeFileSync(path.join(harness,name),'protected');
 const candidateRoot=path.join(job,'candidate'),browserRoot=path.join(job,'browser');fs.mkdirSync(candidateRoot);fs.mkdirSync(browserRoot);
 const candidate=path.join(candidateRoot,'candidate.json');fs.writeFileSync(candidate,'{}');
 const sourceRoot=path.join(job,'source-input');fs.mkdirSync(sourceRoot,{mode:0o700});const sourceInputs={javaHome:sourceRoot};
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 return{directory,harness,privateRoot,job,candidate,candidateRoot,browserRoot,sourceInputs};
};
exports.actualOutputCall=async(f,file,output)=>{
 const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
 const statement=source.match(/output=createFreshHarness(?:Runtime)?Output\([^;]+;/)?.[0];assert(statement,'actual output call required');
 const api=await import('../lib/exui-output-boundary.mjs');
 const values={...api,fs,sourceInputs:f.sourceInputs,browser:f.browserRoot,root:f.harness+'/',PERSONAL_ROOT:f.harness,path,output,directory:output,candidate:f.candidate,browserRoot:f.browserRoot,artifact:{candidateRoot:f.candidateRoot},cohort:{artifact:{candidateRoot:f.candidateRoot},browser:{root:f.browserRoot},dependencies:{root:path.join(f.harness,'node_modules')}}};
 return new Function(...Object.keys(values),statement+'return output;')(...Object.values(values));
};
