/* global require, process */
const Reporter = require("./harness-public-odhin-reporter.cjs");

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--reset") {
    Reporter.resetPublicReport("harness");
  } else if (args.length === 1 && args[0] === "--validate") {
    Reporter.validatePublicReport("harness");
  } else if (
    args.length === 2 &&
    args[0] === "--validate" &&
    args[1] === "local-aat"
  ) {
    Reporter.validatePublicReport("local-aat");
  } else {
    throw new Error("INVALID_PUBLIC_REPORT_COMMAND");
  }
} catch {
  console.error(
    "[harness-report] Public Odhín report validation or reset failed.",
  );
  process.exitCode = 2;
}
