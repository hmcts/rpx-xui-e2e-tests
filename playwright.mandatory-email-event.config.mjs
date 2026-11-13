import process from 'node:process';

import {defineConfig} from '@playwright/test';
if(process.env.EXUI_MANDATORY_EMAIL_EVENT!=='true')throw Error('MANDATORY_EMAIL_EVENT_OPT_IN_REQUIRED');
if(!['baseline','name-optional','address-optional'].includes(process.env.EXUI_MANDATORY_EMAIL_EVENT_VARIANT))throw Error('MANDATORY_EMAIL_EVENT_VARIANT_REQUIRED');
export default defineConfig({
  testDir:'./src/tests/harness/mandatory-email-event',testMatch:'mandatory-email-event.spec.ts',workers:1,retries:0,
  // Two baseline controls each perform filled and empty journeys with real CCD.
  timeout:120000,globalTimeout:300000,forbidOnly:true,
  outputDir:process.env.EXUI_HARNESS_TEST_OUTPUT,
  reporter:[['json',{outputFile:process.env.EXUI_CALLBACK_REPORT}]],
  use:{baseURL:'http://127.0.0.1:3100',headless:true,trace:'off',screenshot:'off',video:'off',launchOptions:{executablePath:process.env.EXUI_CHROMIUM_EXECUTABLE}},
});
