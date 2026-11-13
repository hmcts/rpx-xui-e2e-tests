import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes} from './exui-evidence-io.mjs';
import {readEventSerialV3FaultSemantics} from './exui-event-v3-fault-semantics.mjs';
import {EVENT_SERIAL_V3_FAULTS} from './exui-ccd-event-transition-v3.mjs';
import {selectEventCapabilityRuntime} from './exui-ccd-event-transition.mjs';
import {seedAppCcdSessions} from './exui-native-contract.mjs';
import {readSourceShapeArtifacts,sourceShapeArtifactNames} from './exui-event-v3-source-shape-artifacts.mjs';
import {replayEventV3SourceShapeObservations} from './exui-event-v3-source-shape-observations.mjs';
const scope='exui-ccd-event-capability-pilot';
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const check=value=>{if(!value)throw Error('INVALID_SOURCE_SHAPE_REPLAY');};
const same=(a,b)=>check(isDeepStrictEqual(a,b));
const exact=(v,keys)=>same(Object.keys(v??{}).sort(),keys.slice().sort());
// The legacy source fixture records the candidate's full user-details response.
// Authenticate that finite raw shape only after both file-pin authorities agree;
// credentials and ancillary profile fields never enter the pure domain oracle.
function sourceShapeActor(value,credential){
 const bounded=value=>typeof value==='string'&&value.length<=4096;
 check(value&&typeof value==='object'&&!Array.isArray(value)&&Array.isArray(value.roles));
 if(Object.keys(value??{}).length===2){exact(value,['id','roles']);same(value.id,credential.userId);same(value.roles.slice().sort(),credential.roles.slice().sort());}
 else{
  exact(value,['id','uid','email','forename','surname','roles','roleCategory','roleCategories','token','filterOwnerHash']);
  same(value.id,credential.userId);same(value.uid,credential.userId);check(bounded(value.email)&&value.email.length>0);same(value.email,credential.email);
  check(typeof credential.headers.Authorization==='string'&&credential.headers.Authorization.startsWith('Bearer '));same(value.token,credential.headers.Authorization);
  same(value.roles.slice().sort(),credential.roles.slice().sort());
  same(value.filterOwnerHash,createHash('sha256').update('exui-filter-owner:'+credential.userId).digest('hex'));
  check(['forename','surname','roleCategory'].every(key=>bounded(value[key])));
  check(Array.isArray(value.roleCategories)&&value.roleCategories.length<=16&&value.roleCategories.every(bounded));
 }
 return {id:value.id,roles:value.roles.slice()};
}
export function readEventSerialV3SourceShapeSemantics(directory,heldChain,selection){
 try{
  check(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory);
  exact(selection,['runPin','invocationId']);sourceShapeArtifactNames(selection.invocationId);check(selection.invocationId!=='baseline');
  const pinned=(ref,relative)=>{
   exact(ref,['path','digest']);same(ref.path,relative);check(relative.split('/').every(p=>/^[a-z0-9][a-z0-9.-]*$/i.test(p)&&p!=='..'));
   const file=path.join(directory,relative);check(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file&&fs.statSync(file).size<=16*1024*1024);
   const bytes=fs.readFileSync(file);same(digestBytes(bytes),ref.digest);return bytes;
  };
  const parse=bytes=>JSON.parse(bytes.toString());
  const structured=readEventSerialV3FaultSemantics(directory,heldChain,selection);
  const run=parse(pinned(selection.runPin,'run.json')),input=parse(pinned(heldChain.input,'input.json'));
  const selectedEntry=heldChain.faults.find(row=>row.invocationId===selection.invocationId),capture=parse(pinned(selectedEntry.capture,'v3/'+selection.invocationId+'/capture.json'));
  const selected=selectEventCapabilityRuntime(input,selection.invocationId,parse(pinned(capture.runtimeRecord,selection.invocationId+'/runtime-input.json')));
  const packets={},identities={};
  for(const [id,runtime]of [['baseline',input],[selection.invocationId,selected]]){
   const entry=id==='baseline'?heldChain.baseline:selectedEntry,completion=parse(pinned(entry.completion,'v3/'+id+'/completion.json')),readbacks=parse(pinned(completion.readbacks,id+'/v3-readbacks.json'));
   exact(readbacks,['schemaVersion','invocationId','files']);same(readbacks.schemaVersion,3);same(readbacks.invocationId,id);
   const executionRefs=run.executionArtifacts.filter(ref=>ref.path===id+'/execution.json');same(executionRefs.length,1);
   const execution=parse(pinned(executionRefs[0],id+'/execution.json'));
   const raw=readSourceShapeArtifacts(directory,id,readbacks.files,execution),read=name=>parse(raw[name]);
   // Only after all double pins and raw digests validate may domain data be decoded.
   const manifest=read('manifest.json'),context=read('context.json'),personas=read('personas.json');
   same(manifest.identity,execution.identity);
   for(const key of ['runId','harnessCommit','releaseScopeId','policyDigest'])same(manifest[key],heldChain.baselineExpected[key]);
   same(context,{...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key=>[key,manifest[key]])),invocationId:id,harnessSourceState:'clean',harnessSourceDigest:input.harnessSourceDigest});
   exact(personas,['credentials','sessions']);same(personas.credentials,runtime.credentials);
   const sessionNames=Object.keys(seedAppCcdSessions(runtime.credentials,name=>name,scope));same(Object.keys(personas.sessions).sort(),sessionNames.sort());
   check(Object.values(personas.sessions).every(v=>typeof v==='string'&&v.length>0)&&new Set(Object.values(personas.sessions)).size===sessionNames.length);
   identities[id]=Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map(name=>[name,runtime.credentials[name].userId]));
   const requests=raw['ccd-requests.jsonl'].toString().trim().split('\n').map(line=>JSON.parse(line));
   packets[id]=(id==='baseline'?shapes:[selection.invocationId.slice(10)]).map(shape=>{
    const observation=read(`source-shape-${shape}-observation.json`);
    return {shape,observation:{...observation,actor:sourceShapeActor(observation.actor,runtime.credentials.courtadmin)},ui:read(`source-shape-${shape}-ui-observation.json`),requests};
   });
  }
  const replayed=replayEventV3SourceShapeObservations({invocationId:selection.invocationId,baselineActorIds:identities.baseline,selectedActorIds:identities[selection.invocationId],baseline:packets.baseline,selected:packets[selection.invocationId][0]});
  return {...structured,replayScope:'structured-proof-import-derivation-and-source-shape-observations',sourceShapeDomain:{baselineShapes:replayed.baselineShapes,selectedFaults:replayed.selectedFaults,uiObservations:7},incompleteDomainFaults:EVENT_SERIAL_V3_FAULTS.filter(id=>!id.startsWith('ccd-shape-'))};
 }catch{throw Error('EVENT_V3_SOURCE_SHAPE_REPLAY_INVALID');}
}
