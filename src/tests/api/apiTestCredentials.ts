import { config } from "../../config/api";

const TEST_SOLICITOR = {
  e: "test-solicitor@example.test",
  sec: "test-password"
};

export function setTestSolicitorCredentials(): () => void {
  const solicitor = config.users[config.testEnv].solicitor;
  const original = { ...solicitor };

  Object.assign(solicitor, TEST_SOLICITOR);

  return () => Object.assign(solicitor, original);
}
