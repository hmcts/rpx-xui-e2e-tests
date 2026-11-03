const fixture = require("./fixtures/harness-public-report-titles.json");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const identity = (entry) =>
  JSON.stringify([
    entry.file,
    entry.titlePath.map((title, index) => (index === 2 ? entry.file : title)),
  ]);
function metadataFor(entry) {
  for (const definitions of [fixture.lanes, fixture.slices]) {
    if (
      !Array.isArray(definitions) ||
      new Set(definitions.map((item) => item.id)).size !== definitions.length ||
      definitions.some(
        (item) =>
          !["id", "label", "description"].every(
            (key) => typeof item[key] === "string" && item[key].trim(),
          ),
      )
    )
      throw new Error("PUBLIC_ODHIN_UNREVIEWED_COVERAGE");
  }
  const matches = Object.values(fixture.selections)
    .flat()
    .filter((item) => identity(item) === identity(entry));
  const metadata = matches.length === 1 && matches[0].metadata;
  const slice = fixture.slices?.find((item) => item.id === metadata?.slice);
  const lane = fixture.lanes?.find((item) => item.id === slice?.lane);
  if (
    !metadata ||
    !slice ||
    !lane ||
    typeof metadata.behaviour !== "string" ||
    !metadata.behaviour.trim() ||
    typeof metadata.limits !== "string" ||
    !metadata.limits.trim() ||
    !["services", "jurisdictions", "caseTypes"].every(
      (key) =>
        Array.isArray(metadata[key]) &&
        metadata[key].length &&
        metadata[key].every(
          (value) => typeof value === "string" && value.trim(),
        ),
    )
  )
    throw new Error("PUBLIC_ODHIN_UNREVIEWED_COVERAGE");
  return { ...metadata, slice, lane };
}
function outcomes(records) {
  if (!records.length)
    return '<span class="harness-status not-run">Not run</span>';
  return ["passed", "failed", "timedOut", "skipped"]
    .map((status) => {
      const count = records.filter(
        (record) => record.observed.status === status,
      ).length;
      return count
        ? `<span class="harness-status ${status}">${count} ${status === "timedOut" ? "timed out" : status}</span>`
        : "";
    })
    .join(" ");
}
const unique = (values) => [...new Set(values)].sort();
const scope = (values) => unique(values).map(escape).join(", ");
function renderCoverage(records) {
  const checked = records.map((record, index) => ({
    ...record,
    metadata: metadataFor(record.entry),
    index,
  }));
  if (
    new Set(checked.map((record) => identity(record.entry))).size !==
    records.length
  )
    throw new Error("PUBLIC_ODHIN_UNREVIEWED_COVERAGE");
  const lanes = fixture.lanes
    .map((lane) => {
      const selected = checked.filter(
        (record) => record.metadata.lane.id === lane.id,
      );
      return `<tr data-lane="${escape(lane.id)}"><th scope="row"><button type="button" class="harness-link" data-harness-lane="${escape(lane.id)}">${escape(lane.label)}</button></th><td>${escape(lane.description)}</td><td>${selected.length}</td><td>${outcomes(selected)}</td></tr>`;
    })
    .join("");
  const filters = [
    [
      "lane",
      "Evidence lane",
      fixture.lanes.map((lane) => [lane.id, lane.label]),
    ],
    [
      "services",
      "Service / jurisdiction",
      unique(checked.flatMap((record) => record.metadata.services)).map(
        (value) => [value, value],
      ),
    ],
    [
      "caseTypes",
      "Case type",
      unique(checked.flatMap((record) => record.metadata.caseTypes)).map(
        (value) => [value, value],
      ),
    ],
  ]
    .map(
      ([key, label, options]) =>
        `<label>${label}<select data-harness-filter="${key}"><option value="">All</option>${options.map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`).join("")}</select></label>`,
    )
    .join("");
  const slices = fixture.slices
    .map((slice) => {
      const selected = checked.filter(
        (record) => record.metadata.slice.id === slice.id,
      );
      if (!selected.length) return "";
      const lane = selected[0].metadata.lane;
      const tests = selected
        .map((record) => {
          const m = record.metadata;
          return `<tr data-harness-check="${record.index}" data-status="${escape(record.observed.status)}" data-slice="${escape(slice.id)}" data-lane="${escape(lane.id)}" data-services="${escape(JSON.stringify(m.services))}" data-case-types="${escape(JSON.stringify(m.caseTypes))}"><td><strong>${escape(m.behaviour)}</strong><details class="harness-test-source"><summary>Test name and evidence limits</summary><p>${escape(record.entry.titlePath.at(-1))}</p><code>${escape(record.entry.file)}</code><p>${escape(Array.isArray(m.limits) ? m.limits.join(" ") : m.limits)}</p></details></td><td>${scope(m.jurisdictions)}</td><td>${scope(m.caseTypes)}</td><td>${outcomes([record])}</td><td><button type="button" class="harness-link" data-harness-open-test="harness-${record.index}-0">Test detail</button></td></tr>`;
        })
        .join("");
      return `<tr data-harness-slice="${escape(slice.id)}"><td colspan="5"><details class="harness-slice"><summary><span><strong>${escape(slice.label)}</strong><small>${escape(lane.label)}</small></span><span data-slice-services>${scope(selected.flatMap((record) => record.metadata.services))}</span><span data-slice-cases>${scope(selected.flatMap((record) => record.metadata.caseTypes))}</span><span data-slice-outcomes>${outcomes(selected)}</span><span class="harness-match-count">${selected.length} tests</span></summary><p>${escape(slice.description)}</p><div class="table-responsive"><table class="table harness-checks"><thead><tr><th>What this test checks</th><th>Jurisdiction</th><th>Case type</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${tests}</tbody></table></div></details></td></tr>`;
    })
    .join("");
  return `<section aria-labelledby="harness-lanes-heading"><h2 id="harness-lanes-heading">Test lanes</h2><p>A lane describes how a check runs. Counts below are unique tests, not a percentage of EXUI covered.</p><div class="table-responsive"><table id="harness-lanes" class="table"><thead><tr><th>Lane</th><th>What the evidence means</th><th>Tests</th><th>Results</th></tr></thead><tbody>${lanes}<tr><th>Application journeys / CCD / accessibility</th><td>These require their own application run; not executed by this diagnostic collection.</td><td>0</td><td>${outcomes([])}</td></tr></tbody></table></div></section><section aria-labelledby="harness-slices-heading"><h2 id="harness-slices-heading">Test slices and coverage</h2><p>Expand a slice to see every test, its exact scope and result. Service lists describe the checked configuration or fixture; they do not multiply the test count.</p><div class="harness-filters">${filters}<button type="button" data-harness-clear>Clear filters</button></div><p id="harness-filter-count" role="status">${checked.length} tests across ${fixture.slices.filter((slice) => checked.some((record) => record.metadata.slice.id === slice.id)).length} slices</p><div class="table-responsive"><table id="harness-slices" class="table"><thead><tr><th>Slice / lane</th><th>Service / jurisdiction</th><th>Case types represented</th><th>Results</th><th>Tests</th></tr></thead><tbody>${slices}</tbody></table></div></section>`;
}
module.exports = { metadataFor, renderCoverage, escape };
