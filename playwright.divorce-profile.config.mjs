import process from 'node:process';
import {defineConfig} from '@playwright/test';
if(process.env.EXUI_DIVORCE_BROWSER!=='true')throw Error('DIVORCE_PROFILE_BROWSER_OPT_IN');
export default defineConfig({testDir:'./src/tests/harness/divorce-profile',testMatch:process.env.EXUI_DIVORCE_FACET==='divorce-jurisdiction'?'jurisdiction.spec.ts':'global-search.spec.ts',workers:1,retries:0,timeout:90000,globalTimeout:120000,forbidOnly:true,
 outputDir:process.env.EXUI_DIVORCE_OUTPUT+'/browser-output',reporter:[['json',{outputFile:process.env.EXUI_DIVORCE_OUTPUT+'/profile-browser-report.json'}]],
 use:{baseURL:'http://127.0.0.1:3100',headless:true,trace:'off',screenshot:'off',video:'off',launchOptions:{executablePath:process.env.EXUI_CHROMIUM_EXECUTABLE},
 storageState:{cookies:[{name:'xui-webapp',value:process.env.EXUI_SESSION_COOKIE,domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]}}});
