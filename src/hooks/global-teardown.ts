import { getLogger } from "../logger-config.js";

const logger = getLogger("global-teardown");

export default async function globalTeardown(): Promise<void> {
  logger.info("Global teardown complete");
}
