# Source-derived result tables: next native increment

Status: deterministic import workbook prepared and serialization validated. Real import is unverified. No application, search, catalogue or release credit.

The committed result-columns fixture binds fourteen PRL source rows to their exact
labels, order and field dependencies. An import artifact is retained at `scripts/fixtures/ccd/result-columns-import/definition.xlsx`. It is not yet an executable application slice.

Regenerate into a fresh directory with `node scripts/prepare-harness-result-columns.mjs --output /absolute/fresh/output`. The companion JSON labels every synthetic scaffold sheet, and binding.json seals both JSON and workbook. Only CaseTypeID changes in the source-derived sheets. The existing observer role `caseworker-harness` has synthetic create/read access; no source authorisation claim follows.

## Transport and dependencies

The retained candidate `3734db2` sets `elasticSearchFlag = true` in both
`src/cases/containers/case-list/case-list.component.ts` and
`src/cases/containers/case-search/case-search.component.ts`. The toolkit calls
`POST /data/internal/searchCases?ctid=...&use_case=...`. Do not change this flag or
substitute a successful legacy GET response to claim candidate search coverage.

CCD datastore source reference `96eaf99f25bf447559be12e06050444877744e7e`,
`v2/internal/controller/UICaseSearchController.java`, routes this POST through
`AuthorisedCaseSearchOperation`. Its legacy `endpoint/ui/QueryEndpoint.java`
GET route instead reaches JPA through `DefaultSearchOperation` and
`DefaultCaseDetailsRepository`. A legacy feasibility probe is separate evidence.
These source references have not yet been bound to the retained CCD image build.

Local ccd-docker revision `197a835ca972ddb7c63f424d369f649d8259966d`,
`compose/elasticsearch.yml`, specifies Elasticsearch 7.17.0. Public registry
metadata resolves these immutable manifests:

| Platform | docker.elastic.co/elasticsearch/elasticsearch manifest |
| --- | --- |
| linux/amd64 | sha256:4f588d1001c207d6217e61747df8752c5d2a04c41e3a235c621bfa3a57e352f5 |
| linux/arm64 | sha256:456f75dfb9d64d21471535960155e2b206363e6fbe17d3c8dc9dfde55b0bae22 |

These are registry pins, not proof of compatibility with the retained CCD images.
The native runtime now accepts `startCcdRuntime(output, { platform, elasticsearch: true })`
or the existing startup CLI's `--elasticsearch` flag. This adds one owned ES container
to the isolated runtime namespace, without a published port or shared volume. The
default remains seven services with search disabled. The CLI still imports the
existing nested fixture; it does not import or prove the result-columns slice.

`scripts/fixtures/ccd/elasticsearch-images.json` records both manifest and config
digests, verified against immutable public registry manifests. Startup requires the
matching image already present; image retrieval is separate from the isolated run.
ES uses an owned cluster name, loopback binding, one node and disposable tmpfs data.
Readiness requires its own cluster to report yellow or green, one node and no timeout
before CCD services start. Reuse verifies the optional inventory and image identity;
recovery includes ES and removes the namespace only after all sidecars. An explicitly
requested CLI mode must match the reused runtime.

Opt-in startup enables definition-store `ELASTIC_SEARCH_ENABLED`, `ELASTIC_SEARCH_HOST`,
`ELASTIC_SEARCH_FAIL_ON_IMPORT`, and datastore `ELASTIC_SEARCH_ENABLED`,
`ELASTIC_SEARCH_HOSTS`, `ELASTIC_SEARCH_DATA_NODES_HOSTS` against loopback.
Offline lifecycle tests cover both platforms, defaults, identity rejection,
readiness, cancellation and cleanup failure. No live CCD/ES compatibility follows
from these checks; runtime import and real search are still unverified.

Use definition-store's own import-generated mappings. Reference source
`c37c9b84e556f22086f1eed7b94468302870eb9e`,
`elastic-search-support/.../mapping/CaseMappingGenerator.java`, generates both
predefined metadata and ordinary field mappings. Do not create guessed dynamic
mappings. Inspect the actual imported alias and mapping, including the date and
sortable field types, before seeding. The two metadata field types remain unresolved
in the fixture until an actual CCD descriptor or image-bound implementation proves
them; enum membership alone does not establish a renderer type.

## Controlled seed, with synchronization explicitly excluded

Create synthetic cases through real CCD. Obtain only those created cases from the
owned database using their returned public references. ccd-docker's pinned
`logstash/pipeline/01_input.conf`, `02_filter.conf`, and `03_output.conf` establish:

- Index alias: lowercase case type plus `_cases`.
- Elasticsearch document ID: internal SQL `case_data.id`, not the public reference.
- Payload: id, created_date, last_modified, jurisdiction, case_type_id, state,
  last_state_modified_date, data, data_classification, reference,
  security_classification, supplementary_data.
- JSON data and classification originate from persisted CCD rows.

An explicit seed may reproduce that bounded projection into the real imported
index, then refresh and query it. Refuse missing or duplicate reference matches,
foreign case types and an unexpected alias. Preserve actual timestamps and security
metadata; never replace them with expected values. This proves real search over
controlled persisted cases, not production Logstash synchronization, indexing
latency, global search or deployment configuration.

## First executable slice and acceptance

1. Build/import a new isolated `HarnessResultsPRL` definition from the validated
   source fixture. Retain all fourteen columns and the eight ordinary field types.
   Add only explicit scaffolding for jurisdiction, states, create event and role
   permissions. Capture import and resolved runtime descriptors.
2. Create three cases with deliberately different applicant/respondent/child names,
   unique familyman numbers, dates and submitted timestamps. Choose submission order
   different from descending timestamp order so an accidental default order fails.
3. Seed only their persisted rows into the definition-generated ES index. Prove real
   POST search returns the references and candidate receives those responses through
   an allowlisted gateway. No browser route fulfilling search with fixture JSON.
4. Exercise actual candidate Search and Case list. Assert each table's exact ordered
   headers and each row's value-to-header association, including formatted Date,
   DateTime, real created date, and actual state display value. Assert descending
   submitted timestamp across all three workbasket rows before any user sort click.
5. Reimport isolated omission, field-binding and ordering mutants. Observe that real
   definition/query/browser output changed before accepting a failed assertion as an
   effective fault. A broken backend or timeout is not the intended fault witness.
6. Bind each source row's credit to its own observed column and value assertion plus
   effective applicable fault; one successful navigation cannot satisfy fourteen rows.
   Keep any row with an unproved material facet unsatisfied. Excluding a material facet from the claim never permits partial-row credit.

Current gaps: no runtime import wiring or successful import evidence, live ES compatibility, persisted-row seed,
search gateway routes, actual metadata descriptor, candidate browser proof, fault
execution or source-to-runtime image binding. None of these prerequisites have run.

## Whole-row facet contract

`buildResultColumnFacetContract()` in `scripts/lib/exui-result-columns.mjs` derives
all fourteen per-row proof specifications from the sealed source fixture. It is not
an evidence adapter and exposes no API for marking facet IDs observed or accepted.
Every row stays unproved and all credit flags remain false. New source attributes
must be explicitly classified; unknown attributes fail closed.

The result rows themselves include LiveFrom, normalized CaseTypeID, exact
CaseFieldID, Label and DisplayOrder; one also requires ResultsOrdering. Therefore
labels/order/value formatting alone cannot establish all fourteen rows. Real CCD
metadata descriptors remain unresolved for CREATED_DATE and STATE. Ordinary field
dependencies additionally require actual imported type/security/live-date attributes
and verification of the supported live-date/searchable consumer semantics. Those
semantics remain unresolved; neither future-date column removal nor a particular
searchable mapping/query effect is assumed. Preservation in the
workbook is provenance evidence, not proof of those behaviors.

Full row credit remains unavailable until a trusted runtime adapter binds all of
these observations and effective faults to the candidate/import/source identities.
Input hint rendering and index synchronization are separate claims; that boundary
does not waive a material table facet. No generic catalogue acceptance is changed.

Source inspection at definition-store reference
`c37c9b84e556f22086f1eed7b94468302870eb9e` confirms
`GenericLayoutParser.java:229` and `CaseFieldParser.java:83` parse LiveFrom,
and `CaseFieldParser.java:85` parses Searchable (default true). These assignments
do not establish activation/version-selection behavior or a specific ES query
effect. This reference is not bound to the retained CCD image. The contract leaves
consumer semantics unresolved pending that binding or a controlled import probe.
