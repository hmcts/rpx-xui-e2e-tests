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
