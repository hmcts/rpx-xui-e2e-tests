import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {nativeInvocations} from './exui-native-contract.mjs';
import {ST_CIC_PROFILE_FACETS} from './exui-st-cic-profile-contract.mjs';
import {DIVORCE_PROFILE_FACETS} from './exui-divorce-profile-contract.mjs';
import {COMPLEX_CONTEXTS} from './exui-complex-email-cohort.mjs';

const fail='ST_CIC_CROSS_COHORT_OWNERSHIP';
const phases=['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'];
const read=file=>{
 assert(path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),fail);
 const bytes=fs.readFileSync(file);let value;try{value=JSON.parse(bytes);}catch{throw Error(fail);}
 return {value,digest:digestBytes(bytes)};
};
const inventory=()=>({tokens:new Set(),workspaces:new Set()});
const token=(set,value)=>{assert(typeof value==='string'&&value.length>0,fail);set.tokens.add(value.replace(/^\//,''));};
const workspace=(set,value)=>{assert(typeof value==='string'&&path.isAbsolute(value)&&path.resolve(value)===value,fail);set.workspaces.add(value);};
function mounts(set,rows){
 assert(Array.isArray(rows),fail);
 for(const mount of rows){
  if(mount.writable===true)workspace(set,mount.source);
  if((mount.target==='/tmp/.sessions'&&path.basename(mount.source)==='sessions')||(mount.target==='/diagnostics'&&path.basename(mount.source)==='diagnostics'))workspace(set,path.dirname(path.dirname(mount.source)));
  if(mount.target==='/harness'&&path.basename(mount.source)==='sources')workspace(set,path.dirname(mount.source));
 }
}
function resources(set,rows){
 assert(Array.isArray(rows)&&rows.length>0,fail);
 for(const row of rows){assert(/^[a-f0-9]{64}$/.test(row.id),fail);for(const key of ['id','name','owner'])token(set,row[key]);if(row.namespace!==undefined)token(set,row.namespace);mounts(set,row.mounts);}
}
function ccd(set,state){
 assert(state&&state.containers&&Object.keys(state.containers).length>0,fail);
 token(set,state.owner);assert(/^[a-f0-9]{64}$/.test(state.namespace),fail);token(set,state.namespace);workspace(set,state.output);
 for(const [service,id]of Object.entries(state.containers)){assert(/^[a-f0-9]{64}$/.test(id),fail);token(set,id);token(set,state.owner+'-'+service);}
}
function requestRoot(file,pin,kind){
 assert(pin&&Object.keys(pin).sort().join(',')==='digest,runId',fail);
 const actual=read(file);assert.equal(actual.digest,pin.digest,fail);assert.equal(actual.value.kind,kind,fail);assert.equal(actual.value.expected.runId,pin.runId,fail);
 const directory=actual.value.directory;assert(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);
 return {directory,request:actual.value};
}
function profile(set,file,pin,kind,facets){
 const {directory,request}=requestRoot(file,pin,kind),input=read(path.join(directory,'expected-input.json'));
 assert.equal(input.digest,request.expected.inputDigest,fail);assert.equal(digestBytes(JSON.stringify(input.value.binding)),request.expected.bindingDigest,fail);
 const owners=input.value.binding.owners;assert.deepEqual(Object.keys(owners),facets.map(row=>row.facet),fail);workspace(set,directory);
 for(const {facet,fault}of facets){
  token(set,owners[facet]);const folder=path.join(directory,'cohort',facet);workspace(set,folder);
  const rows=read(path.join(folder,'owned-resources.json')).value;assert.equal(rows.length,4,fail);
  const names=['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>owners[facet]+'-'+id+'-'+role));
  assert.deepEqual(rows.map(row=>row.name).sort(),names.sort(),fail);resources(set,rows);
 }
 return directory;
}
function mainInventory(directory,expected){
 const set=inventory();assert.deepEqual(expected.phases.map(row=>row.phase),phases,fail);
 for(const row of expected.phases){
  token(set,row.expected.runId);const folder=path.join(directory,'private',row.phase);workspace(set,folder);
  const input=read(path.join(folder,'input.json')).value;if(input.ccd)ccd(set,input.ccd);
  resources(set,read(path.join(folder,'owned-resources.json')).value);
  workspace(set,read(path.join(folder,'container-launch.json')).value.stateRoot);
  for(const invocation of nativeInvocations(row.expected.releaseScopeId)){
   const lifecycle=read(path.join(folder,invocation.invocationId,'candidate-lifecycle.json')).value;
   for(const info of [lifecycle.before,lifecycle.after]){assert(/^[a-f0-9]{64}$/.test(info.Id),fail);token(set,info.Id);token(set,info.Name);if(info.Config?.Labels?.['exui.harness.owner'])token(set,info.Config.Labels['exui.harness.owner']);if(info.HostConfig?.NetworkMode?.startsWith('container:'))token(set,info.HostConfig.NetworkMode.slice('container:'.length));if(info.Mounts!==undefined){assert(Array.isArray(info.Mounts),fail);mounts(set,info.Mounts.map(m=>({source:m.Source,target:m.Destination,writable:m.RW})));}}
  }
  if(['eventCapability','recipientCallback','selectorEventRow'].includes(row.phase))for(const invocation of nativeInvocations(row.expected.releaseScopeId).filter(item=>item.kind==='mutation')){const captured=read(path.join(folder,invocation.invocationId,'runtime-input.json')).value;ccd(set,row.phase==='selectorEventRow'?captured.runtime.ccd:captured.ccd);}
 }
 return set;
}
function personal(set,file,pin){
 const {directory,request}=requestRoot(file,pin,'personal-service-admission-request');workspace(set,directory);
 for(const variant of ['baseline','optional']){
  const actual=read(path.join(directory,variant+'-expected.json'));assert.equal(actual.digest,request.expected.invocations[variant].bindingDigest,fail);
  const {binding}=actual.value;token(set,binding.runId);ccd(set,binding.ccd);workspace(set,binding.directory);workspace(set,binding.privateWorkspace);
  resources(set,read(path.join(binding.directory,'owned-resources.json')).value);
 }
}
function complex(set,file,pin,packet){
 const {directory,request}=requestRoot(file,pin,'complex-email-admission-request');workspace(set,directory);
 assert.deepEqual(packet?.expected,request.expected,fail);
 assert(packet&&Object.keys(packet.expected.contexts).sort().join(',')===COMPLEX_CONTEXTS.slice().sort().join(','),fail);
 for(const key of COMPLEX_CONTEXTS){
  const c=packet.expected.contexts[key];workspace(set,c.directory);ccd(set,c.prepared.state);
  if(c.prepared.input)token(set,c.prepared.input.runId);
  if(c.prepared.privateWorkspace)workspace(set,c.prepared.privateWorkspace);
  assert(c.closed.ids.length>0&&c.closed.names.length>0,fail);for(const value of [...c.closed.ids,...c.closed.names])token(set,value);
 }
}
// Both raw readers must already have passed. This checks disjointness, never admission or cleanup.
export function assertStCicOwnership(directory,expected,{stCicRequestPath,divorceRequestPath,personalRequestPath,complexRequestPath,complexPacket,mandatoryRequestPath}={}){
 for(const [pin,file]of [['divorceProfileRequest',divorceRequestPath],['personalServiceRequest',personalRequestPath],['complexEmailRequest',complexRequestPath],['mandatoryEmailRequest',mandatoryRequestPath]])assert((expected[pin]!==undefined)===(file!==undefined),fail);
 const prior=mainInventory(directory,expected),current=inventory();
 profile(current,stCicRequestPath,expected.stCicProfileRequest,'st-cic-profile-admission-request',ST_CIC_PROFILE_FACETS);
 if(mandatoryRequestPath!==undefined)mandatoryEmail(prior,mandatoryRequestPath,expected.mandatoryEmailRequest);
 if(divorceRequestPath!==undefined)profile(prior,divorceRequestPath,expected.divorceProfileRequest,'divorce-profile-admission-request',DIVORCE_PROFILE_FACETS);
 if(personalRequestPath!==undefined)personal(prior,personalRequestPath,expected.personalServiceRequest);
 if(complexRequestPath!==undefined)complex(prior,complexRequestPath,expected.complexEmailRequest,complexPacket);
 assert((complexRequestPath!==undefined)===(complexPacket!==undefined),fail);
 for(const value of current.tokens)assert(!prior.tokens.has(value),fail);
 for(const a of current.workspaces)for(const b of prior.workspaces)assert(a!==b&&!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep),fail);
 return true;
}

function mandatoryEmail(set,file,pin){
 const{directory,request}=requestRoot(file,pin,'mandatory-email-admission-request');workspace(set,directory);const folder=path.join(directory,'cohort');workspace(set,folder);
 const parent=read(path.join(folder,'parent-input.json'));assert.equal(parent.digest,request.expected.cohort.inputDigest,fail);assert.equal(digestBytes(JSON.stringify(parent.value)),request.expected.cohort.cohortDigest,fail);token(set,parent.value.runId);
 assert.deepEqual(request.expected.cohort.records.map(row=>row.variant),['baseline','name-optional','address-optional'],fail);
 for(const record of request.expected.cohort.records){
  const actual=read(path.join(folder,record.variant+'-binding.json'));assert.equal(actual.digest,record.files[record.variant+'-binding.json'],fail);const binding=actual.value;
  token(set,binding.runId);ccd(set,binding.ccd);workspace(set,binding.directory);workspace(set,binding.privateWorkspace);workspace(set,binding.handoff.stateRoot);workspace(set,binding.handoff.stagedHarness);
  resources(set,read(path.join(binding.directory,'owned-resources.json')).value);
 }
}
function mandatoryCcdBearers(directory,expected,current,options){
 const hashes=credentials=>{assert(credentials&&typeof credentials==='object'&&Object.keys(credentials).length>0,fail);return Object.values(credentials).map(actor=>{const value=actor?.headers?.Authorization;assert(typeof value==='string'&&/^Bearer \S+$/.test(value),fail);return digestBytes(value);});};
 const prior=new Set();
 for(const phase of ['ccd','eventCapability','recipientCallback','selectorEventRow']){
  const folder=path.join(directory,'private',phase),input=read(path.join(folder,'input.json')).value;for(const value of hashes(input.credentials))prior.add(value);
  if(phase!=='ccd')for(const invocation of nativeInvocations(expected.phases.find(row=>row.phase===phase).expected.releaseScopeId).filter(row=>row.kind==='mutation')){const captured=read(path.join(folder,invocation.invocationId,'runtime-input.json')).value;for(const value of hashes(phase==='selectorEventRow'?captured.runtime.credentials:captured.credentials))prior.add(value);}
 }
 if(options.personalRequestPath!==undefined){const{directory:root}=requestRoot(options.personalRequestPath,expected.personalServiceRequest,'personal-service-admission-request');for(const variant of ['baseline','optional']){const{binding}=read(path.join(root,variant+'-expected.json')).value;for(const value of hashes(read(path.join(binding.directory,'input.json')).value.credentials))prior.add(value);}}
 if(options.complexPacket)for(const value of Object.values(options.complexPacket.expected.contexts)){if(value.prepared.input?.credentials)for(const digest of hashes(value.prepared.input.credentials))prior.add(digest);}
 for(const record of current.expected.cohort.records){const root=path.join(current.directory,'cohort',record.variant);for(const value of hashes(read(path.join(root,'input.json')).value.credentials))assert(!prior.has(value),fail);}
}
// Every supplied raw packet must be validated before this finite comparison, even if it stays separate.
export function assertMandatoryEmailOwnership(directory,expected,{mandatoryRequestPath,stCicRequestPath,divorceRequestPath,personalRequestPath,complexRequestPath,complexPacket}={}){
 try{
  for(const[pin,file]of [['mandatoryEmailRequest',mandatoryRequestPath],['stCicProfileRequest',stCicRequestPath],['divorceProfileRequest',divorceRequestPath],['personalServiceRequest',personalRequestPath],['complexEmailRequest',complexRequestPath]])assert(Object.hasOwn(expected,pin)===(file!==undefined),fail);
  const prior=mainInventory(directory,expected),current=inventory();mandatoryEmail(current,mandatoryRequestPath,expected.mandatoryEmailRequest);
  const mandatory=requestRoot(mandatoryRequestPath,expected.mandatoryEmailRequest,'mandatory-email-admission-request');mandatoryCcdBearers(directory,expected,{directory:mandatory.directory,expected:mandatory.request.expected},{personalRequestPath,complexPacket});
  if(stCicRequestPath!==undefined)profile(prior,stCicRequestPath,expected.stCicProfileRequest,'st-cic-profile-admission-request',ST_CIC_PROFILE_FACETS);
  if(divorceRequestPath!==undefined)profile(prior,divorceRequestPath,expected.divorceProfileRequest,'divorce-profile-admission-request',DIVORCE_PROFILE_FACETS);
  if(personalRequestPath!==undefined)personal(prior,personalRequestPath,expected.personalServiceRequest);
  if(complexRequestPath!==undefined)complex(prior,complexRequestPath,expected.complexEmailRequest,complexPacket);
  assert((complexRequestPath!==undefined)===(complexPacket!==undefined),fail);
  for(const value of current.tokens)assert(!prior.tokens.has(value),fail);
  for(const a of current.workspaces)for(const b of prior.workspaces)assert(a!==b&&!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep),fail);
  return true;
 }catch{throw Error('MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP');}
}
