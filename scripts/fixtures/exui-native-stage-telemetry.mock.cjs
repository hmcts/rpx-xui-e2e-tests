exports.browserFreeSpec = `const {test,expect}=require('@playwright/test');
test('synthetic healthy stage control',{annotation:{type:'harness-proof',description:'wa-family-options'}},async()=>{
 await test.step('harness-assertion:family-membership',async()=>{expect(true).toBe(true);});
 for(let i=0;i<7;i++)await test.step('harness-assertion:family-filter',async()=>{expect(i).toBeLessThan(7);});
 await test.step.skip('harness-assertion:family-filter',async()=>{});
});
test('synthetic attributed fault',{annotation:{type:'harness-proof',description:'wa-missing-family'}},async()=>{
 await test.step('harness-assertion:family-membership',async()=>{expect(1,'PRIVATE_RAW_ERROR_CANARY').toBe(2);});
});
test('synthetic unknown stage',{annotation:{type:'harness-proof',description:'wa-family-options'}},async()=>{
 await test.step('harness-assertion:PRIVATE_UNKNOWN_CANARY',async()=>{});
});
`;

// Literal source-reviewed postal traversal; never derive expected order from the recorder.
exports.postalGroups = [
 'postal-open-create','postal-select-two-recipients','postal-check-conditional-fields',
 'postal-submit-empty-lookups','postal-required-fields','postal-enter-manual-addresses',
 'postal-check-first-summary','postal-edit-second-address','postal-check-previous-roundtrip',
 'postal-submit-and-readback','postal-write-readback-artifact','postal-persistence'
];
exports.postalStep = (id, extra = {}) => ({category:'test.step',title:(['postal-required-fields','postal-persistence'].includes(id)?'harness-assertion:':'harness-detail:')+id,duration:1,annotations:[],...extra});
exports.postalBrowserFreeSpec = `
const postalGroups=${JSON.stringify(exports.postalGroups)};
const postalTitle=id=>(['postal-required-fields','postal-persistence'].includes(id)?'harness-assertion:':'harness-detail:')+id;
test('synthetic complete postal detail',{annotation:{type:'harness-proof',description:'ccd-postal-two-roundtrip'}},async()=>{
 for(const id of postalGroups) await test.step(postalTitle(id),async()=>expect(1).toBe(1));
});
test('synthetic postal named fault',{annotation:{type:'harness-proof',description:'ccd-postal-child-loss'}},async()=>{
 for(const id of postalGroups) await test.step(postalTitle(id),async()=>expect(1,'PRIVATE_ERROR').toBe(id==='postal-persistence'?2:1));
});
test('synthetic postal early action error',{annotation:{type:'harness-proof',description:'ccd-postal-child-loss'}},async()=>{
 await test.step(postalTitle(postalGroups[0]),async()=>{expect(1,'PRIVATE_ACTION').toBe(2);});
});
test('synthetic postal explicit skipped group',{annotation:{type:'harness-proof',description:'ccd-postal-child-loss'}},async()=>{
 await test.step.skip(postalTitle(postalGroups[0]),async()=>{});
 await test.step(postalTitle(postalGroups[1]),async()=>{throw Error('PRIVATE_ACTION');});
});
test('synthetic postal whole skip',{annotation:{type:'harness-proof',description:'ccd-postal-two-roundtrip'}},async()=>{test.skip(true,'PRIVATE_SKIP');});
`;
