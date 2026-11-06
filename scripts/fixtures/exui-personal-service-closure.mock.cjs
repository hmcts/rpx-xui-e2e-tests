const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {parentPacket}=require('./exui-personal-service-parent.mock.cjs');
// Replace resource operations/preflight only. Production closure state, branding,
// raw invocation validation, child-closure validation and finally ordering execute.
exports.personalClosure=async(t,mode,{unsafeOld=false}={})=>{
 const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'personal-closure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const packet=await parentPacket(path.join(dir,'pair'));const statePath=path.join(dir,'state.mjs'),stateUrl=pathToFileURL(statePath).href;
 const terminal={started:true,observed:true,forced:false,cancelled:false,code:0,signal:null};
 if(mode==='forced')terminal.forced=true;if(mode==='unobserved')terminal.observed=false;if(mode==='cancelled')terminal.cancelled=true;if(mode==='signalled')terminal.signal='SIGKILL';
 const binding=packet.bindings.baseline;
 if(mode==='pending'){const f=path.join(binding.directory,'personal-service-child-finalization.json'),v=JSON.parse(fs.readFileSync(f));v.creationAttempts[0].state='pending';fs.writeFileSync(f,JSON.stringify(v));}
 if(mode==='foreign-registry'){const f=path.join(binding.directory,'owned-resources.json'),v=JSON.parse(fs.readFileSync(f));v[0].owner='foreign';fs.writeFileSync(f,JSON.stringify(v));}
 if(mode==='missing-finalization')fs.unlinkSync(path.join(binding.directory,'personal-service-child-finalization.json'));
 fs.writeFileSync(statePath,`export const state=${JSON.stringify({mode,cohort:packet.cohort,bindings:packet.bindings,root:path.join(dir,'pair'),terminal,calls:[]})};`);
 const bindingModule=pathToFileURL(path.join(root,'scripts/lib/exui-personal-service-invocation-binding.mjs')).href;
 const stubs={
  './lib/exui-personal-service-invocation-binding.mjs':`import {state} from ${JSON.stringify(stateUrl)};export * from ${JSON.stringify(bindingModule)};export const personalProducer=()=>state.cohort.producer;export const capturePersonalPrepared=p=>state.bindings[p.input.variant];export const readPersonalCohort=()=>{throw Error('CONTROLLED_CLOSED_READER_REJECTION');};`,
  './run-harness-recipient-callback-ui.mjs':`import fs from 'node:fs';import {state} from ${JSON.stringify(stateUrl)};export async function runCallbackUi(o){state.calls.push('prepare:'+o.variant);if(state.mode==='precreation')throw Error('CONTROLLED_PRECREATION');o.personalLifecycle.creationStarted();if(state.mode==='unknown-create')throw Error('CONTROLLED_PENDING_CREATOR');const b=state.bindings[o.variant];return {input:JSON.parse(fs.readFileSync(b.directory+'/input.json')),handoff:b.handoff,plan:b.plan,privateWorkspace:b.privateWorkspace};}`,
  './lib/exui-candidate-artifact.mjs':`import {state} from ${JSON.stringify(stateUrl)};export const verifyCandidateArtifact=async()=>state.cohort.artifact;export const digestCandidateTree=async()=>state.cohort.browser.digest;`,
  './lib/exui-ccd-runtime.mjs':`export const verifyCcdContainerIdentity=()=>{};export const ccdImagePins=()=>({});export const assertCcdImageIdentity=()=>{};export const docker=()=>{};`,
  './lib/exui-candidate-ci-process.mjs':`import {state} from ${JSON.stringify(stateUrl)};export const cleanupCiCcd=()=>{state.calls.push('ccd-cleanup');if(state.mode==='cleanup-failure'||state.mode==='cleanup-retry'&&state.calls.filter(x=>x==='ccd-cleanup').length===1)throw Error('CONTROLLED_CLEANUP');};`,
  './lib/exui-host-invocation.mjs':`export const inspectHostContainer=()=>null;export const hostDocker=()=>{};`,
  './lib/exui-output-boundary.mjs':`export const createFreshHarnessOutput=output=>output;`,
 };
 const redirects={};let n=0;for(const [name,body]of Object.entries(stubs)){const file=path.join(dir,'stub-'+n+++'.mjs');fs.writeFileSync(file,body);redirects[name]=pathToFileURL(file).href;}
 let source=fs.readFileSync(path.join(root,'scripts/run-harness-personal-service-cohort.mjs'),'utf8');
 const a=source.indexOf('async function preflight('),b=source.indexOf('const closedFailures=',a);source=source.slice(0,a)+`async function preflight(){return closureState.cohort;}\n`+source.slice(b);
 source=source.replace(/^#![^\n]*\n/,'');
 source=`import {state as closureState} from ${JSON.stringify(stateUrl)};\n`+source;
 source=source.replace('await executePersonalChild(command,{log,signal:pairCancellation.signal})',"(closureState.calls.push('child:'+variant),structuredClone(closureState.terminal))");
 if(unsafeOld)source=source.replace('closure.safe=normalClosure&&!closure.cleanupUncertain&&!cancelled&&!signal?.aborted','closure.safe=!closure.cleanupUncertain&&!cancelled&&!signal?.aborted');
 source=source.replace(/(from\s*|import\s*\()(['"])([^'"]+)\2/g,(all,prefix,quote,name)=>prefix+quote+(redirects[name]||(name.startsWith('.')?pathToFileURL(path.resolve(root,'scripts',name)).href:name))+quote);
 const file=path.join(dir,'cohort.mjs');fs.writeFileSync(file,source);const api=await import(pathToFileURL(file)),{state}=await import(stateUrl);
 let error;try{await api.runPersonalCohort({candidate:'/synthetic-candidate',browser:'/synthetic-browser',output:state.root});}catch(value){error=value;}
 return {state,error,closed:api.isPersonalCohortClosedFailure(error)};
};
