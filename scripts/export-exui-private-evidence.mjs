import {
  exportPrivateEvidence,
  verifyPrivateEvidence,
} from "./lib/exui-private-evidence.mjs";

try {
  const args = process.argv.slice(2);
  let result;
  if (
    args.length === 9 &&
    args[0] === "export" &&
    args[1] === "--phase" &&
    args[3] === "--expected" &&
    args[5] === "--terminal" &&
    args[7] === "--destination"
  )
    result = exportPrivateEvidence({
      phase: args[2],
      expected: args[4],
      terminal: args[6],
      destination: args[8],
    });
  else if (
    args.length === 7 &&
    args[0] === "verify" &&
    args[1] === "--bundle" &&
    args[3] === "--expected" &&
    args[5] === "--manifest-digest"
  )
    result = verifyPrivateEvidence({
      bundle: args[2],
      expected: args[4],
      manifestDigest: args[6],
    });
  else throw Error("PRIVATE_ARGUMENTS_REQUIRED");
  // Operation success is copy/verification integrity, never proof or release approval.
  console.log(JSON.stringify(result));
} catch {
  console.error("[private-evidence] BLOCKED");
  process.exitCode = 2;
}
