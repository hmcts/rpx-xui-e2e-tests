import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

import {
  validateRunManifest,
  type CandidateIdentity,
  type RunManifest,
} from "../../scripts/lib/exui-release-evidence.mjs";

export function loadCandidateManifest(file: string): RunManifest {
  return validateRunManifest(JSON.parse(fs.readFileSync(file, "utf8")));
}
export function assertRuntimeIdentity(
  expected: CandidateIdentity,
  observed: CandidateIdentity,
): void {
  if (!isDeepStrictEqual(expected, observed))
    throw new Error("CANDIDATE_RUNTIME_IDENTITY_MISMATCH");
}
export type HarnessSelection = "support" | "model" | "candidate" | "ccd";
export function buildHarnessConfig(
  selection: HarnessSelection,
  candidate?: { manifest: RunManifest; baseURL: string },
) {
  if (!["support", "model", "candidate", "ccd"].includes(selection))
    throw new Error("UNKNOWN_HARNESS_SELECTION");
  if (selection === "candidate" || selection === "ccd") {
    if (
      !candidate ||
      !process.env.EXUI_EVIDENCE_CONTEXT ||
      !process.env.EXUI_EVIDENCE_REPORT
    )
      throw new Error("CANDIDATE_IDENTITY_AND_MACHINE_REPORT_REQUIRED");
    validateRunManifest(candidate.manifest);
    if (candidate.baseURL !== "http://127.0.0.1:3100")
      throw new Error("OWNED_CANDIDATE_URL_REQUIRED");
  }
  return {
    testDir: "./src/tests/harness",
    testMatch:
      selection === "candidate"
        ? "**/wa/*.spec.ts"
        : `**/${selection}/*.spec.ts`,
    retries: 0,
    workers: 1,
    fullyParallel: false,
    use: {
      baseURL: candidate?.baseURL,
      trace: "off" as const,
      screenshot: "off" as const,
      video: "off" as const,
    },
  };
}
