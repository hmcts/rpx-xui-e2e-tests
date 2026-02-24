import config, {
  __test__ as configTestUtils,
  type Config,
} from "../../../utils/ui/config.utils.js";

export interface AppTestConfig extends Config {
  getTestEnvFromEnviornment: () => string;
}

const appTestConfig: AppTestConfig = {
  ...config,
  getTestEnvFromEnviornment: () => config.testEnv,
};

export default appTestConfig;

export const __test__ = {
  ...configTestUtils,
  resolveTestEnv: configTestUtils.resolveTestEnv,
};
