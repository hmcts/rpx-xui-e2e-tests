import fs from "node:fs";
import path from "node:path";

import { test, expect } from "../../../fixtures/harnessIdentity";
import {
  assertHearingPublicationEligibility,
  assertHearingPublicationInvocation,
  EXPECTED_PROD_AMENDMENTS2,
  hearingPublicationProofId,
} from "../../../harness/hearingPublication";

const mutation = process.env.EXUI_HARNESS_MUTATION;

test("actual Node publishes separate prod enabled and amendment capability maps", {
  annotation: { type: "harness-proof", description: hearingPublicationProofId(mutation) },
}, async ({ request }) => {
  assertHearingPublicationInvocation(
    JSON.parse(fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST!, "utf8")),
    JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT!, "utf8")),
    mutation,
  );
  const response = await request.get("/external/config/ui", { maxRedirects: 0, maxRetries: 0 });
  const observed = { url: response.url(), status: response.status(), body: await response.text() };
  fs.writeFileSync(
    path.join(path.dirname(process.env.EXUI_EVIDENCE_CONTEXT!), "hearing-publication-response.json"),
    JSON.stringify(observed),
    { mode: 0o600, flag: "wx" },
  );
  expect(observed.status).toBe(200);
  expect(observed.url).toBe("http://127.0.0.1:3100/external/config/ui");
  const config = assertHearingPublicationEligibility(JSON.parse(observed.body), mutation);

  await test.step("harness-assertion:hearing-amendment-capability-map", async () => {
    expect(config.hearingAmendment).toEqual(EXPECTED_PROD_AMENDMENTS2);
  });
});
