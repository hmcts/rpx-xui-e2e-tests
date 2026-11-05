const test = require('node:test');
const assert = require('node:assert/strict');

test('selector validation journal retains only bounded synthetic semantics', async () => {
 const {selectorValidationProjection: project} = await import('./lib/exui-ccd-browser-runtime.mjs');
 const url = new URL('http://localhost/case-types/HarnessNestedPRL/validate?pageId=serviceOfDocuments2');
 for (const selected of [[], ['additionalRecipients']]) {
  assert.deepEqual(project(JSON.stringify({event:{id:'serviceOfDocuments'},data:{protectedValue:'selector-empty-control',sodAdditionalRecipients:selected},event_token:'must-not-retain'}),url),
   {pageId:'serviceOfDocuments2',eventId:'serviceOfDocuments',controlValue:'selector-empty-control',selected});
 }
 assert.deepEqual(project(JSON.stringify({event:{id:'private'},data:{protectedValue:'private',sodAdditionalRecipients:['private']}}),new URL('http://localhost/?pageId=private')),
  {pageId:null,eventId:null,controlValue:null,selected:null});
 assert.deepEqual(project('null',url),{pageId:'serviceOfDocuments2',eventId:null,controlValue:null,selected:null});
 assert.deepEqual(project('invalid',url),{pageId:'serviceOfDocuments2',eventId:null,controlValue:null,selected:null});
});
