import { FullConfig } from "@playwright/test";

async function globalSetup(_full: FullConfig): Promise<void> {
  void _full;
}

export default globalSetup;
