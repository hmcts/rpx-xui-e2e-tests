import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const mutation = process.env.EXUI_ASSURANCE_MUTATION || "drop-ccd-case-reference-search-input";
const focusedSpec = "src/tests/api/exui-historic-replay-packs.api.ts";
const focusedGrep = "CCD search/workbasket metadata replay keeps service-owned definition changes inside the EXUI contract";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const reportOutput =
  process.env.PW_ODHIN_OUTPUT || "functional-output/tests/harness/ccd-mutation-proof/odhin-report";
const reportIndex = process.env.PW_ODHIN_INDEX || "harness-ccd-mutation-proof.html";
const prlDefinitionsRoot = path.resolve(
  process.env.PRL_CCD_DEFINITIONS_DIR ?? path.join(process.cwd(), "../prl-ccd-definitions")
);

const commonEnv = {
  ...process.env,
  COREPACK_HOME: process.env.COREPACK_HOME || "/private/tmp/corepack-cache",
  PW_UI_STORAGE: process.env.PW_UI_STORAGE || "0",
  TEST_ENV: process.env.TEST_ENV || "local",
  TEST_URL: process.env.TEST_URL || "http://localhost:3455"
};

if (!commonEnv.PW_CHROMIUM_PATH && fs.existsSync(chromePath)) {
  commonEnv.PW_CHROMIUM_PATH = chromePath;
}

function runPlaywright(label, env) {
  const args = [
    "test",
    "--project=api",
    focusedSpec,
    "--grep",
    focusedGrep,
    "--workers=4",
    "--timeout=90000",
    "--global-timeout=120000"
  ];

  console.log(`\n[harness-ccd-mutation] ${label}`);
  console.log(`[harness-ccd-mutation] ./node_modules/.bin/playwright ${args.join(" ")}`);

  return new Promise((resolve) => {
    const child = spawn("./node_modules/.bin/playwright", args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = `${label}\n`;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      output += String(error);
      resolve({ code: 1, output });
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function runManifest(label, env) {
  const args = ["harness:manifest"];

  console.log(`\n[harness-ccd-mutation] ${label}`);
  console.log(`[harness-ccd-mutation] yarn ${args.join(" ")}`);

  return new Promise((resolve) => {
    const child = spawn("yarn", args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = `${label}\n`;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      output += String(error);
      resolve({ code: 1, output });
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function copyPrlDefinitionsWithSearchInputMutation() {
  if (!fs.existsSync(prlDefinitionsRoot)) {
    throw new Error(
      `PRL CCD definitions source is not present at ${prlDefinitionsRoot}. Set PRL_CCD_DEFINITIONS_DIR before running the CCD source mutation proof.`
    );
  }

  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "exui-harness-prl-"));
  const tempRoot = path.join(tempParent, "prl-ccd-definitions");
  fs.cpSync(prlDefinitionsRoot, tempRoot, {
    recursive: true,
    filter: (source) => ![".git", "node_modules", "build"].includes(path.basename(source))
  });

  const searchInputPath = path.join(tempRoot, "definitions/private-law/json/SearchInputFields.json");
  const searchInputRows = JSON.parse(fs.readFileSync(searchInputPath, "utf8"));
  const mutatedRows = searchInputRows.filter(
    (row) => !(row.CaseTypeID === "PRLAPPS" && row.CaseFieldID === "[CASE_REFERENCE]")
  );

  if (mutatedRows.length === searchInputRows.length) {
    throw new Error("Could not find PRLAPPS [CASE_REFERENCE] in SearchInputFields.json to mutate.");
  }

  fs.writeFileSync(searchInputPath, `${JSON.stringify(mutatedRows, null, 2)}\n`);
  return { tempParent, tempRoot };
}

const sourceBaseline = await runManifest("Step 1/4: control source manifest with PRL CCD definitions intact", {
  ...commonEnv,
  HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE: "strict"
});

if (sourceBaseline.code !== 0) {
  console.error("\n[harness-ccd-mutation] Source manifest control run failed. Fix the PRL source baseline before demonstrating CCD-source drift detection.");
  process.exitCode = sourceBaseline.code;
  process.exit();
}

let tempParent;
let tempPrlRoot;
let sourceMutationFailure;
try {
  ({ tempParent, tempRoot: tempPrlRoot } = copyPrlDefinitionsWithSearchInputMutation());
  const sourceMutation = await runManifest("Step 2/4: mutate PRL SearchInputFields source and expect manifest to fail", {
    ...commonEnv,
    HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE: "strict",
    PRL_CCD_DEFINITIONS_DIR: tempPrlRoot
  });

  if (sourceMutation.code === 0) {
    sourceMutationFailure = [
      "\n[harness-ccd-mutation] Source mutation was not caught by the manifest.",
      "[harness-ccd-mutation] The PRL CCD metadata source check is not asserting the dropped search field."
    ];
  } else {
    const expectedManifestEvidence = "PRL SearchInputFields is missing CCD field [CASE_REFERENCE]";
    if (!sourceMutation.output.includes(expectedManifestEvidence)) {
      sourceMutationFailure = [
        "\n[harness-ccd-mutation] Source mutation failed the manifest, but not with the expected evidence.",
        `[harness-ccd-mutation] Missing output: ${expectedManifestEvidence}`
      ];
    }
  }
} finally {
  if (tempParent) {
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
}

if (sourceMutationFailure) {
  for (const line of sourceMutationFailure) {
    console.error(line);
  }
  process.exitCode = 1;
  process.exit();
}

const baseline = await runPlaywright("Step 3/4: control replay run with CCD definition metadata intact", {
  ...commonEnv,
  EXUI_ASSURANCE_MUTATION: "",
  PLAYWRIGHT_REPORTERS: "list"
});

if (baseline.code !== 0) {
  console.error("\n[harness-ccd-mutation] Control run failed. Fix the CCD metadata baseline before demonstrating mutation detection.");
  process.exitCode = baseline.code;
  process.exit();
}

const mutated = await runPlaywright(`Step 4/4: inject ${mutation} and expect the assurance gate to fail`, {
  ...commonEnv,
  EXUI_ASSURANCE_MUTATION: mutation,
  PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS || "list,odhin",
  PLAYWRIGHT_REPORT_FOLDER: reportOutput,
  PLAYWRIGHT_REPORT_PROJECT: "EXUI CCD Definition Mutation Proof",
  PW_ODHIN_API_LOGS: process.env.PW_ODHIN_API_LOGS || "summary",
  PW_ODHIN_CONSOLE_TEST_OUTPUT: process.env.PW_ODHIN_CONSOLE_TEST_OUTPUT || "all",
  PW_ODHIN_ENV: process.env.PW_ODHIN_ENV || "local-ccd",
  PW_ODHIN_INDEX: reportIndex,
  PW_ODHIN_LIGHTWEIGHT: process.env.PW_ODHIN_LIGHTWEIGHT || "false",
  PW_ODHIN_OUTPUT: reportOutput,
  PW_ODHIN_PROJECT: "EXUI CCD Definition Mutation Proof",
  PW_ODHIN_RELEASE: process.env.PW_ODHIN_RELEASE || "master",
  PW_ODHIN_TEST_FOLDER: "src/tests/api",
  PW_ODHIN_TITLE: "EXUI CCD Definition Mutation Proof"
});

if (mutated.code === 0) {
  console.error("\n[harness-ccd-mutation] Mutation was not caught.");
  console.error("[harness-ccd-mutation] The CCD metadata contract is not asserting the dropped search field.");
  process.exitCode = 1;
  process.exit();
}

const expectedEvidence = [
  "drop-ccd-case-reference-search-input",
  "CCD search metadata is missing required EXUI search input fields: [CASE_REFERENCE]"
];
const missingEvidence = expectedEvidence.filter((needle) => !mutated.output.includes(needle));

if (missingEvidence.length) {
  console.error("\n[harness-ccd-mutation] The mutation failed the suite, but not with the expected evidence.");
  console.error(`[harness-ccd-mutation] Missing output: ${missingEvidence.join(", ")}`);
  process.exitCode = 1;
  process.exit();
}

console.log("\n[harness-ccd-mutation] Mutation proof passed.");
console.log(
  "[harness-ccd-mutation] The source manifest control was green, a temp-copy PRL CCD source mutation was caught, the replay control was green, and the injected replay regression produced the expected Odhín failure evidence."
);
console.log(`[harness-ccd-mutation] Odhín failure report: ${path.join(reportOutput, reportIndex)}`);
