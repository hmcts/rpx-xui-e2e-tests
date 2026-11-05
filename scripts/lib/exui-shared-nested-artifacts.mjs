import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes,readEvidenceArtifactBytes } from './exui-evidence-io.mjs';
import { SHARED_NESTED_FACETS,SHARED_NESTED_FAULT } from './exui-shared-nested-contract.mjs';
export function sharedNestedArtifactNames(invocationId) {
  const base=['manifest.json','context.json','personas.json','ccd-requests.jsonl'];
  if(invocationId==='baseline')return [...base,...SHARED_NESTED_FACETS.map(row=>row.id+'-observation.json'),...['nested-post-1','nested-post-2'].map(id=>id+'-mandatory-attempt.json')];
  if(invocationId===SHARED_NESTED_FAULT)return [...base,'nested-email-2-observation.json','fault-actions.jsonl'];
  if(invocationId==='ccd-drop-child')return [...base,'nested-email-2-observation.json','fault-actions.jsonl'];
  if(invocationId==='ccd-drop-postal-optional-child')return [...base,'nested-post-2-observation.json','nested-post-2-mandatory-attempt.json','fault-actions.jsonl'];
  return [];
}
export function captureSharedNestedArtifacts(root,invocationId) {
  root=fs.realpathSync(root);
  return sharedNestedArtifactNames(invocationId).flatMap(name=>{
    const relative=invocationId+'/'+name,file=path.join(root,relative);
    if(!fs.existsSync(file))return [];
    assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file&&fs.statSync(file).size<=16*1024*1024,'SHARED_NESTED_ARTIFACT_BOUNDARY');
    return [{path:relative,digest:digestBytes(fs.readFileSync(file))}];
  });
}
export function readSharedNestedArtifact(root,execution,name) {
  const names=sharedNestedArtifactNames(execution.invocationId);
  assert(names.includes(name),'SHARED_NESTED_ARTIFACT_NAME');
  assert(Array.isArray(execution.sharedNestedArtifacts),'SHARED_NESTED_ARTIFACTS_REQUIRED');
  assert.deepEqual(execution.sharedNestedArtifacts.map(row=>row.path).sort(),names.map(file=>execution.invocationId+'/'+file).sort(),'SHARED_NESTED_ARTIFACT_SELECTION');
  const ref=execution.sharedNestedArtifacts.find(row=>row.path===execution.invocationId+'/'+name),file=path.join(fs.realpathSync(root),ref.path);
  assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'SHARED_NESTED_ARTIFACT_ALIAS');
  return readEvidenceArtifactBytes(root,ref).bytes;
}
