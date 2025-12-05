import getPort from "get-port";

import { pageFixtures, type PageFixtures } from "../page-objects/pages/page.fixtures.ts";
import { utilsFixtures, type UtilsFixtures } from "../utils/utils.fixtures.ts";

import { authFixtures, type AuthFixtures } from "./auth.fixtures.ts";
import { test as base, expect } from "./baseTest";

export interface CustomFixtures extends PageFixtures, UtilsFixtures, AuthFixtures {}

interface WorkerFixtures {
  lighthousePort: number;
}

export const test = base.extend<CustomFixtures, WorkerFixtures>({
  ...pageFixtures,
  ...utilsFixtures,
  ...authFixtures,
  lighthousePort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const port = await getPort();
      await use(port);
    },
    { scope: "worker" },
  ],
});

export { expect };
