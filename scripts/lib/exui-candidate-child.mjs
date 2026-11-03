import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { installCancellationCleanup } from "./exui-oci-runtime.mjs";
import { terminateOwnedChild } from "./exui-candidate-runtime.mjs";
import { writeJsonAtomic, writePublicSummary } from "./exui-evidence-io.mjs";

// The launcher waits for this exact Docker client; a cancelled parent must not orphan a late create.
export async function runOwnedDocker(
  args,
  {
    output,
    owner,
    launch = (values) =>
      spawn("docker", values, {
        env: { PATH: process.env.PATH },
        stdio: "inherit",
      }),
    signalTarget = process,
  },
) {
  let child,
    cancelled = false;
  const resources = new Map();
  const record = (terminal) =>
    writeJsonAtomic(path.join(output, "docker-client-shutdown.json"), {
      owner,
      ...terminal,
    });
  const uninstall = installCancellationCleanup({
    resources,
    target: signalTarget,
    onCancel: (signal) => {
      cancelled = true;
      writePublicSummary(
        path.join(output, "public/release-assurance-summary.json"),
        { status: "BLOCKED", exitCode: 2 },
      );
      writeJsonAtomic(path.join(output, "controller-cancelled.json"), {
        owner,
        signal,
      });
      if (!child) record({ started: false, observed: true, forced: false });
    },
    remove: async () => {
      const terminal = await terminateOwnedChild(child);
      record(terminal);
      assert(!terminal.forced, "DOCKER_CLIENT_FORCED_TERMINATION_UNCERTAIN");
    },
  });
  try {
    child = launch(args);
    resources.set(owner, child);
    const terminal = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (!cancelled)
      record({ started: true, observed: true, forced: false, ...terminal });
    assert(!cancelled, "DOCKER_CLIENT_CANCELLED");
    return terminal;
  } finally {
    uninstall();
    resources.delete(owner);
  }
}
