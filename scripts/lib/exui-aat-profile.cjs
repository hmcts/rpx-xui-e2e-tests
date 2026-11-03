const crypto = require("node:crypto");
const source = require("../fixtures/exui-aat-profile-source.json");
// Reviewed nonsecret projection of cnp-flux-config; no live source fetch or ambient overrides.
const projectionDigest =
  "5df20195b31b98b5f92d48eb7a1ea8bbb3b532cb8e6e315fd0253abae9cfd360";
const keys = {
  globalSearchServices: "GLOBAL_SEARCH_SERVICES",
  waSupportedJurisdictions: "WA_SUPPORTED_JURISDICTIONS",
  staffSupportedJurisdictions: "STAFF_SUPPORTED_JURISDICTIONS",
};
function readAatProfile() {
  if (
    crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex") !==
    projectionDigest
  )
    throw new Error("AAT_PROFILE_SOURCE_DRIFT");
  const families = Object.fromEntries(
    Object.entries(keys).map(([key, envKey]) => [
      key,
      source.environment[envKey].value.split(",").map((id) => id.trim()),
    ]),
  );
  return {
    source: {
      repository: source.repository,
      revision: source.revision,
      path: source.path,
      fileDigest: source.fileDigest,
      projectionDigest,
    },
    families,
  };
}
function compareAatFamilies(key, actual) {
  const expected = readAatProfile().families[key];
  if (
    !expected ||
    !Array.isArray(actual) ||
    actual.some((id) => typeof id !== "string")
  )
    throw new Error("AAT_PROFILE_FAMILY_ARRAY_REQUIRED");
  const normalized = actual.map((id) => id.trim().toUpperCase()).sort();
  const required = [...expected].sort();
  return { matches: JSON.stringify(normalized) === JSON.stringify(required) };
}
module.exports = { readAatProfile, compareAatFamilies };
