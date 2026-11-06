const {
  renderNativeEvidence,
  objectDigest,
} = require("./harness-native-report.cjs");
const {
  metadataFor,
  renderCoverage,
} = require("./harness-report-coverage.cjs");
const fixture = require("./fixtures/harness-public-report-titles.json");
const snapshot = require("./fixtures/exui-configuration-source.json");
const review = require("./fixtures/exui-configuration-review.json");
const { readAatProfile } = require("./lib/exui-aat-profile.cjs");

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

async function renderOverview(
  records,
  profile = "harness",
  { nativeEvidence = null, diagnosticSource = null } = {},
) {
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
  const runtimeCoverage = nativeEvidence?.catalogueCoverage;
  if (
    nativeEvidence &&
    (!runtimeCoverage ||
      runtimeCoverage.catalogueDigest !==
        `sha256:${objectDigest(catalogue.obligations)}` ||
      runtimeCoverage.selected !== catalogue.obligations.length ||
      !Array.isArray(runtimeCoverage.creditedObligationIds) ||
      runtimeCoverage.creditedObligationIds.some(
        (id) => !catalogue.obligations.some((item) => item.id === id),
      ) ||
      ["candidate", "ccd"].some(
        (boundary) =>
          runtimeCoverage[boundary] !==
          catalogue.obligations.filter(
            (item) =>
              item.requiredBoundary === boundary &&
              runtimeCoverage.creditedObligationIds.includes(item.id),
          ).length,
      ))
  )
    throw new Error("PUBLIC_ODHIN_NATIVE_CATALOGUE_MISMATCH");
  const satisfiedRuntimeRequirements =
    runtimeCoverage?.creditedObligationIds.length ?? 0;
  const requirementKinds = {
    "configuration-profile": "Service-family configuration profiles",
    "definition-shape": "CCD field, page, complex-type and search shapes",
    "pilot-cell": "Role, action, recipient and channel scenarios",
    "shared-policy": "Shared rendering and access policies",
    "source-shape-sequence": "Nested-field validation and persistence sequences",
    "configuration-decentralisation": "Decentralised application routing contracts",
  };
  const credited = new Set(runtimeCoverage?.creditedObligationIds ?? []);
  const catalogueBreakdown = [...new Set(catalogue.obligations.map(item => item.kind))].map(kind => {
    const entries = catalogue.obligations.filter(item => item.kind === kind);
    const accepted = entries.filter(item => credited.has(item.id)).length;
    return `<tr data-catalogue-kind="${escape(kind)}" data-catalogue-total="${entries.length}" data-catalogue-accepted="${accepted}"><th scope="row">${escape(requirementKinds[kind] ?? kind)}</th><td>${entries.length}</td><td>${accepted}</td><td>${entries.length - accepted}</td></tr>`;
  }).join("");

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
  const aatProfile = profile === "local-aat" ? readAatProfile() : undefined;
  const liveFamilies = aatProfile?.families ?? central;
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
  const aatRecords = records.filter(
    (record) => groupFor(record.entry.file) === "aat",
  );
  const responsePassed = aatRecords.filter(
    (record) => record.observed.aatOutcome === "response-passed",
  ).length;
  const confirmedResponses = aatRecords.filter((record) =>
    [
      "response-passed",
      "service-family-contract-mismatch",
      "aat-profile-contract-mismatch",
    ].includes(record.observed.aatOutcome),
  ).length;
  const loginBlocked = aatRecords.filter(
    (record) => record.observed.aatOutcome === "login-setup-blocked",
  ).length;
  const mismatches = aatRecords.filter((record) =>
    [
      "service-family-contract-mismatch",
      "aat-profile-contract-mismatch",
    ].includes(record.observed.aatOutcome),
  );
  const mismatchNotice = mismatches
    .map((record) =>
      record.observed.aatOutcome === "aat-profile-contract-mismatch"
        ? "A declared AAT service-family endpoint differs from the reviewed profile."
        : `Global search is missing ${record.observed.aatMissingFamilies.map((code) => `${familyNames[code]} (${code})`).join(", ")}.`,
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
        .filter(([key]) => liveFamilies[key].includes(family.id))
        .map(([, index, label]) => {
          const expected = fixture.selections.environment[index];
          const observed = aatRecords.find(
            (record) =>
              JSON.stringify(record.entry.titlePath) ===
              JSON.stringify(normalize(expected).titlePath),
          )?.observed.aatOutcome;
          return `${label}: ${observed === "response-passed" ? "response check passed" : observed === "login-setup-blocked" ? "login/setup blocked; response not confirmed" : observed ? "not confirmed" : "not run"}`;
        });
      return `<tr><th scope="row">${escape(familyNames[family.id])} (${escape(family.id)})</th><td>${family.capabilities.map((key) => capabilities[key]).join(", ")}</td><td>Source/model inventory only</td><td>${profile === "local-aat" ? live.join("; ") || "No family-list probe assigned" : "NOT RUN"}</td><td>${family.id === "PRIVATELAW" && nativeEvidence?.personalServiceAdmission ? nativeEvidence.personalServiceAdmission.joint?.status === "included" ? "Personal-service event row: 1 candidate requirement included; bounded nine-key proof, not the full service" : "Personal-service event row: separate 1/1, not included in main coverage" : family.id === "DIVORCE" && nativeEvidence?.divorceProfileAdmission ? nativeEvidence.divorceProfileAdmission.joint?.status === "included" ? "DIVORCE profile: 1 requirement included in main candidate coverage" : "Separate profile run: 1/1 accepted; excluded from main cohort count" : nativeEvidence ? "See bounded native proofs above; no per-family profile claim" : "NOT RUN"}</td></tr>`;
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
<header class="harness-intro">
<h1 class="h3">What this run checked</h1>
<p>${profile === "local-aat" ? `${records.length - aatRecords.length} local Harness/model checks + ${aatRecords.length} live AAT probes = ${records.length} checks. AAT: ${responsePassed}/${aatRecords.length} response checks passed; ${groups.aat.failed} failed callbacks (${loginBlocked} blocked by login/setup); ${groups.aat.timedOut} timed out. ${confirmedResponses} endpoint responses confirmed. Deployed version unknown.` : `This run recorded ${records.length} checks on Harness logic and reviewed configuration models. ${nativeEvidence ? "The separately validated native execution is shown below." : "No validated native candidate application or CCD run is attached."}`}</p>
${profile === "local-aat" ? "<p>Authenticated probes share one configured solicitor session; the public UI-configuration probe is anonymous. Other roles and persona combinations are not covered.</p>" : ""}
${mismatches.length ? `<div class="alert alert-danger" data-aat-contract-mismatch><strong>Required service-family contract differs.</strong> ${escape(mismatchNotice)} Source expectations remain unchanged; this is not a login/setup failure. The deployed configuration, build and session-specific cause is unknown.</div>` : ""}
${diagnosticSource ? `<p class="harness-diagnostic-source" data-diagnostic-source-sha256="${objectDigest(diagnosticSource)}">Diagnostic source captured before execution: <code>${escape(diagnosticSource.commit || "commit unavailable")}</code> (${escape(diagnosticSource.state)}), ${escape(diagnosticSource.capturedAt)}. This stamp is not an immutable candidate seal.</p>` : ""}
</header>
<section id="harness-application-coverage" class="harness-application-coverage" aria-labelledby="harness-application-coverage-heading" data-runtime-obligations="${catalogue.obligations.length}"><h2 id="harness-application-coverage-heading">Application coverage and remaining gaps</h2>
<p><strong>${satisfiedRuntimeRequirements} / ${catalogue.obligations.length} catalogue requirements satisfied by accepted runtime evidence — ${nativeEvidence ? `${runtimeCoverage.missing} remain unsatisfied. See the separate native proof outcomes below, including failed or blocked executions.` : "No accepted candidate/CCD runtime evidence is attached. See the build summary for the native gate outcome."}</strong> Passing model or framework checks do not prove a service works in EXUI. Release approval remains unavailable.</p>
<p>The ${catalogue.obligations.length} source-catalogue obligations are a bounded inventory, not a complete universe of EXUI behaviour. ${runtimeGaps} deployment-profile/key runtime gaps and ${previewGaps} unreviewed preview-family cells remain outside those objects. Service-owner grouping, deployed profiles and discovery of unknown configuration changes remain open.</p>
<p>Awaiting evidence is not a count of failed tests. This inventory mixes the distinct groups below; it is not a percentage of all EXUI behaviour. A shared slice can satisfy several entries only when its assertions and validated evidence demonstrate each required behaviour.</p>
<div class="table-responsive"><table id="harness-catalogue-breakdown" class="table"><thead><tr><th>What the catalogue contains</th><th>Entries</th><th>Accepted runtime evidence</th><th>Awaiting evidence</th></tr></thead><tbody>${catalogueBreakdown}</tbody></table></div></section>
${renderCoverage(records, { nativeAttached: Boolean(nativeEvidence), labels: familyNames })}
${renderNativeEvidence(nativeEvidence)}
<details class="odhin-thin-border p-3 mt-3"><summary><strong>Services and capabilities represented in the reviewed source models</strong></summary><p>These capability declarations span reviewed source profiles. They are not a claim that each service was individually exercised or enabled in this deployment. The shared catalogue-model checks above inspect this inventory; ${nativeEvidence ? "the native proofs identify their actual fixture and service scope. Any separately admitted DIVORCE profile is labelled with its own producer and excluded from the main cohort count." : "No accepted per-service UI or CCD evidence is attached."} ${profile === "local-aat" ? "The five AAT endpoint outcomes are shown separately below; they do not verify every family individually." : ""}</p>
<div class="table-responsive"><table class="table"><thead><tr><th>Service family</th><th>Declared capabilities</th><th>This build's evidence</th><th>Live AAT configuration reads</th><th>UI journey / CCD</th></tr></thead><tbody>${families}</tbody></table></div></details>
${
  profile === "local-aat"
    ? `<details class="odhin-thin-border p-3 mt-3"><summary><strong>Live AAT endpoint outcomes</strong></summary><p>Host: manage-case.aat.platform.hmcts.net. Family expectations use declared AAT profile ${aatProfile.source.repository}@${aatProfile.source.revision} ${aatProfile.source.path}; the deployed build remains unknown. AAT global/WA explicitly include SSCS, separately from default-model lists. Exact family membership is checked; source declaration is not proof of deployed identity.</p><ul>${records
        .filter((record) => groupFor(record.entry.file) === "aat")
        .map(
          (record) =>
            `<li>${escape(record.entry.titlePath.at(-1))}: <strong>${escape(record.observed.status)}</strong> — ${escape(record.observed.aatOutcome || "failure-unclassified")}${record.observed.aatMissingFamilies?.length ? ` — missing ${record.observed.aatMissingFamilies.map((code) => escape(`${familyNames[code]} (${code})`)).join(", ")}` : ""}</li>`,
        )
        .join(
          "",
        )}</ul><p>AAT family assertions require exact declared membership, including rejection of extras/duplicates; response agreement does not prove deployed build/profile identity. No blanket service, workflow, browser or CCD result is inferred from these endpoint checks.</p></details>`
    : ""
}
<details class="odhin-thin-border p-3 mt-3"><summary><strong>Evidence basis and required gaps</strong></summary><p>Reviewed committed source projections: EXUI ${source.revision.slice(0, 8)}, Private Law definitions ${prl.revision.slice(0, 8)}. Test identities come from the reviewed declaration registry. Diagnostic outcomes and durations come from this runner. ${nativeEvidence ? "Native outcomes come only from the explicitly supplied, independently validated execution descriptor and receipts." : "No validated native execution descriptor is attached."}</p><p>${nativeEvidence ? "The native section covers only its named application/CCD proofs; all other candidate interpretation, deployed configuration and owner acceptance gaps remain." : "Required gaps include candidate/browser interpretation, CCD permissions and persistence, deployed configuration and owner acceptance."} PCS has a discovered source owner but no accepted CCD-backed assurance here. Postal status, when attached, is reported from that native execution; diagnostic models do not establish postal runtime behaviour. No retired mock UI, accessibility or screenshot result is credited to this build.</p><p>The separate Build phase checks Node contracts, pipeline contracts, TypeScript and lint. Their individual results are not test rows in this Playwright report. Rich diagnostics remain private.</p></details>
<p class="mt-3">The Odhín result charts and Tests tab count diagnostic tests only. Native baseline proofs and deliberate fault checks are counted in their own tables above when attached. Supporting evidence only — no release credit.</p></section>`;
}
module.exports = {
  entries,
  profiles,
  metadataFor,
  normalize,
  groupFor,
  definitions,
  renderOverview,
  familyNames,
};
