import {test as base,expect} from '@playwright/test';

import {withProfileBrowserAssets} from './harnessProfileBrowserAssets';
export const test=base.extend<{profileAssets:void}>({profileAssets:[async({context},use)=>{
 await withProfileBrowserAssets(context,use,process.env.EXUI_ST_CIC_OUTPUT!);
},{auto:true}]});
export {expect};
