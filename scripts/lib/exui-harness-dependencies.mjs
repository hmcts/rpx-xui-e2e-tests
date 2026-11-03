import fs from "node:fs/promises";
import path from "node:path";
import { digestCandidateTree } from "./exui-candidate-artifact.mjs";

export async function verifyHarnessDependencies(
  dependenciesRoot,
  packagePath,
  lockPath,
  expectedDigest,
) {
  const manifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const version = manifest.devDependencies?.["@playwright/test"];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? ""))
    throw new Error("EXACT_HARNESS_PLAYWRIGHT_VERSION_REQUIRED");
  const lock = await fs.readFile(lockPath, "utf8");
  if (
    !lock.includes(
      `"@playwright/test@npm:${version}":\n  version: ${version}\n`,
    )
  )
    throw new Error("HARNESS_PLAYWRIGHT_LOCK_MISMATCH");
  for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
    const installed = JSON.parse(
      await fs.readFile(
        path.join(dependenciesRoot, name, "package.json"),
        "utf8",
      ),
    );
    if (installed.version !== version)
      throw new Error("HARNESS_PLAYWRIGHT_INSTALLED_MISMATCH");
  }
  const digest = await digestCandidateTree(dependenciesRoot);
  if (expectedDigest && digest !== expectedDigest)
    throw new Error("HARNESS_DEPENDENCY_BYTES_CHANGED");
  return { digest, playwrightVersion: version };
}
