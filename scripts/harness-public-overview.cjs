const fixture = require("./fixtures/harness-public-report-titles.json");
const snapshot = require("./fixtures/exui-configuration-source.json");
const review = require("./fixtures/exui-configuration-review.json");

const definitions = {
  aat: {
    title: "Live AAT configuration probes",
    purpose:
      "Attempts read-only checks of published UI configuration, one feature flag, global-search service families, WA families and staff families from AAT.",
    boundary:
      "Live read-only endpoint probes; authentication/setup may block a probe before any response. Deployed version unknown; no UI journey, case/task write, CCD persistence or candidate-bound credit.",
  },
  catalogue: {
    title: "Configuration and service catalogue models",
    purpose:
      "Checks that service families, capability lists, service codes, hearing case types and required assurance gaps remain consistent with the reviewed sources.",
    boundary:
      "Shared model assertions. No deployed service or EXUI application is exercised.",
  },
  replay: {
    title: "Historical defect replays",
    purpose:
      "Rechecks representative defect contracts: Civil claim fields, Private Law nested conditions, work allocation roles, history access and authentication guardrails.",
    boundary:
      "Cross-service model replays. These are not browser reproductions of the original incidents.",
  },
  framework: {
    title: "Retained Harness framework checks",
    purpose:
      "Checks the auth/session helpers, persona pools, request helpers, reporting and diagnostic infrastructure used by the Harness.",
    boundary: "Framework reliability, not court-service product coverage.",
  },
};
const capabilities = {
  jurisdictions: "Service navigation",
  globalSearchServices: "Global search",
  waSupportedJurisdictions: "Work allocation",
  staffSupportedJurisdictions: "Staff reference data",
  serviceRefDataMapping: "Service-code mapping",
  hearings: "Hearings",
};
const familyNames = {
  CIVIL: "Civil",
  IA: "Immigration and Asylum",
  PRIVATELAW: "Private Law",
  PUBLICLAW: "Public Law",
  EMPLOYMENT: "Employment",
  ST_CIC: "Criminal Injuries Compensation",
  SSCS: "Social Security and Child Support",
  DIVORCE: "Divorce",
  FR: "Financial Remedy",
  PROBATE: "Probate",
  HRS: "HRS",
  CMC: "CMC",
  PCS: "Possession",
};
function groupFor(file) {
  if (file === "src/tests/harness/diagnostic/configuration.spec.ts")
    return "aat";
  if (file === "src/tests/api/exui-central-assurance.api.ts")
    return "catalogue";
  if (file === "src/tests/api/exui-historic-replay-packs.api.ts")
    return "replay";
  if (fixture.selections.support.some((entry) => entry.file === file))
    return "framework";
  throw new Error("PUBLIC_ODHIN_UNREVIEWED_GROUP");
}
function normalize(entry) {
  return {
    file: entry.file,
    titlePath: entry.titlePath.map((title, index) =>
      index === 2 ? entry.file : title,
    ),
  };
}
const entries = [
  ...fixture.selections.support,
  ...fixture.selections.model,
].map(normalize);
const profiles = {
  harness: entries,
  "local-aat": [...entries, ...fixture.selections.environment.map(normalize)],
};
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

async function renderOverview(records, profile = "harness") {
  if (!Object.hasOwn(profiles, profile))
    throw new Error("PUBLIC_ODHIN_PROFILE_REQUIRED");
  const { buildConfigurationCatalogue, validateConfigurationCatalogue } =
    await import("./lib/exui-configuration-catalogue.mjs");
  const { deploymentProfileAccounting } =
    await import("./lib/exui-deployment-profiles.mjs");
  const catalogue = buildConfigurationCatalogue(snapshot, review);
  const validation = validateConfigurationCatalogue({
    snapshot,
    review,
    catalogue,
  });
  const deployment = deploymentProfileAccounting(
    snapshot.deploymentSources,
    review,
  );
  if (
    validation.errors.length ||
    deployment.errors.length ||
    catalogue.releaseCredit !== false
  )
    throw new Error("PUBLIC_ODHIN_SOURCE_DRIFT");
  const validatedDefault = snapshot.sources.find(
    (source) =>
      source.repository === "rpx-xui-webapp" &&
      source.path === "config/default.json",
  ).document;
  const central = Object.fromEntries(
    [
      "globalSearchServices",
      "waSupportedJurisdictions",
      "staffSupportedJurisdictions",
    ].map((key) => [
      key,
      validatedDefault[key].split(",").map((value) => value.trim()),
    ]),
  );
  const groups = Object.fromEntries(
    Object.keys(definitions).map((id) => [
      id,
      { total: 0, passed: 0, failed: 0, skipped: 0, timedOut: 0 },
    ]),
  );
  for (const { entry, observed } of records) {
    const group = groups[groupFor(entry.file)];
    if (!Object.hasOwn(group, observed.status) || observed.status === "total")
      throw new Error("PUBLIC_ODHIN_OUTCOME_REQUIRED");
    group.total++;
    group[observed.status]++;
  }
  const cards = Object.entries(definitions)
    .filter(([id]) => groups[id].total > 0)
    .map(([id, definition]) => {
      const count = groups[id];
      return `<article class="${profile === "local-aat" ? "col-md-6 col-xl-3" : "col-lg-4"}" data-harness-group="${id}" data-checks="${count.total}"><div class="odhin-thin-border p-3 h-100"><h2 class="h5">${definition.title}</h2><p><strong>${count.total} checks recorded</strong> · ${count.passed} passed · ${count.failed} failed · ${count.skipped} skipped · ${count.timedOut} timed out</p><p>${definition.purpose}</p><p><strong>Evidence:</strong> ${definition.boundary}</p></div></article>`;
    })
    .join("");
  const aatRecords = records.filter(
    (record) => groupFor(record.entry.file) === "aat",
  );
  const responsePassed = aatRecords.filter(
    (record) => record.observed.aatOutcome === "response-passed",
  ).length;
  const confirmedResponses = aatRecords.filter((record) =>
    ["response-passed", "service-family-contract-mismatch"].includes(
      record.observed.aatOutcome,
    ),
  ).length;
  const loginBlocked = aatRecords.filter(
    (record) => record.observed.aatOutcome === "login-setup-blocked",
  ).length;
  const mismatches = aatRecords.filter(
    (record) =>
      record.observed.aatOutcome === "service-family-contract-mismatch",
  );
  const mismatchNotice = mismatches
    .map(
      (record) =>
        `Global search is missing ${record.observed.aatMissingFamilies.map((code) => `${familyNames[code]} (${code})`).join(", ")}.`,
    )
    .join(" ");
  const families = catalogue.families
    .map((family) => {
      if (
        !Object.hasOwn(familyNames, family.id) ||
        family.capabilities.some(
          (capability) => !Object.hasOwn(capabilities, capability),
        )
      )
        throw new Error("PUBLIC_ODHIN_UNREVIEWED_FAMILY");
      const live = [
        ["globalSearchServices", 2, "Global search family list"],
        ["waSupportedJurisdictions", 3, "WA family list"],
        ["staffSupportedJurisdictions", 4, "Staff family list"],
      ]
        .filter(([key]) => central[key].includes(family.id))
        .map(([, index, label]) => {
          const expected = fixture.selections.environment[index];
          const observed = aatRecords.find(
            (record) =>
              JSON.stringify(record.entry.titlePath) ===
              JSON.stringify(normalize(expected).titlePath),
          )?.observed.aatOutcome;
          return `${label}: ${observed === "response-passed" ? "response check passed" : observed === "login-setup-blocked" ? "login/setup blocked; response not confirmed" : observed ? "not confirmed" : "not run"}`;
        });
      return `<tr><th scope="row">${escape(familyNames[family.id])} (${escape(family.id)})</th><td>${family.capabilities.map((key) => capabilities[key]).join(", ")}</td><td>Source/model inventory only</td><td>${profile === "local-aat" ? live.join("; ") || "No family-list probe assigned" : "NOT RUN"}</td><td>NOT RUN</td></tr>`;
    })
    .join("");
  const runtimeGaps = deployment.gaps.filter((gap) =>
    gap.startsWith("deployment-runtime-unproved:"),
  ).length;
  const previewGaps = deployment.gaps.filter((gap) =>
    gap.startsWith("unreviewed-deployment-family:"),
  ).length;
  const source = snapshot.sources.find(
    (item) =>
      item.repository === "rpx-xui-webapp" &&
      item.path === "config/default.json",
  );
  const prl = snapshot.sources.find(
    (item) => item.repository === "prl-ccd-definitions",
  );
  if (
    ![source?.revision, prl?.revision].every((revision) =>
      /^[a-f0-9]{40}$/.test(revision),
    )
  )
    throw new Error("PUBLIC_ODHIN_SOURCE_REVISION_REQUIRED");
  return `<section id="harness-overview" class="p-4">
<h1 class="h3">What this run checked</h1>
<p class="lead">${profile === "local-aat" ? `${records.length - aatRecords.length} local Harness/model checks + ${aatRecords.length} live AAT probes = ${records.length} checks. AAT: ${responsePassed}/${aatRecords.length} response checks passed; ${groups.aat.failed} failed callbacks (${loginBlocked} blocked by login/setup). ${confirmedResponses} endpoint responses confirmed. Deployed version unknown.` : `This run recorded ${records.length} checks on Harness logic and reviewed configuration models. It did not run a candidate EXUI application or CCD.`}</p>
${profile === "local-aat" ? "<p>Authenticated probes share one configured solicitor session; the public UI-configuration probe is anonymous. Other roles and persona combinations are not covered.</p>" : ""}
${mismatches.length ? `<div class="alert alert-danger" data-aat-contract-mismatch><strong>Required service-family contract differs.</strong> ${escape(mismatchNotice)} Source expectations remain unchanged; this is not a login/setup failure. The deployed configuration, build and session-specific cause is unknown.</div>` : ""}
<div class="row g-3 mb-3">${cards}</div>
<div class="odhin-thin-border p-3" data-runtime-obligations="${catalogue.obligations.length}"><h2 class="h5">${profile === "local-aat" ? "Live configuration checks; candidate-bound coverage still missing" : "Application coverage: not run in this build"}</h2>
<p><strong>0 / ${catalogue.obligations.length} candidate-bound catalogued requirements have execution evidence — candidate and CCD checks NOT RUN.</strong> Passing model or framework checks do not prove a service works in EXUI. Release approval remains unavailable.</p>
<p>The ${catalogue.obligations.length} source-catalogue obligations are a bounded inventory, not a complete universe of EXUI behaviour. ${runtimeGaps} deployment-profile/key runtime gaps and ${previewGaps} unreviewed preview-family cells remain outside those objects. Service-owner grouping, deployed profiles and discovery of unknown configuration changes remain open.</p></div>
<details class="odhin-thin-border p-3 mt-3"><summary><strong>Services and capabilities represented in the reviewed source models</strong></summary><p>These capability declarations span reviewed source profiles. They are not a claim that each service was individually exercised or enabled in this deployment. The shared catalogue-model checks above inspect this inventory; actual per-service UI and CCD behaviour is NOT RUN. ${profile === "local-aat" ? "The five AAT endpoint outcomes are shown separately below; they do not verify every family individually." : ""}</p>
<div class="table-responsive"><table class="table"><thead><tr><th>Service family</th><th>Declared capabilities</th><th>This build's evidence</th><th>Live AAT configuration reads</th><th>UI journey / CCD</th></tr></thead><tbody>${families}</tbody></table></div></details>
${
  profile === "local-aat"
    ? `<details class="odhin-thin-border p-3 mt-3"><summary><strong>Live AAT endpoint outcomes</strong></summary><p>Host: manage-case.aat.platform.hmcts.net. GET response expectations use the reviewed EXUI source contract; deployed version is unknown.</p><ul>${records
        .filter((record) => groupFor(record.entry.file) === "aat")
        .map(
          (record) =>
            `<li>${escape(record.entry.titlePath.at(-1))}: <strong>${escape(record.observed.status)}</strong> — ${escape(record.observed.aatOutcome || "failure-unclassified")}${record.observed.aatMissingFamilies?.length ? ` — missing ${record.observed.aatMissingFamilies.map((code) => escape(`${familyNames[code]} (${code})`)).join(", ")}` : ""}</li>`,
        )
        .join(
          "",
        )}</ul><p>Family assertions require the reviewed source subset; passing checks allow extra families and do not prove deployed-profile equivalence. No blanket service, workflow, browser or CCD result is inferred from these endpoint checks.</p></details>`
    : ""
}
<details class="odhin-thin-border p-3 mt-3"><summary><strong>Evidence basis and required gaps</strong></summary><p>Reviewed committed source projections: EXUI ${source.revision.slice(0, 8)}, Private Law definitions ${prl.revision.slice(0, 8)}. Test identities come from the reviewed declaration registry. Outcomes and durations come from this runner, not historical receipts.</p><p>Required gaps include candidate/browser interpretation, CCD permissions and persistence, deployed configuration and owner acceptance. PCS has a discovered source owner but no accepted CCD-backed assurance here. The known postal postcode constraint remains blocked; this model run does not fix or clear it. No retired mock UI, accessibility, screenshot or historical native result is credited to this build.</p><p>The separate Build phase checks Node contracts, pipeline contracts, TypeScript and lint. Their individual results are not test rows in this Playwright report. Rich diagnostics remain private.</p></details>
<p class="mt-3">Open the Tests tab for the actual checked contracts and outcomes. Supporting evidence only — no release credit.</p></section>`;
}
module.exports = {
  entries,
  profiles,
  normalize,
  groupFor,
  definitions,
  renderOverview,
  familyNames,
};
