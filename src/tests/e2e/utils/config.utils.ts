import uiConfig from "../../../utils/ui/config.utils.js";

const config = {
  ...uiConfig,
  urls: {
    ...uiConfig.urls,
    baseURL: uiConfig.urls.exuiDefaultUrl
  }
};

const resolveUrl = (override: string | undefined, fallback: string): string => override ?? fallback;

const getEnvVar = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
};

export const __test__ = {
  getEnvVar,
  resolveUrl
};

export default config;
