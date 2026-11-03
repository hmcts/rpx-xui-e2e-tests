import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const DEPLOYMENT_ENVIRONMENT_KEYS = Object.freeze([
  "NODE_ENV", "NODE_CONFIG_ENV", "WA_SUPPORTED_JURISDICTIONS",
  "GLOBAL_SEARCH_SERVICES", "STAFF_SUPPORTED_JURISDICTIONS",
  "SERVICE_REF_DATA_MAPPING", "JURISDICTIONS", "FEATURE_WORKALLOCATION_ENABLED",
  "FEATURE_ACCESS_MANAGEMENT_ENABLED", "FEATURE_REDIS_ENABLED", "FEATURE_OIDC_ENABLED",
  "FEATURE_APP_INSIGHTS_ENABLED", "APPINSIGHTS_SAMPLING_PERCENTAGE",
  "DECENTRALISED_CASE_TYPE_CONFIG", "DECENTRALISED_SERVICE_MAP",
]);
const directory = "charts/xui-webapp";
const chartPath = `${directory}/Chart.yaml`;
const profiles = Object.freeze({
  base: [`${directory}/values.yaml`],
  aat: [`${directory}/values.yaml`, `${directory}/values.aat.template.yaml`],
  preview: [`${directory}/values.yaml`, `${directory}/values.preview.template.yaml`],
});
const expectedPaths = [chartPath, ...new Set(Object.values(profiles).flat())].sort();
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const scalar = value => value === null || ["string", "boolean"].includes(typeof value) || typeof value === "number" && Number.isFinite(value);
const sorted = value => Array.isArray(value) ? value.map(sorted) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const equal = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const digest = value => createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
const keysEqual = (value, keys) => object(value) && equal(Object.keys(value).sort(), [...keys].sort());
const absentEnvironment = () => Object.fromEntries(DEPLOYMENT_ENVIRONMENT_KEYS.map(key => [key, { present: false }]));

export function projectDeploymentSource(path, bytes) {
  const yaml = createRequire(import.meta.url)("js-yaml");
  const document = yaml.load(bytes.toString("utf8"), { schema: yaml.CORE_SCHEMA });
  if (!object(document)) throw Error("INVALID_DEPLOYMENT_YAML_OBJECT");
  if (path === chartPath) {
    if (typeof document.name !== "string" || typeof document.version !== "string" || !Array.isArray(document.dependencies)) throw Error("INVALID_DEPLOYMENT_CHART_METADATA");
    return { name: document.name, version: document.version, dependencies: document.dependencies.map(dependency => {
      if (!object(dependency) || typeof dependency.name !== "string" || typeof dependency.version !== "string" ||
          Object.hasOwn(dependency, "condition") && typeof dependency.condition !== "string") throw Error("INVALID_DEPLOYMENT_CHART_DEPENDENCY");
      return { name: dependency.name, version: dependency.version,
        ...(Object.hasOwn(dependency, "condition") ? { condition: dependency.condition } : {}) };
    }) };
  }
  const nodejs = Object.hasOwn(document, "nodejs") ? document.nodejs : {};
  if (!object(nodejs)) throw Error("INVALID_DEPLOYMENT_NODEJS_MAP");
  const environment = Object.hasOwn(nodejs, "environment") ? nodejs.environment : {};
  if (!object(environment) || Object.hasOwn(environment, "<<")) throw Error("UNSUPPORTED_DEPLOYMENT_ENVIRONMENT_MAP");
  return { environment: Object.fromEntries(DEPLOYMENT_ENVIRONMENT_KEYS.map(key => {
    if (!Object.hasOwn(environment, key)) return [key, { present: false }];
    if (!scalar(environment[key])) throw Error(`UNSUPPORTED_DEPLOYMENT_ENVIRONMENT_VALUE:${key}`);
    return [key, { present: true, value: environment[key] }];
  })) };
}

export function readDeploymentSources(webappRoot, metadata) {
  const names = readdirSync(join(webappRoot, directory)).sort()
    .filter(name => name === "Chart.yaml" || /^values.*\.ya?ml$/.test(name));
  const sources = names.map(name => {
    const path = `${directory}/${name}`;
    if (name.endsWith(".yml") || !lstatSync(join(webappRoot, path)).isFile()) throw Error(`UNSUPPORTED_DEPLOYMENT_SOURCE:${path}`);
    const bytes = readFileSync(join(webappRoot, path));
    return { repository: "rpx-xui-webapp", ...metadata(path), path,
      fileDigest: createHash("sha256").update(bytes).digest("hex"),
      document: projectDeploymentSource(path, bytes) };
  });
  return { schemaVersion: 1, sources };
}

function validEnvironment(environment) {
  return keysEqual(environment, DEPLOYMENT_ENVIRONMENT_KEYS) && DEPLOYMENT_ENVIRONMENT_KEYS.every(key => {
    const entry = environment[key];
    return object(entry) && (entry.present === false && keysEqual(entry, ["present"]) ||
      entry.present === true && keysEqual(entry, ["present", "value"]) && scalar(entry.value));
  });
}

// Source-only accounting. Neither this metadata nor execution facts establish a deployed profile.
export function deploymentProfileAccounting(block, review) {
  const errors = [], gaps = [], result = [], sourceManifest = [];
  const expected = review.checkedInDeploymentProfiles;
  if (!keysEqual(block, ["schemaVersion", "sources"]) || block.schemaVersion !== 1 || !Array.isArray(block.sources))
    return { profiles: [], sourceManifest: [], errors: ["deployment-sources-required"], gaps: [] };
  if (!expected || !equal(Object.keys(expected.profiles ?? {}).sort(), Object.keys(profiles).sort()) ||
      !equal(expected.selectedEnvironmentKeys, DEPLOYMENT_ENVIRONMENT_KEYS)) errors.push("deployment-review-profile-closure");
  for (const pins of [expected?.sourceFileDigests, expected?.sourceFragmentDigests])
    if (!keysEqual(pins, expectedPaths)) errors.push("deployment-review-source-closure");
  const byPath = new Map();
  for (const source of block.sources) {
    if (!object(source) || typeof source.path !== "string") { errors.push("deployment-invalid-source"); continue; }
    if (byPath.has(source.path)) errors.push(`deployment-duplicate-source:${source.path}`);
    byPath.set(source.path, source);
    if (source.tracked !== true) errors.push(`deployment-source-not-tracked:${source.path}`);
    if (!expectedPaths.includes(source.path)) errors.push(`deployment-unreviewed-source:${source.path}`);
    if (source.repository !== "rpx-xui-webapp" || source.revision !== expected?.sourceRevision) errors.push(`deployment-source-revision-drift:${source.path}`);
    if (source.fileDigest !== expected?.sourceFileDigests?.[source.path]) errors.push(`deployment-source-file-drift:${source.path}`);
    if (!object(source.document)) { errors.push(`deployment-invalid-fragment:${source.path}`); continue; }
    if (digest(source.document) !== expected?.sourceFragmentDigests?.[source.path]) errors.push(`deployment-source-fragment-drift:${source.path}`);
    if (source.path !== chartPath && (!keysEqual(source.document, ["environment"]) || !validEnvironment(source.document.environment)))
      errors.push(`deployment-environment-shape:${source.path}`);
    sourceManifest.push({ repository: source.repository, revision: source.revision, path: source.path,
      tracked: source.tracked, fileDigest: source.fileDigest, fragmentDigest: digest(source.document) });
  }
  for (const path of expectedPaths) if (!byPath.has(path)) errors.push(`deployment-missing-source:${path}`);
  for (const [name, paths] of Object.entries(profiles)) {
    const environment = absentEnvironment(), valueSources = {};
    for (const path of paths) {
      const values = byPath.get(path)?.document?.environment;
      if (!validEnvironment(values)) continue;
      // This is last-declared source metadata: a present null stays null, not a Helm merge/fallback rule.
      for (const key of DEPLOYMENT_ENVIRONMENT_KEYS) if (values[key].present) {
        environment[key] = { ...values[key] };
        valueSources[key] = path;
      }
    }
    const reviewed = expected?.profiles?.[name];
    if (!equal(reviewed?.sources, paths) || !equal(reviewed?.environment, environment)) errors.push(`deployment-profile-source-drift:${name}`);
    const unreviewedFamilies = [];
    for (const key of DEPLOYMENT_ENVIRONMENT_KEYS) {
      gaps.push(`deployment-runtime-unproved:${name}:${key}`);
      if (environment[key].present && environment[key].value === null) gaps.push(`deployment-declared-null:${name}:${key}`);
    }
    for (const key of ["JURISDICTIONS", "WA_SUPPORTED_JURISDICTIONS", "GLOBAL_SEARCH_SERVICES", "STAFF_SUPPORTED_JURISDICTIONS"]) {
      const entry = environment[key];
      if (!entry.present || typeof entry.value !== "string") continue;
      for (const family of entry.value.split(",").map(value => value.trim()).filter(Boolean))
        if (!review.families.includes(family)) {
          unreviewedFamilies.push(family);
          gaps.push(`unreviewed-deployment-family:${name}:${key}:${family}`);
        }
    }
    const distinctFamilies = [...new Set(unreviewedFamilies)].sort();
    gaps.push(`deployment-rendered-values-unavailable:${name}`, `deployment-owner-acceptance-pending:${name}`);
    result.push({ name, boundary: "checked-in-source-only", sources: [...paths], environment, valueSources,
      unreviewedFamilies: distinctFamilies, ownerAcceptance: "pending", renderedOrDeployedEnvironment: "unavailable" });
  }
  return { profiles: result, sourceManifest: sourceManifest.sort((a, b) => a.path.localeCompare(b.path)),
    errors: [...new Set(errors)], gaps: [...new Set(gaps)] };
}
