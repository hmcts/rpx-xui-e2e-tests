import fs from "node:fs";

import { test as base, expect } from "@playwright/test";

import {
  assertRuntimeIdentity,
  loadCandidateManifest,
} from "../harness/candidate";

// API identity has no Angular/page dependency. Browser fixtures layer asset/egress checks above it.
export const test = base.extend<{ apiIdentity: void }>({
  apiIdentity: [
    async ({ request }, use) => {
      const manifest = loadCandidateManifest(
        process.env.EXUI_CANDIDATE_RUN_MANIFEST!,
      );
      const observed = JSON.parse(
        fs.readFileSync(process.env.EXUI_RUNTIME_IDENTITY!, "utf8"),
      );
      assertRuntimeIdentity(manifest.identity, observed.identity);
      if (process.env.EXUI_HARNESS_SLICE === "routing")
        expect(manifest.releaseScopeId).toBe(
          "exui-decentralised-routing-pilot",
        );
      const response = await request.get("/external/config/ui");
      expect(response.ok()).toBeTruthy();
      const ui = await response.json();
      for (const key of [
        "ccdGatewayUrl",
        "idamWeb",
        "waWorkflowApi",
        "judicialBookingApi",
        "paymentReturnUrl",
      ])
        expect(new URL(ui[key]).origin).toBe("http://127.0.0.1:3101");
      expect(ui.oAuthCallback).toBe("http://127.0.0.1:3100/oauth2/callback");
      if (manifest.releaseScopeId === "exui-decentralised-routing-pilot") {
        const configuration = JSON.parse(
          manifest.runtimeMetadata.routingUiConfiguration,
        ) as Record<string, unknown>;
        expect(
          ui.decentralisedCaseTypeConfig,
          "real candidate effective case-type configuration",
        ).toEqual(configuration.decentralisedCaseTypeConfig);
        expect(
          ui.decentralisedServiceMap,
          "real candidate effective service map",
        ).toEqual(configuration.decentralisedServiceMap);
      }
      await use();
    },
    { auto: true },
  ],
});
export { expect };
