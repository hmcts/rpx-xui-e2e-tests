const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const helper = path.join(__dirname, "lib/exui-aat-profile.cjs");
function api() {
  assert.ok(fs.existsSync(helper), "reviewed AAT profile oracle must exist");
  return require(helper);
}
test("AAT declared8/8/12 differ from default9/7/12 without changing the model defaults", () => {
  const { readAatProfile, compareAatFamilies } = api();
  const profile = readAatProfile();
  assert.equal(profile.families.globalSearchServices.length, 8);
  assert.equal(profile.families.waSupportedJurisdictions.length, 8);
  assert.equal(profile.families.staffSupportedJurisdictions.length, 12);
  assert.ok(profile.families.globalSearchServices.includes("SSCS"));
  assert.ok(!profile.families.globalSearchServices.includes("DIVORCE"));
  assert.ok(!profile.families.globalSearchServices.includes("PROBATE"));
  const defaults = require("../src/data/exui-central-assurance-source.json")
    .rpxXuiWebapp["config/default.json"];
  assert.equal(defaults.globalSearchServices.length, 9);
  assert.equal(defaults.waSupportedJurisdictions.length, 7);
  assert.equal(
    compareAatFamilies(
      "globalSearchServices",
      profile.families.globalSearchServices.map((v) => v.toLowerCase()),
    ).matches,
    true,
  );
  assert.equal(
    compareAatFamilies("globalSearchServices", defaults.globalSearchServices)
      .matches,
    false,
  );
});
test("exact AAT membership rejects missingSSCS,extra and duplicate families", () => {
  const { readAatProfile, compareAatFamilies } = api();
  const p = readAatProfile();
  for (const key of [
    "globalSearchServices",
    "waSupportedJurisdictions",
    "staffSupportedJurisdictions",
  ]) {
    const expected = p.families[key];
    assert.equal(compareAatFamilies(key, expected).matches, true);
    assert.equal(
      compareAatFamilies(
        key,
        expected.filter((id) => id !== "SSCS"),
      ).matches,
      false,
    );
    assert.equal(
      compareAatFamilies(key, [...expected, "UNKNOWN"]).matches,
      false,
    );
    assert.equal(
      compareAatFamilies(key, [...expected, expected[0]]).matches,
      false,
    );
  }
});
test("source revision/pin/projection/key drift never becomes a different accepted oracle", () => {
  const { readAatProfile } = api();
  const source = require("./fixtures/exui-aat-profile-source.json");
  for (const change of [
    (s) => (s.revision = "0".repeat(40)),
    (s) => (s.fileDigest = "0".repeat(64)),
    (s) => (s.environment.WA_SUPPORTED_JURISDICTIONS.value = "IA"),
    (s) => (s.environment.UNKNOWN = { present: true, value: "SECRET" }),
    (s) => delete s.environment.STAFF_SUPPORTED_JURISDICTIONS,
  ]) {
    const original = JSON.stringify(source);
    try {
      change(source);
      assert.throws(() => readAatProfile(), /AAT_PROFILE_SOURCE_DRIFT/);
    } finally {
      for (const k of Object.keys(source)) delete source[k];
      Object.assign(source, JSON.parse(original));
    }
  }
});
