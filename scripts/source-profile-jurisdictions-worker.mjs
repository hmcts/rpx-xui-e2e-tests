import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyProfileSources,profileFailureCode} from './lib/exui-source-profile-sources.mjs';
import {describeCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {sourceProfileJurisdictionConfiguration,probeProfileJurisdictions,SOURCE_PROFILE_JURISDICTION_SCOPE,SOURCE_PROFILE_JURISDICTION_FAULT} from './lib/exui-source-profile-jurisdictions.mjs';
import {startProfileJurisdictionProviders} from './lib/exui-source-profile-provider.mjs';
import {WA_HEALTH_SCOPE,WA_HEALTH_FAULT,sourceProfileWaHealthConfiguration,probeWaHealth} from './lib/exui-source-profile-wa-health.mjs';
import {WA_MEMBERSHIP_SCOPE,WA_MEMBERSHIP_FAULT,sourceProfileWaMembershipConfiguration,probeWaMembership} from './lib/exui-source-profile-wa-membership.mjs';
import {DIVORCE_CONSUMERS,divorceConsumerConfiguration,probeDivorceConsumers} from './lib/exui-source-profile-divorce-consumers.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const session='/tmp/source-profile-session.json';
async function context(invocationId) {
  const input=read('/output/profile-input.json');
  const facet=input.facet??'jurisdictions';assert(['jurisdictions','wa-health','wa-membership','divorce-staff','divorce-mapping'].includes(facet),'SOURCE_PROFILE_INPUT_INVALID');const divorce=facet.startsWith('divorce-')?facet.slice(8):null,health=facet==='wa-health',membership=facet==='wa-membership',fault=divorce?DIVORCE_CONSUMERS[divorce].fault:membership?WA_MEMBERSHIP_FAULT:health?WA_HEALTH_FAULT:SOURCE_PROFILE_JURISDICTION_FAULT;
  assert.equal(input.scope,divorce?DIVORCE_CONSUMERS[divorce].scope:membership?WA_MEMBERSHIP_SCOPE:health?WA_HEALTH_SCOPE:SOURCE_PROFILE_JURISDICTION_SCOPE,'SOURCE_PROFILE_INPUT_INVALID');
  assert(['baseline',fault].includes(invocationId),'SOURCE_PROFILE_INVOCATION_INVALID');
  verifyProfileSources(root,input.sources.digest);
  const observed=await describeCandidateArtifact('/candidate',input.artifact.provenance);
  assert.deepEqual(observed.identity,input.artifact.identity,'SOURCE_PROFILE_ARTIFACT_CHANGED');
  assert.equal(observed.payloadDigest,input.artifact.payloadDigest,'SOURCE_PROFILE_ARTIFACT_CHANGED');
  const mutation=invocationId==='baseline'?null:fault;
  const configuration=divorce?divorceConsumerConfiguration('/candidate',divorce,mutation):(membership?sourceProfileWaMembershipConfiguration:health?sourceProfileWaHealthConfiguration:sourceProfileJurisdictionConfiguration)('/candidate',mutation);
  assert.equal(configuration.digest,input.configurations[invocationId].digest,'SOURCE_PROFILE_CONFIG_DRIFT');
  return {facet,directory:path.join('/output',invocationId),invocationId,mutation,identity:observed.identity,configDigest:configuration.digest,sourceDigest:input.sources.digest};
}
export async function executeProfileProof(current,{probe,cookie,readJournal}={}) {
  const {directory,invocationId,mutation,identity,configDigest,sourceDigest}=current;
  const divorce=current.facet?.startsWith('divorce-')?current.facet.slice(8):null,health=current.facet==='wa-health',membership=current.facet==='wa-membership';probe??=divorce?options=>probeDivorceConsumers({...options,facet:divorce}):membership?probeWaMembership:health?probeWaHealth:probeProfileJurisdictions;
  let status='observed',code=null,exitCode=0;
  try {await probe({cookie,output:directory,readJournal,mutation});assert.equal(mutation,null,'SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}
  catch(error) {
    code=profileFailureCode(error);
    if(mutation&&error.message===(divorce?(divorce==='staff'?'SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION':'SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION'):membership?'SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION':health?'SOURCE_PROFILE_WA_HEALTH_ASSERTION':'SOURCE_PROFILE_JURISDICTION_ASSERTION')){status='expected-fault-observed';exitCode=1;}
    else {status='failed';exitCode=2;}
  }
  write(path.join(directory,'profile-worker-result.json'),{schemaVersion:1,status,invocationId,mutation,code,identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false});
  write(path.join(directory,'framework-terminal.json'),{code:exitCode,signal:null});
  return exitCode;
}
async function providers(current) {
  const {server,cookie}=await startProfileJurisdictionProviders(current.directory,{health:current.facet==='wa-health',membership:current.facet==='wa-membership',divorce:current.facet.startsWith('divorce-')?current.facet.slice(8):null});
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
      else process.exitCode=await executeProfileProof(current,{cookie:read(session).cookie,readJournal:()=>read(path.join(current.directory,current.facet.startsWith('divorce-')?'profile-divorce-destinations.json':current.facet==='wa-membership'?'profile-wa-membership-destinations.json':current.facet==='wa-health'?'profile-health-destinations.json':'profile-jurisdiction-destinations.json'))});
    }
  } catch(error) {console.error(JSON.stringify({status:'failed',code:profileFailureCode(error)}));process.exitCode=2;}
}
