const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const scope = "exui-global-search-pilot";
const nine = ["IA","CIVIL","PRIVATELAW","PUBLICLAW","EMPLOYMENT","ST_CIC","PROBATE","PCS","DIVORCE"];
const seven = ["IA","CIVIL","PRIVATELAW","PUBLICLAW","EMPLOYMENT","ST_CIC","PCS"];

test("support only: Global Search has one composition obligation and two fixed native invocations outside default CI", async () => {
  const {getReleasePolicy}=await import("./lib/exui-release-policy.mjs");
  const {nativeInvocations}=await import("./lib/exui-native-contract.mjs");
  const policy=getReleasePolicy(scope);
  assert.deepEqual(policy.requiredObligationIds,["global-search-capability-composition"]);
  assert.deepEqual(policy.obligations[0].requiredProofIds,["global-search-all-services"]);
  assert.equal(policy.mutationDefinitions[0].expectedFailureId,"global-search-capability-scope");
  assert.deepEqual(nativeInvocations(scope).map(x=>x.invocationId),["baseline","global-search-wa-capability"]);
  const expected={"exui-wa-family-pilot":"sha256:a9c6dd75394cace607ae4bf13dc1c9091565c64fc73d95d32a4426e3cfb7b43f","exui-wa-scope-pilot":"sha256:7f870c55aff532dbba8196503505bfbcbf48274785eefe67a2c6798aacdedfd0","exui-ccd-pilot":"sha256:dd0cdf377d3a46b93ae0c8114ee6b00158b7b8b91f3de6851e76fc1a75d14a23","exui-decentralised-routing-pilot":"sha256:a0710040edd2b505a2bfcbe8c0b97c94de36420c1d9843a864d69fa6083c65c5"};
  for(const [name,digest]of Object.entries(expected))assert.equal(getReleasePolicy(name).policyDigest,digest);
  const calls=[];await(await import("./run-harness-ci.mjs")).runFixedCiPilots({phase:async name=>{calls.push(name);return{status:"PASS",exitCode:0}},derive:async()=>{},start:async()=>{},stop:async()=>{},startEvent:async()=>{},stopEvent:async()=>{},startCallback:async()=>{},stopCallback:async()=>{}});
  assert.deepEqual(calls,["family","scope","ccd","eventCapability","routing","recipientCallback","selectorEventRow"]);
});

test("support only: wrong-capability mutation changes only globalSearchServices and its effective identity", async()=>{
  const {globalSearchConfiguration}=await import("./lib/exui-global-search-contract.mjs");
  const {nativeIdentity}=await import("./lib/exui-native-contract.mjs");
  const config={now:false,globalSearchServices:nine.join(","),waSupportedJurisdictions:seven.join(","),staffSupportedJurisdictions:"unchanged",feature:{},services:{idam:{}}};
  assert.deepEqual(globalSearchConfiguration(config),config);
  const expected=structuredClone(config);expected.globalSearchServices=seven.join(",");
  assert.deepEqual(globalSearchConfiguration(config,"global-search-wa-capability"),expected);
  assert.equal(config.globalSearchServices,nine.join(","));
  assert.throws(()=>globalSearchConfiguration(config,"unknown"),/UNSUPPORTED/);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"global-config-"));
  try{fs.mkdirSync(path.join(root,"config"));fs.writeFileSync(path.join(root,"config/default.json"),JSON.stringify(config));
    const input={releaseScopeId:scope,artifact:{identity:{artifactDigest:"sha256:"+"a".repeat(64)}}};
    const a=nativeIdentity(input,{mutation:null},root),b=nativeIdentity(input,{mutation:"global-search-wa-capability"},root);
    const changed=structuredClone(a.config);changed.globalSearchServices=seven.join(",");
    assert.deepEqual(b.config,changed);assert.equal(b.config.now,false);assert.notEqual(a.identity.configurationDigest,b.identity.configurationDigest);assert.equal(a.identity.artifactDigest,b.identity.artifactDigest);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

function body(ids){return{searchCriteria:{CCDCaseTypeIds:null,CCDJurisdictionIds:ids,caseManagementBaseLocationIds:null,caseManagementRegionIds:null,caseReferences:["1111222233334444"],otherReferences:null,parties:[],stateIds:null},sortCriteria:null,maxReturnRecordCount:25,startRecordNumber:1};}
const request=(method,route,value)=>new Promise((resolve,reject)=>{const req=http.request({host:"127.0.0.1",port:3101,method,path:route,agent:false,headers:{Host:"127.0.0.1:3103",...(value?{"content-type":"application/json"}:{})}},res=>{let text="";res.on("data",x=>text+=x);res.on("end",()=>resolve({status:res.statusCode,body:text}));});req.on("error",reject);req.end(value?JSON.stringify(value):undefined);});

test("support only: scoped provider accepts real nine/seven POSTs and exact auxiliary read; rejects other contracts",async()=>{
  const {startGlobalSearchProviders}=await import("./lib/exui-global-search-provider.mjs");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"global-provider-"));const sessions=[];
  const {server}=await startGlobalSearchProviders(root,{seed:(_assignments,id)=>{sessions.push(id);return{id}}});
  try{
    const rows=await request("GET","/refdata/location/orgServices");assert.equal(rows.status,200);
    assert.deepEqual(JSON.parse(rows.body).map(x=>x.ccd_service_name).sort(),[...nine,"SSCS"].sort());
    for(const ids of [nine,seven])assert.equal((await request("POST","/globalSearch",body(ids))).status,200);
    assert.equal((await request("GET","/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read")).body,"[]");
    for(const [method,url,value]of[
      ["POST","/refdata/location/orgServices",{}],["GET","/refdata/location/orgServices?extra=true"],
      ["GET","/globalSearch"],["POST","/globalSearch?extra=true",body(nine)],
      ["POST","/globalSearch",body([...seven,"SSCS"])],["POST","/globalSearch",{...body(nine),extra:true}],
      ["POST","/globalSearch",{...body(nine),searchCriteria:{...body(nine).searchCriteria,caseReferences:["9999000011112222"]}}],
      ["POST","/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read",{}],
      ["GET","/aggregated/caseworkers/foreign/jurisdictions?access=read"],
      ["GET","/aggregated/caseworkers/harness-supervisor/jurisdictions?access=create"],
      ["GET","/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read&access=read"],
      ["GET","/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read&extra=true"],
      ["GET","/undeclared"],
    ])assert.equal((await request(method,url,value)).status,501,url);
    const journal=fs.readFileSync(path.join(root,"global-search-destinations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
    assert.equal(journal.length,4);assert(journal.every(x=>x.port===3101));
    assert.deepEqual(journal.filter(x=>x.method==="POST").map(x=>x.body.searchCriteria.CCDJurisdictionIds),[nine,seven]);
    assert.equal(new Set(sessions).size,1);assert.match(sessions[0],/^harness-global-search-[a-f0-9-]{36}$/);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

async function browserSupport(root){const ts=require("typescript"),compiled=ts.transpileModule(fs.readFileSync("src/harness/globalSearch.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});const file=path.join(root,"global.mjs");fs.writeFileSync(file,compiled.outputText);return import(pathToFileURL(file).href);}
test("support only: literal browser oracle is independent; future lazy scripts and actual CSRF presence/hash are observed",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"global-browser-"));
  try{const api=await browserSupport(root);assert.deepEqual(api.EXPECTED_GLOBAL_SERVICES.map(x=>x.id),nine);
    assert.equal(api.isGlobalSearchAsset("http://127.0.0.1:3100/future-lazy.mjs","other"),true);
    assert.equal(api.isGlobalSearchAsset("http://127.0.0.1:3100/future-script","script"),true);
    assert.equal(api.isGlobalSearchAsset("http://outside.invalid/future.js","script"),false);
    const observed=api.observeGlobalSearchPost("http://127.0.0.1:3100/api/globalsearch/results","POST",{"x-xsrf-token":"actual-response-token"});
    assert.equal(observed.csrfHeaderPresent,true);assert.match(observed.csrfHeaderDigest,/^sha256:[a-f0-9]{64}$/);assert(!JSON.stringify(observed).includes("actual-response-token"));
    for(const headers of [{},{"x-xsrf-token":""}])assert.throws(()=>api.observeGlobalSearchPost("http://127.0.0.1:3100/api/globalsearch/results","POST",headers),/ACTUAL_BROWSER_CSRF/);
    assert.throws(()=>api.observeGlobalSearchPost("http://127.0.0.1:3101/api/globalsearch/results","POST",{"x-xsrf-token":"token"}),/POST_CONTRACT/);
    // DOM7 alone cannot attribute the intended fault when the actual accepted POST still has nine IDs.
    let membershipStepReached=false;
    const mutantProof=(upstreamIds)=>{api.assertGlobalSearchMutationSubmission(upstreamIds,"global-search-wa-capability");membershipStepReached=true;assert.deepEqual([...seven].sort(),[...nine].sort());};
    assert.throws(()=>mutantProof(nine),/GLOBAL_SEARCH_MUTANT_POST_MUST_BE_WA_SEVEN/);
    assert.equal(membershipStepReached,false);
    assert.throws(()=>mutantProof(seven),assert.AssertionError);assert.equal(membershipStepReached,true);
    assert.throws(()=>api.assertGlobalSearchMutationSubmission([...seven,"IA"],"global-search-wa-capability"),/GLOBAL_SEARCH_MUTANT_POST_MUST_BE_WA_SEVEN/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("support only: new scope stays within existing origins, fixed source closure and one proof collection",async()=>{
  const {candidateEnvironment,HARNESS_SOURCE_FILES}=await import("./lib/exui-candidate-runtime.mjs");
  assert.throws(()=>candidateEnvironment({url:"http://127.0.0.1:3102"},"/diagnostics",scope),/UNDECLARED/);
  for(const file of ["scripts/lib/exui-global-search-contract.mjs","scripts/lib/exui-global-search-provider.mjs","src/harness/globalSearch.ts","src/fixtures/harnessGlobalSearch.ts","src/tests/harness/global-search/capability-composition.spec.ts"])assert(HARNESS_SOURCE_FILES.includes(file),file);
  const {captureCiPhaseExpectation}=await import("./lib/exui-candidate-ci-evidence.mjs");
  assert.throws(()=>captureCiPhaseExpectation("globalSearch",{harnessSources:[]},null,null,null),/CI_LAUNCH_SOURCE_INVENTORY_MISMATCH/);
  const {captureNativeOwnership}=await import("./lib/exui-native-ci-ownership.mjs");
  assert.throws(()=>captureNativeOwnership({releaseScopeId:scope,runId:"candidate-11111111-1111-4111-8111-111111111111"},{},{},"/fresh","globalSearch"),/CI_NATIVE_OUTPUT_MISMATCH/);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"global-collection-"));
  try{const {completeRun}=require("./fixtures/exui-release-evidence.mock.cjs"),input=completeRun();const p=(await import("./lib/exui-release-policy.mjs")).getReleasePolicy(scope);Object.assign(input.manifest,{releaseScopeId:scope,policyDigest:p.policyDigest,requiredObligationIds:p.requiredObligationIds});const manifest=path.join(root,"manifest.json");fs.writeFileSync(manifest,JSON.stringify(input.manifest));
    const env={PATH:process.env.PATH,EXUI_HARNESS_SELECTION:"candidate",EXUI_HARNESS_SLICE:"global-search",EXUI_CANDIDATE_RUN_MANIFEST:manifest,EXUI_CANDIDATE_URL:"http://127.0.0.1:3100",EXUI_EVIDENCE_CONTEXT:path.join(root,"context.json"),EXUI_EVIDENCE_REPORT:path.join(root,"report.json")};
    const result=spawnSync(process.execPath,["node_modules/@playwright/test/cli.js","test","--config","playwright.harness.config.ts","--list","--reporter=list"],{env,encoding:"utf8"});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Total: 1 test/);assert(!fs.existsSync(env.EXUI_EVIDENCE_REPORT));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("support only: native arguments admit both fixed Global Search invocations without enabling the OCI image scope",async()=>{
  const {toolContainerArguments,candidateArchiveArguments}=await import("./lib/exui-oci-runtime.mjs");
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),"global-arguments-"));
  try{
    const dirs=Object.fromEntries(["harnessRoot","dependenciesRoot","candidateRoot","output","browserRoot","sessions","diagnostics"].map(key=>{const value=path.join(root,key);fs.mkdirSync(value);return[key,value]}));
    const guard=path.join(root,"guard.cjs");fs.writeFileSync(guard,"readonly");
    const common={...dirs,image:"sha256:"+"a".repeat(64),owner:"candidate-11111111-1111-4111-8111-111111111111",platform:"linux/arm64"};
    for(const invocationId of ["baseline","global-search-wa-capability"]){
      const tools=toolContainerArguments({...common,invocationId,native:true});assert(tools.includes(invocationId));assert.equal(tools[tools.indexOf("--network")+1],"none");
      const args=candidateArchiveArguments({...common,guard,invocationId,namespace:"b".repeat(64),config:{},releaseScopeId:scope,evidenceRoot:dirs.output});
      assert.equal(args[args.indexOf("--network")+1],"container:"+"b".repeat(64));assert(!args.includes("--publish"));
    }
    assert.throws(()=>toolContainerArguments({...common,invocationId:"global-search-wa-capability",native:false}),/UNSUPPORTED_OCI_INVOCATION/);
    assert.throws(()=>candidateArchiveArguments({...common,guard,invocationId:"global-search-wa-capability",namespace:"b".repeat(64),config:{},releaseScopeId:"exui-wa-family-pilot",evidenceRoot:dirs.output}),/GLOBAL_SEARCH_SCOPE_REQUIRED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
