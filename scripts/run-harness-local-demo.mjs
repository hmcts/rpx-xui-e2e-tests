import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const webappRoot = path.join(workspaceRoot, "rpx-xui-webapp");
const exuiDist = path.join(webappRoot, "dist", "rpx-exui", "browser");
const args = new Set(process.argv.slice(2));
const startOnly = args.has("--start-only");
const keepRunning = startOnly || args.has("--keep-running");
const runProof = !startOnly && !args.has("--no-proof");
const corepackHome = process.env.COREPACK_HOME || "/private/tmp/corepack-cache";
const testUrl = process.env.TEST_URL || "http://localhost:3455";
const harnessWorkers = process.env.HARNESS_WORKERS || process.env.PLAYWRIGHT_WORKERS || "4";
const children = [];
const servers = [];
const useProcessGroups = process.platform !== "win32";
let cleanedUp = false;
let shuttingDown = false;

function log(message) {
  console.log(`[harness-demo] ${message}`);
}

function ensureDemoPrerequisites() {
  const indexHtml = path.join(exuiDist, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `EXUI Angular build is missing at ${indexHtml}. Build rpx-xui-webapp first, then rerun this command.`
    );
  }
}

function makeEnv(extra = {}) {
  return {
    ...process.env,
    COREPACK_HOME: corepackHome,
    HARNESS_WORKERS: harnessWorkers,
    TEST_ENV: process.env.TEST_ENV || "local",
    TEST_URL: testUrl,
    ...extra
  };
}

function prefixStream(label, stream) {
  if (process.env.HARNESS_DEMO_VERBOSE !== "1") {
    return;
  }

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      console.log(`[${label}] ${line}`);
    }
  });
}

function startChild(label, command, commandArgs, options) {
  log(`starting ${label}`);
  const child = spawn(command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    detached: useProcessGroups,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.demoLabel = label;
  child.demoExited = false;
  child.demoExitCode = undefined;
  child.once("exit", (code, signal) => {
    child.demoExited = true;
    child.demoExitCode = code ?? signal ?? "unknown";
  });
  child.once("error", (error) => {
    child.demoExited = true;
    child.demoExitCode = error.message;
  });
  prefixStream(label, child.stdout);
  prefixStream(label, child.stderr);
  children.push(child);
  return child;
}

async function isUrlReady(target, options = {}) {
  const acceptStatus = options.acceptStatus ?? ((status) => status < 500);

  try {
    const response = await fetch(target, { method: "GET" });
    return acceptStatus(response.status);
  } catch {
    return false;
  }
}

async function startChildUnlessReady(label, healthUrl, command, commandArgs, options) {
  if (await isUrlReady(healthUrl, options)) {
    log(`reusing ${label} at ${healthUrl}`);
    return undefined;
  }

  return startChild(label, command, commandArgs, options);
}

function signalChildTree(child, signal) {
  if (!child.pid) {
    return;
  }

  try {
    if (useProcessGroups) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to the direct child signal below.
  }

  try {
    child.kill(signal);
  } catch {
    // Child already exited.
  }
}

async function startSyntheticSeam(label, port) {
  const healthUrl = `http://localhost:${port}/health`;
  if (await isUrlReady(healthUrl)) {
    log(`reusing ${label} at ${healthUrl}`);
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "UP", seam: label }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ message: `${label} synthetic seam` }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not bind to port ${port}. Stop the conflicting process or expose ${healthUrl}. ${message}`);
  });

  servers.push(server);
  log(`starting ${label} on http://localhost:${port}`);
}

async function waitForUrl(label, target, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const acceptStatus = options.acceptStatus ?? ((status) => status < 500);
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    for (const child of children) {
      if (child.demoExited) {
        throw new Error(`${child.demoLabel} exited during startup (${child.demoExitCode}).`);
      }
    }

    try {
      const response = await fetch(target, { method: "GET" });
      if (acceptStatus(response.status)) {
        log(`${label}: ${response.status}`);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} is not reachable at ${target}: ${detail}`);
}

function runCommand(label, command, commandArgs, env) {
  log(label);
  log(`${command} ${commandArgs.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with ${code}`));
    });
  });
}

async function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;

  for (const server of servers.reverse()) {
    await new Promise((resolve) => server.close(resolve));
  }

  for (const child of children.reverse()) {
    signalChildTree(child, "SIGINT");
  }

  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.demoExited) {
            resolve();
            return;
          }

          const forceKill = setTimeout(() => {
            signalChildTree(child, "SIGKILL");
          }, 3_000);
          child.once("exit", () => {
            clearTimeout(forceKill);
            resolve();
          });
        })
    )
  );

  for (const child of children) {
    child.stdout?.destroy();
    child.stderr?.destroy();
  }
}

async function shutdownFromSignal(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log(`received ${signal}; stopping local demo stack`);
  await cleanup();
  process.exit(signal === "SIGINT" ? 130 : 143);
}

async function keepAlive() {
  log(`EXUI shell: ${testUrl}`);
  log("Press Ctrl+C to stop the local demo stack.");
  await new Promise((resolve) => {
    const heartbeat = setInterval(() => undefined, 60_000);
    const stop = () => {
      clearInterval(heartbeat);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main() {
  ensureDemoPrerequisites();
  log(`repo=${repoRoot}`);
  log(`webapp=${webappRoot}`);
  log(`TEST_URL=${testUrl}`);
  log(`HARNESS_WORKERS=${harnessWorkers}`);

  await startSyntheticSeam("role-assignment shim", 4096);
  await startSyntheticSeam("synthetic SRT shim", 8091);
  await startChildUnlessReady("EXUI backend mock", "http://localhost:8080/health", "yarn", ["test:backendMock"], {
    cwd: webappRoot,
    env: makeEnv()
  });
  await startChildUnlessReady("EXUI Node API", "http://localhost:3001/health", "yarn", ["start:node"], {
    cwd: webappRoot,
    env: makeEnv({
      ALLOW_CONFIG_MUTATIONS: "1",
      NODE_CONFIG_ENV: "local-mock",
      SERVICES_EM_DOCASSEMBLY_API: "http://localhost:8080",
      SERVICES_IDAM_API_URL: "http://localhost:8080",
      SERVICES_IDAM_ISS_URL: "http://localhost:8080",
      SERVICES_IDAM_LOGIN_URL: "http://localhost:8080",
      SERVICES_IDAM_OAUTH_CALLBACK_URL: "/oauth2/callback"
    })
  });
  await startChildUnlessReady(
    "EXUI static shell",
    `${testUrl.replace(/\/+$/, "")}/work/my-work/available`,
    "yarn",
    ["harness:local:shell"],
    {
      cwd: repoRoot,
      env: makeEnv()
    }
  );

  await waitForUrl("EXUI backend mock", "http://localhost:8080/health");
  await waitForUrl("EXUI API", "http://localhost:3001/health", {
    acceptStatus: (status) => status === 200
  });
  await waitForUrl("EXUI shell", `${testUrl.replace(/\/+$/, "")}/work/my-work/available`, {
    acceptStatus: (status) => status === 200
  });
  await waitForUrl("Synthetic SRT shim", "http://localhost:8091/health");
  await waitForUrl("Role assignment shim", "http://localhost:4096/health");

  if (runProof) {
    await runCommand("running local Assurance Harness Odhín proof", "yarn", ["harness:local:odhin"], makeEnv());
    log("Odhín report: test-results/harness-poc-odhin-report/harness-poc-odhin.html");
    log("Mutation proof command: COREPACK_HOME=/private/tmp/corepack-cache yarn harness:mutation:wa");
  }

  if (keepRunning) {
    await keepAlive();
  }
}

try {
  process.once("SIGINT", () => {
    void shutdownFromSignal("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdownFromSignal("SIGTERM");
  });

  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[harness-demo] ${message}`);
  process.exitCode = 1;
} finally {
  if (!keepRunning || process.exitCode) {
    await cleanup();
  }
}
