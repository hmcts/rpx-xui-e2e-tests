// Test-only coordination for fixed provider ports. No stale ownership recovery.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { setTimeout: delay } = require("node:timers/promises");
const failure = "SELF_CHECK_FIXED_PORT_LOCK";
const portSets = { provider: [3101], routing: [3100, 3101, 3102, 3103, 3104] };
function directoryStat(directory) {
  assert(
    typeof directory === "string" &&
      path.isAbsolute(directory) &&
      path.resolve(directory) === directory,
    failure,
  );
  const stat = fs.lstatSync(directory);
  assert(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      fs.realpathSync(directory) === directory &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o700,
    failure,
  );
  return stat;
}
function tokenStat(file) {
  const stat = fs.lstatSync(file);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o600 &&
      stat.size <= 256,
    failure,
  );
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(failure);
  }
  assert(
    Object.keys(data).sort().join() === "nonce,pid" &&
      /^[a-f0-9-]{36}$/.test(data.nonce) &&
      Number.isSafeInteger(data.pid) &&
      data.pid > 0,
    failure,
  );
  return { stat, data };
}
function vacant(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (absent) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      absent ? resolve() : reject(new Error(failure));
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.once("error", (error) => finish(error.code === "ECONNREFUSED"));
  });
}
exports.acquireFixedPortLock = async function acquireFixedPortLock({
  directory,
  scope = "provider",
  timeoutMs = 60 * 1000,
  signal,
} = {}) {
  assert(
    Object.hasOwn(portSets, scope) &&
      Number.isSafeInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 60 * 1000,
    failure,
  );
  const root = directoryStat(directory),
    file = path.join(directory, "fixed-ports.lock");
  const started = performance.now();
  const sameRoot = () => {
    const current = directoryStat(directory);
    assert(current.dev === root.dev && current.ino === root.ino, failure);
  };
  let owned;
  while (!owned) {
    assert(
      !signal?.aborted && performance.now() - started < timeoutMs,
      failure,
    );
    sameRoot();
    let fd;
    try {
      fd = fs.openSync(file, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw new Error(failure);
      // A peer may release between EEXIST and inspection. Retry only absence.
      try {
        const stat = fs.lstatSync(file);
        assert(
          stat.isFile() &&
            !stat.isSymbolicLink() &&
            stat.nlink === 1 &&
            stat.uid === process.getuid() &&
            (stat.mode & 0o777) === 0o600,
          failure,
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw new Error(failure);
      }
      try {
        await delay(10, undefined, { signal });
      } catch {
        throw new Error(failure);
      }
      continue;
    }
    try {
      const data = { nonce: randomUUID(), pid: process.pid };
      fs.writeFileSync(fd, JSON.stringify(data) + "\n");
      owned = { stat: fs.fstatSync(fd), data };
    } finally {
      fs.closeSync(fd);
    }
  }
  let released = false;
  const verify = () => {
    sameRoot();
    const current = tokenStat(file);
    assert(
      !released &&
        !signal?.aborted &&
        current.stat.dev === owned.stat.dev &&
        current.stat.ino === owned.stat.ino &&
        current.data.nonce === owned.data.nonce &&
        current.data.pid === owned.data.pid,
      failure,
    );
  };
  return {
    async release() {
      verify();
      const observations = await Promise.allSettled(
        portSets[scope].map(vacant),
      );
      assert(
        observations.every((value) => value.status === "fulfilled"),
        failure,
      );
      verify();
      fs.unlinkSync(file);
      released = true;
    },
  };
};
exports.installFixedPortHooks = function installFixedPortHooks(
  scope = "provider",
) {
  assert(Object.hasOwn(portSets, scope), failure);
  const directory = process.env.HARNESS_SELF_CHECK_FIXED_PORT_LOCK;
  if (directory === undefined) return; // Legacy direct, sequential file invocation.
  const { before, after } = require("node:test");
  let lease;
  before(async () => {
    lease = await exports.acquireFixedPortLock({ directory, scope });
  });
  after(async () => {
    if (lease) await lease.release();
  });
};
