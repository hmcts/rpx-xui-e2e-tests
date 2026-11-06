const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
exports.preparationCancellation=async(t,mode,{old=false}={})=>{
 const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'personal-cancel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['candidate','browser'])fs.mkdirSync(path.join(dir,name));
 const statePath=path.join(dir,'state.mjs');fs.writeFileSync(statePath,`export const state={mode:${JSON.stringify(mode)},abort:new AbortController(),runtime:0,imports:0,cleanup:0};`);
 const stateUrl=pathToFileURL(statePath).href,sourcePath=path.join(root,'scripts/run-harness-recipient-callback-ui.mjs');
 let source=fs.readFileSync(sourcePath,'utf8');
 if(old)source=source.replace('cancelled||Boolean(signal?.aborted)','cancelled').replace("signal?.addEventListener('abort',cancel,{once:true});",'');
 const stubs={
  './lib/exui-candidate-artifact.mjs':`import {state} from ${JSON.stringify(stateUrl)};export async function verifyCandidateArtifact(){await Promise.resolve();if(state.mode==='artifact')state.abort.abort();return {candidateRoot:${JSON.stringify(path.join(dir,'candidate'))},provenance:{platform:'linux/arm64'}};}export async function digestCandidateTree(){return 'sha256:'+'a'.repeat(64);}`,
  './lib/exui-harness-dependencies.mjs':`import {state} from ${JSON.stringify(stateUrl)};export async function verifyHarnessDependencies(){await Promise.resolve();if(state.mode==='dependencies')state.abort.abort();return {digest:'sha256:'+'b'.repeat(64)};}`,
  './lib/exui-configuration-catalogue.mjs':`export const assertCandidateConfigurationSources=()=>{};`,
  './lib/exui-ccd-runtime.mjs':`import fs from 'node:fs';import {state} from ${JSON.stringify(stateUrl)};export * from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/lib/exui-ccd-runtime.mjs')).href)};export async function startCcdRuntime(output,options){state.runtime++;state.cancelledAtLaunch=options.isCancelled();fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/recovery.json','{}');if(state.mode==='started')state.abort.abort();return {};}`,
  './lib/exui-candidate-ci-process.mjs':`import {state} from ${JSON.stringify(stateUrl)};export function cleanupCiCcd(){state.cleanup++;return {cleanupComplete:true};}`,
  './lib/exui-recipient-callback-import.mjs':`import {state} from ${JSON.stringify(stateUrl)};export const validateObservedRecipientCallback=()=>{};export async function prepareRecipientCallbackImport(){state.imports++;throw Error('IMPORT_MUST_NOT_RUN');}export async function importRecipientCallback(){state.imports++;throw Error('IMPORT_MUST_NOT_RUN');}`,
  'node:child_process':`export function spawnSync(command,args){return {status:0,stdout:args.includes('status')?'':'a'.repeat(40)};}`,
 };
 const redirects={};let n=0;for(const [name,body]of Object.entries(stubs)){const file=path.join(dir,'stub-'+n+++'.mjs');fs.writeFileSync(file,body);redirects[name]=pathToFileURL(file).href;}
 source=source.replace(/(from\s*|import\s*\()(['"])([^'"]+)\2/g,(all,prefix,quote,name)=>prefix+quote+(redirects[name]||(name.startsWith('.')?pathToFileURL(path.resolve(root,'scripts',name)).href:name))+quote);
 source=source.replace("const root=fileURLToPath(new URL('../',import.meta.url))",'const root='+JSON.stringify(root+'/'));
 const file=path.join(dir,'runner.mjs');fs.writeFileSync(file,source);const {state}=await import(stateUrl),{runCallbackUi}=await import(pathToFileURL(file));
 let result,error;try{result=await runCallbackUi({candidate:path.join(dir,'artifact.json'),browser:path.join(dir,'browser'),output:path.join(dir,'output'),scenario:'personal-service',preparePersonal:true,signal:state.abort.signal});}catch(e){error=e;}
 return {state,result,error};
};
