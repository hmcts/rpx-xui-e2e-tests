import merge from "lodash/merge.js";
import baseConfig from "./baseConfig.json" with { type: "json" };
import envConfig from "./envConfig.json" with { type: "json" };

const CONFIG = merge({}, baseConfig, envConfig);

CONFIG.environment = process.env.TEST_ENV ?? CONFIG.environment;
CONFIG.urls.xui = process.env.TEST_URL ?? CONFIG.urls.xui;
CONFIG.urls.api = process.env.API_URL ?? CONFIG.urls.api;

if (process.env.PLAYWRIGHT_WORKERS) {
  CONFIG.test.workers = Number(process.env.PLAYWRIGHT_WORKERS);
}

if (process.env.PLAYWRIGHT_RETRIES) {
  CONFIG.test.retries = Number(process.env.PLAYWRIGHT_RETRIES);
}

if (process.env.WIREMOCK_URL) {
  CONFIG.test.wiremock.baseUrl = process.env.WIREMOCK_URL;
}

Object.freeze(CONFIG);

export type FrameworkConfig = typeof CONFIG;
export default CONFIG;
