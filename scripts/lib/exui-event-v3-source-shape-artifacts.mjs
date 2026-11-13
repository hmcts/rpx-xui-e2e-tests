import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes} from './exui-evidence-io.mjs';

const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const common=['manifest.json','context.json','personas.json','ccd-requests.jsonl'];
const roles=['courtadmin-read-observation.json','readonly-read-observation.json','courtadmin-cell-observation.json','readonly-update-observation.json'];
const judge=['event-capability-observation.json','judge-event-ui-observation.json'];
const pair=shape=>[`source-shape-${shape}-observation.json`,`source-shape-${shape}-ui-observation.json`];
const check=value=>{if(!value)throw Error('EVENT_V3_SOURCE_SHAPE_ARTIFACT_INVALID');};
const same=(a,b)=>check(isDeepStrictEqual(a,b));
const ordered=refs=>refs.slice().sort((a,b)=>a.path.localeCompare(b.path));
export function sourceShapeArtifactNames(invocationId){
 if(invocationId==='baseline')return [...common,...shapes.flatMap(pair)];
 const shape=typeof invocationId==='string'&&invocationId.startsWith('ccd-shape-')?invocationId.slice(10):null;
 check(shapes.includes(shape));return [...common,...pair(shape)];
}
export function sourceShapeBaselineExtraNames(){return shapes.flatMap(pair);}
export function sourceShapeReadbackNames(invocationId){return invocationId==='baseline'?[...common,...roles,...judge,...shapes.flatMap(pair)]:sourceShapeArtifactNames(invocationId);}
function references(refs,id,names){
 check(Array.isArray(refs));
 for(const ref of refs){same(Object.keys(ref??{}).sort(),['digest','path']);check(typeof ref.path==='string'&&/^sha256:[a-f0-9]{64}$/.test(ref.digest));}
 same(refs.map(r=>r.path).sort(),names.map(name=>id+'/'+name).sort());
}
// No JSON is decoded here. Both independently held reference groups must agree first.
export function readSourceShapeArtifacts(root,invocationId,readbacks,execution){
 try{
 check(path.isAbsolute(root)&&path.normalize(root)===root&&fs.realpathSync(root)===root);
 const names=sourceShapeArtifactNames(invocationId);same(execution.invocationId,invocationId);
 references(readbacks,invocationId,sourceShapeReadbackNames(invocationId));
 references(execution.sourceShapeArtifacts,invocationId,names);
 const subset=selected=>readbacks.filter(ref=>selected.some(name=>ref.path===invocationId+'/'+name));
 same(ordered(execution.sourceShapeArtifacts),ordered(subset(names)));
 if(invocationId==='baseline'){
  references(execution.sharedRoleArtifacts,invocationId,[...common,...roles]);same(ordered(execution.sharedRoleArtifacts),ordered(subset([...common,...roles])));
  references(execution.judgeEventArtifacts,invocationId,[...common,...judge]);same(ordered(execution.judgeEventArtifacts),ordered(subset([...common,...judge])));
 }else{check(execution.sharedRoleArtifacts===undefined&&execution.judgeEventArtifacts===undefined);}
 return Object.fromEntries(names.map(name=>{
  const ref=execution.sourceShapeArtifacts.find(ref=>ref.path===invocationId+'/'+name),file=path.join(root,ref.path);
  check(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file&&fs.statSync(file).size<=16*1024*1024);
  const bytes=fs.readFileSync(file);same(digestBytes(bytes),ref.digest);return[name,bytes];
 }));
 }catch{throw Error('EVENT_V3_SOURCE_SHAPE_ARTIFACT_INVALID');}
}
