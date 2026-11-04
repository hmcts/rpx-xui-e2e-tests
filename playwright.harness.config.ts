import { defineConfig } from "@playwright/test";

import {
  buildHarnessConfig,
  loadCandidateManifest,
  type HarnessSelection,
} from "./src/harness/candidate";
const selection = (process.env.EXUI_HARNESS_SELECTION ??
  "support") as HarnessSelection;
const manifest = process.env.EXUI_CANDIDATE_RUN_MANIFEST;
const candidateManifest = manifest
  ? loadCandidateManifest(manifest)
  : undefined;
const config = buildHarnessConfig(
  selection,
  candidateManifest
    ? {
        manifest: candidateManifest,
        baseURL: process.env.EXUI_CANDIDATE_URL ?? "",
      }
    : undefined,
);
const slice = process.env.EXUI_HARNESS_SLICE ?? "family";
if (
  ![
    "family",
    "scope",
    "routing",
    "global-search",
    "hearing-publication",
    "ccd-event-capability",
  ].includes(slice)
)
  throw new Error("UNKNOWN_HARNESS_SLICE");
const eventCapabilityScope =
  candidateManifest?.releaseScopeId === "exui-ccd-event-capability-pilot";
if (slice === "ccd-event-capability" && !eventCapabilityScope)
  throw new Error("CCD_EVENT_CAPABILITY_SCOPE_REQUIRED");
if (
  eventCapabilityScope &&
  (selection !== "ccd" || slice !== "ccd-event-capability")
)
  throw new Error("CCD_EVENT_CAPABILITY_SELECTION_REQUIRED");
if (
  eventCapabilityScope &&
  process.env.EXUI_HARNESS_MUTATION &&
  !["ccd-enable-judge-event", "ccd-remove-courtadmin-recipient-read", "ccd-remove-readonly-recipient-read", "ccd-enable-readonly-recipient-update", "ccd-remove-courtadmin-event-create"].includes(process.env.EXUI_HARNESS_MUTATION)
)
  throw new Error("CCD_EVENT_CAPABILITY_MUTATION_REQUIRED");
const ccdFiles = eventCapabilityScope
  ? process.env.EXUI_HARNESS_MUTATION === "ccd-enable-judge-event"
    ? ["event-capability"]
    : ["ccd-remove-courtadmin-recipient-read", "ccd-remove-readonly-recipient-read"].includes(process.env.EXUI_HARNESS_MUTATION ?? "")
      ? ["courtadmin-read"]
      : process.env.EXUI_HARNESS_MUTATION === "ccd-enable-readonly-recipient-update"
        ? ["readonly-update"]
        : process.env.EXUI_HARNESS_MUTATION === "ccd-remove-courtadmin-event-create"
          ? ["courtadmin-cell"]
          : ["courtadmin-cell", "courtadmin-read", "event-capability", "readonly-update"]
  : [
      "case-event-policy",
      "nested-conditional",
      "postal-conditional",
      "role-revocation",
    ];
export default defineConfig({
  ...config,
  ...(selection === "ccd"
    ? { testMatch: ccdFiles.map((file) => `**/ccd/${file}.spec.ts`) }
    : {}),
  ...(selection === "candidate" && slice === "scope"
    ? { testMatch: "**/scope/*.spec.ts" }
    : {}),
  ...(selection === "candidate" && slice === "routing"
    ? { testMatch: "**/routing/*.spec.ts" }
    : {}),
  ...(selection === "candidate" && slice === "global-search"
    ? { testMatch: "**/global-search/*.spec.ts" }
    : {}),
  ...(selection === "candidate" && slice === "hearing-publication"
    ? { testMatch: "**/hearing-publication/*.spec.ts" }
    : {}),
  timeout: 60_000,
  use: {
    ...config.use,
    storageState: process.env.EXUI_SESSION_COOKIE
      ? {
          cookies: [
            {
              name: "xui-webapp",
              value: process.env.EXUI_SESSION_COOKIE,
              domain: "127.0.0.1",
              path: "/",
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }
      : undefined,
    launchOptions: {
      executablePath: process.env.EXUI_CHROMIUM_EXECUTABLE,
      args: ["--no-sandbox"],
    },
  },
  outputDir:
    process.env.EXUI_HARNESS_TEST_OUTPUT ??
    "functional-output/tests/harness/private/support",
  reporter: process.env.EXUI_EVIDENCE_CONTEXT
    ? [["./scripts/lib/exui-playwright-evidence-reporter.mjs"]]
    : [["list"]],
});
