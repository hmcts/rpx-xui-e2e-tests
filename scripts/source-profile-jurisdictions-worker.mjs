import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyProfileSources,profileFailureCode} from './lib/exui-source-profile-sources.mjs';
import {describeCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {sourceProfileJurisdictionConfiguration,probeProfileJurisdictions,SOURCE_PROFILE_JURISDICTION_SCOPE,SOURCE_PROFILE_JURISDICTION_FAULT} from './lib/exui-source-profile-jurisdictions.mjs';
import {startProfileJurisdictionProviders} from './lib/exui-source-profile-provider.mjs';
import {WA_HEALTH_SCOPE,WA_HEALTH_FAULT,sourceProfileWaHealthConfiguration,probeWaHealth} from './lib/exui-source-profile-wa-health.mjs';
import {DIVORCE_WA_SCOPE,DIVORCE_WA_FAULT,WA_MEMBERSHIP_SCOPE,WA_MEMBERSHIP_FAULT,sourceProfileWaMembershipConfiguration,probeWaMembership} from './lib/exui-source-profile-wa-membership.mjs';
import {IA_WA_SCOPE,IA_WA_FAULT,iaWaConfiguration,probeIaWa} from './lib/exui-source-profile-ia-wa.mjs';
import {DIVORCE_CONSUMERS,divorceConsumerConfiguration,probeDivorceConsumers} from './lib/exui-source-profile-divorce-consumers.mjs';
import {divorceBrowserConfiguration} from './lib/exui-divorce-profile-contract.mjs';
import {probeDivorceBrowser} from './lib/exui-divorce-profile-browser.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const session='/tmp/source-profile-session.json';
async function context(invocationId) {
  const input=read('/output/profile-input.json');
  const facet=input.facet??'jurisdictions';assert(['jurisdictions','wa-health','wa-membership','divorce-staff','divorce-mapping','divorce-wa','divorce-jurisdiction','divorce-global-search','ia-wa-positive'].includes(facet),'SOURCE_PROFILE_INPUT_INVALID');const browserFacet=['divorce-jurisdiction','divorce-global-search'].includes(facet),divorce=['divorce-staff','divorce-mapping'].includes(facet)?facet.slice(8):null,health=facet==='wa-health',membership=['wa-membership','divorce-wa'].includes(facet),fault=facet==='ia-wa-positive'?IA_WA_FAULT:browserFacet?(facet==='divorce-jurisdiction'?SOURCE_PROFILE_JURISDICTION_FAULT:'source-profile-drop-divorce-global-search'):facet==='divorce-wa'?DIVORCE_WA_FAULT:divorce?DIVORCE_CONSUMERS[divorce].fault:membership?WA_MEMBERSHIP_FAULT:health?WA_HEALTH_FAULT:SOURCE_PROFILE_JURISDICTION_FAULT;
  assert.equal(input.scope,facet==='ia-wa-positive'?IA_WA_SCOPE:browserFacet?`exui-${facet}-feasibility`:facet==='divorce-wa'?DIVORCE_WA_SCOPE:divorce?DIVORCE_CONSUMERS[divorce].scope:membership?WA_MEMBERSHIP_SCOPE:health?WA_HEALTH_SCOPE:SOURCE_PROFILE_JURISDICTION_SCOPE,'SOURCE_PROFILE_INPUT_INVALID');
  assert(['baseline',fault].includes(invocationId),'SOURCE_PROFILE_INVOCATION_INVALID');
  verifyProfileSources(root,input.sources.digest);
  const observed=await describeCandidateArtifact('/candidate',input.artifact.provenance);
  assert.deepEqual(observed.identity,input.artifact.identity,'SOURCE_PROFILE_ARTIFACT_CHANGED');
  assert.equal(observed.payloadDigest,input.artifact.payloadDigest,'SOURCE_PROFILE_ARTIFACT_CHANGED');
  const mutation=invocationId==='baseline'?null:fault;
  const configuration=facet==='ia-wa-positive'?iaWaConfiguration('/candidate',mutation):browserFacet?divorceBrowserConfiguration('/candidate',facet,mutation):facet==='divorce-wa'?sourceProfileWaMembershipConfiguration('/candidate',mutation,'DIVORCE'):divorce?divorceConsumerConfiguration('/candidate',divorce,mutation):(membership?sourceProfileWaMembershipConfiguration:health?sourceProfileWaHealthConfiguration:sourceProfileJurisdictionConfiguration)('/candidate',mutation);
  assert.equal(configuration.digest,input.configurations[invocationId].digest,'SOURCE_PROFILE_CONFIG_DRIFT');
  if(browserFacet){assert(input.browser,'DIVORCE_PROFILE_BROWSER_REQUIRED');assert.equal(await digestCandidateTree('/browser'),input.browser.digest,'BROWSER_ARTIFACT_MISMATCH');await verifyHarnessDependencies('/harness/node_modules','/harness/package.json','/harness/yarn.lock',input.browser.dependencies.digest);}
  return {browser:input.browser,facet,directory:path.join('/output',invocationId),invocationId,mutation,identity:observed.identity,configDigest:configuration.digest,sourceDigest:input.sources.digest};
}
export async function executeProfileProof(current,{probe,cookie,readJournal}={}) {
  const {directory,invocationId,mutation,identity,configDigest,sourceDigest}=current;
  const browserFacet=['divorce-jurisdiction','divorce-global-search'].includes(current.facet),divorce=['divorce-staff','divorce-mapping'].includes(current.facet)?current.facet.slice(8):null,health=current.facet==='wa-health',membership=['wa-membership','divorce-wa'].includes(current.facet);probe??=current.facet==='ia-wa-positive'?probeIaWa:browserFacet?options=>probeDivorceBrowser({...options,facet:current.facet,browser:current.browser}):current.facet==='divorce-wa'?options=>probeWaMembership({...options,family:'DIVORCE'}):divorce?options=>probeDivorceConsumers({...options,facet:divorce}):membership?probeWaMembership:health?probeWaHealth:probeProfileJurisdictions;
  let status='observed',code=null,exitCode=0;
  try {await probe({cookie,output:directory,readJournal,mutation});assert.equal(mutation,null,'SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}
  catch(error) {
    code=profileFailureCode(error);
    if(mutation&&error.message===(current.facet==='ia-wa-positive'?'SOURCE_PROFILE_IA_WA_ASSERTION':browserFacet?(current.facet==='divorce-jurisdiction'?'SOURCE_PROFILE_JURISDICTION_ASSERTION':'DIVORCE_PROFILE_GLOBAL_ASSERTION'):divorce?(divorce==='staff'?'SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION':'SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION'):membership?'SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION':health?'SOURCE_PROFILE_WA_HEALTH_ASSERTION':'SOURCE_PROFILE_JURISDICTION_ASSERTION')){status='expected-fault-observed';exitCode=1;}
    else {status='failed';exitCode=2;}
  }
  write(path.join(directory,'profile-worker-result.json'),{schemaVersion:1,status,invocationId,mutation,code,identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false});
  write(path.join(directory,'framework-terminal.json'),{code:exitCode,signal:null});
  return exitCode;
}
async function providers(current) {
  const {server,cookie}=await startProfileJurisdictionProviders(current.directory,{iaPositive:current.facet==='ia-wa-positive',health:current.facet==='wa-health',membership:['wa-membership','divorce-wa'].includes(current.facet),membershipFamily:current.facet==='divorce-wa'?'DIVORCE':'CMC',divorce:['divorce-staff','divorce-mapping'].includes(current.facet)?current.facet.slice(8):null,browserFacet:['divorce-jurisdiction','divorce-global-search'].includes(current.facet)?current.facet:null});
  // The proof client runs in this same owned provider container. Credentials never enter the evidence mount.
  write(session,{cookie});
  write(path.join(current.directory,'provider-ready.json'),{sourceDigest:current.sourceDigest,configDigest:current.configDigest,artifactVerified:true});
  process.once('SIGTERM',()=>{
    const timeout=setTimeout(()=>process.exit(2),5000);timeout.unref();
    server.close(error=>{
      fs.rmSync(session,{force:true});
      write(path.join(current.directory,'provider-stopped.json'),{closed:!error,requestedSignal:'SIGTERM'});
      process.exit(error?2:0);
    });
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  try {
    const args=process.argv.slice(2);
    if(args.length===1&&args[0]==='--verify-only')console.log(JSON.stringify({status:'source-verified',...verifyProfileSources(root)}));
    else {
      assert(args.length===3&&['--inside-providers','--inside-proof'].includes(args[0])&&args[1]==='--invocation','SOURCE_PROFILE_INPUT_INVALID');
      const current=await context(args[2]);
      if(args[0]==='--inside-providers')await providers(current);
      else process.exitCode=await executeProfileProof(current,{cookie:read(session).cookie,readJournal:()=>read(path.join(current.directory,current.facet==='ia-wa-positive'?'profile-ia-wa-destinations.json':current.facet==='divorce-global-search'?'profile-global-destinations.json':['divorce-staff','divorce-mapping'].includes(current.facet)?'profile-divorce-destinations.json':['wa-membership','divorce-wa'].includes(current.facet)?'profile-wa-membership-destinations.json':current.facet==='wa-health'?'profile-health-destinations.json':'profile-jurisdiction-destinations.json'))});
    }
  } catch(error) {console.error(JSON.stringify({status:'failed',code:profileFailureCode(error)}));process.exitCode=2;}
}
