#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  readConfigurationSources,
  buildConfigurationCatalogue,
  validateConfigurationCatalogue,
  selectConfigurationObligations,
} from "./lib/exui-configuration-catalogue.mjs";
import { writeJsonAtomic, digestBytes } from "./lib/exui-evidence-io.mjs";
import { createPrivateSourceDiagnosticOutput } from "./lib/exui-output-boundary.mjs";
import { validateDefinitionDiscovery } from "./lib/exui-definition-discovery.mjs";

try {
  const { values } = parseArgs({
    options: {
      webapp: { type: "string" },
      definitions: { type: "string" },
      output: { type: "string" },
      changes: { type: "string" },
    },
  });
  if (!values.webapp || !values.definitions || !values.output)
    throw new Error("EXPLICIT_SOURCE_AND_OUTPUT_PATHS_REQUIRED");
  const reviewFile = fileURLToPath(
    new URL("./fixtures/exui-configuration-review.json", import.meta.url),
  );
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  const harnessRoot = fs.realpathSync(
    fileURLToPath(new URL("..", import.meta.url)),
  );
  const webappRoot = path.resolve(values.webapp),
    definitionsRoot = path.resolve(values.definitions);
  const output = createPrivateSourceDiagnosticOutput(
    path.resolve(values.output),
    harnessRoot,
    [
      webappRoot,
      definitionsRoot,
      harnessRoot,
      reviewFile,
      ...(values.changes ? [path.resolve(values.changes)] : []),
    ],
  );
  const snapshot = readConfigurationSources({
    webappRoot,
    definitionsRoot,
    review,
  });
  const catalogue = buildConfigurationCatalogue(snapshot, review);
  const changedPaths = values.changes
    ? JSON.parse(fs.readFileSync(path.resolve(values.changes), "utf8"))
    : [];
  const selection = selectConfigurationObligations(catalogue, changedPaths, {
    snapshot,
    review,
  });
  const report = validateConfigurationCatalogue({
    snapshot,
    review,
    catalogue,
    selectedIds: selection.obligationIds,
  });
  const discovery = snapshot.definitionDiscovery;
  const discoveryValidation = validateDefinitionDiscovery({
    discovery,
    review,
  });
  const inventoryFile = path.join(output, "definition-file-inventory.json");
  const graphFile = path.join(output, "definition-reference-graph.json");
  writeJsonAtomic(inventoryFile, discoveryValidation.inventory);
  writeJsonAtomic(graphFile, discoveryValidation.graph);
  report.definitionDiscoveryArtifacts = {
    inventory: {
      file: path.basename(inventoryFile),
      digest: digestBytes(fs.readFileSync(inventoryFile)),
    },
    graph: {
      file: path.basename(graphFile),
      digest: digestBytes(fs.readFileSync(graphFile)),
    },
  };
  report.errors = [
    ...new Set([...report.errors, ...discoveryValidation.errors]),
  ];
  writeJsonAtomic(path.join(output, "catalogue.json"), catalogue);
  writeJsonAtomic(path.join(output, "selection.json"), selection);
  writeJsonAtomic(path.join(output, "source-validation.json"), report);
  console.log(
    JSON.stringify({
      kind: "configuration-source-diagnostic",
      releaseCredit: false,
      errors: report.errors.length,
      requiredObligations: report.denominator.requiredObligations,
      selected: report.coverage.selected,
      runtimeGaps: report.coverage.missingCandidateOrCcd.length,
    }),
  );
  process.exitCode = report.errors.length ? 2 : 0;
} catch {
  console.error(
    "BLOCKED: configuration source validation could not complete. Check explicit source paths and supported configuration formats.",
  );
  process.exitCode = 2;
}
