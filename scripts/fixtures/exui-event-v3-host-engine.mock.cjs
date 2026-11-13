// Unchanged fake-system setup copied from the existing host-invocation test; no real runtime.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const image = "sha256:" + "a".repeat(64);
function fixture(fault) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "host-engine-test-"));
  const directory = path.join(output, "baseline");
  fs.mkdirSync(directory);
  const diagnostics = path.join(output, "diagnostics");
  fs.mkdirSync(diagnostics);
  const owner = "candidate-11111111-1111-4111-8111-111111111111";
  const containers = new Map(),
    calls = [],
    resources = new Map();
  let next = 0;
  const lookup = (key) =>
    [...containers.values()].find(
      (x) => x.Id === key || x.Name === "/" + key,
    ) ?? null;
  const inspect = (key) => {
    const value = lookup(key);
    return value ? structuredClone(value) : null;
  };
  const write = (name, value) =>
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
  const mounts = (service) => [
    {
      source: "/" + service,
      target: service === "candidate" ? "/candidate" : "/harness",
      writable: false,
    },
  ];
  const docker = (args) => {
    calls.push(args);
    const [op, id] = args;
    if (op === "create") {
      const name = args[args.indexOf("--name") + 1];
      const service = name.endsWith("-tools")
        ? "browser-provider"
        : "candidate";
      const namespace =
        service === "candidate" ? [...containers.values()][0].Id : null;
      const info = {
        Id: String(++next).repeat(64),
        Name: "/" + name,
        Image: image,
        Config: {
          Labels: {
            "exui.harness.owner": owner,
            "exui.harness.service": service,
          },
        },
        HostConfig: {
          NetworkMode: namespace ? "container:" + namespace : "none",
          ReadonlyRootfs: true,
          Init: true,
          Privileged: false,
          PidMode: "",
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges"],
          PidsLimit: 256,
          Memory: 4294967296,
          NanoCpus: 2000000000,
          PortBindings: {},
        },
        Mounts: mounts(service).map((m) => ({
          Type: "bind",
          Source: m.source,
          Destination: m.target,
          RW: m.writable,
        })),
        State: {
          Running: false,
          OOMKilled: false,
          ExitCode: 0,
          Error: "",
          StartedAt: "fixed",
        },
        RestartCount: 0,
      };
      containers.set(info.Id, info);
      if (fault === "create-timeout" && service === "candidate")
        throw Error("create interrupted after daemon success");
      return info.Id;
    }
    const info = lookup(id);
    if (op === "start") {
      info.State.Running = true;
      if (
        fault !== "startup-cancel" &&
        info.Config.Labels["exui.harness.service"] === "browser-provider"
      )
        write("provider-ready.json", {});
      return "";
    }
    if (op === "logs") return "diagnostic-only";
    if (op === "rm") {
      const cid = args.at(-1);
      if (fault === "cleanup-failure") throw Error("remove failed");
      containers.delete(cid);
      return "";
    }
    if (op === "kill") {
      const target = lookup(args.at(-1));
      target.State.Running = false;
      const isCandidate =
        target.Config.Labels["exui.harness.service"] === "candidate";
      target.State.ExitCode = isCandidate ? 143 : 0;
      if (!isCandidate) write("provider-stopped.json", { closed: true });
      return "";
    }
    if (op === "wait") return String(info.State.ExitCode);
    if (op === "exec") {
      const script = args.at(-1);
      if (script.includes("net.connect")) return "[false,false]";
      if (script.includes("osRelease"))
        return JSON.stringify({
          nodeVersion: "v24.22.2",
          platform: "linux",
          architecture: "arm64",
          osRelease: "ID=debian\nVERSION_CODENAME=bookworm\n",
        });
      if (script.includes("controllerSourceVisible"))
        return JSON.stringify({
          attempts: [
            {
              path: "/output/report.json",
              denied: fault !== "write-capability",
            },
            { path: "/harness/controller.mjs", denied: true },
          ],
          controllerSourceVisible: false,
        });
      if (script.includes("container-cgroup-v2"))
        return JSON.stringify({ peakMemoryBytes: 1 });
      return "";
    }
    throw Error("unexpected fake operation " + op);
  };
  const spec = {
    kind: "native",
    output,
    directory,
    owner,
    invocationId: "baseline",
    platform: "linux/arm64",
    diagnostics,
    manifest: { identity: {}, runtimeMetadata: {} },
    payloadDigest: image,
    tools: { image, mounts: mounts("browser-provider"), args: ["create"] },
    candidate: {
      image,
      node: "/candidate/runtime/node",
      expectedNodeVersion: "v24.22.2",
      mounts: mounts("candidate"),
      arguments: () => ["create"],
    },
    proofArguments: [],
  };
  const runProof = async () => {
    if (fault === "proof-client-error") throw Error("known proof child failed");
    const candidate = [...containers.values()].find(
      (x) => x.Config.Labels["exui.harness.service"] === "candidate",
    );
    if (fault === "premature-exit") candidate.State.Running = false;
    if (fault === "wrong-mount") candidate.Mounts[0].RW = true;
    if (fault === "wrong-namespace") candidate.HostConfig.NetworkMode = "host";
    if (["unhandled-provider.jsonl", "gateway-errors.jsonl"].includes(fault))
      write(fault, { code: "gateway-diagnostic" });
    write("framework-terminal.json", { code: 0, signal: null });
    return { code: 0, signal: null };
  };
  return {
    spec,
    resources,
    docker,
    inspect,
    runProof,
    calls,
    write,
    containers,
    dispose: () => fs.rmSync(output, { recursive: true, force: true }),
  };
}

exports.hostEngineFixture = fixture;
