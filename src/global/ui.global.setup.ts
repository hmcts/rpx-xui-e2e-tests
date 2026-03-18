import { FullConfig } from "@playwright/test";

import { resolveIntegrationSessionWarmupUsers } from "../tests/integration/helpers/searchCaseSession.helper";
import { sessionCapture } from "../utils/ui/sessionCapture";

async function globalSetup(_full: FullConfig): Promise<void> {
  void _full;
  const userIdentifiers = resolveIntegrationSessionWarmupUsers(process.env);
  if (userIdentifiers.length > 0) {
    await sessionCapture(userIdentifiers);
  }
}

export default globalSetup;
