// Stops undeclared candidate egress before contact; container networking is also disabled.
const fs = require("node:fs");
const net = require("node:net");
const originalConnect = net.Socket.prototype.connect;
// The complete synthetic profile must not merge omitted URLs back from production defaults.
if (process.env.EXUI_HARNESS_SCOPE === "exui-decentralised-routing-pilot") {
  if (
    process.env.NODE_CONFIG_DIR !== "/tmp/exui-routing-config" ||
    process.env.EXUI_ROUTING_CONFIGURATION_MODE !==
      "complete-node-config-empty-private-directory"
  )
    throw new Error("ROUTING_PRIVATE_CONFIGURATION_MODE_REQUIRED");
  const directory = "/tmp/exui-routing-config";
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const state = fs.lstatSync(directory);
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    (state.mode & 0o7777) !== 0o700 ||
    state.uid !== process.getuid() ||
    fs.realpathSync(directory) !== directory ||
    fs.readdirSync(directory).length !== 0
  )
    throw new Error("ROUTING_PRIVATE_CONFIGURATION_DIRECTORY_UNSAFE");
}
const approvedPorts =
  process.env.EXUI_HARNESS_SCOPE === "exui-decentralised-routing-pilot"
    ? [3100, 3101, 3102]
    : [3100, 3101];
net.Socket.prototype.connect = function (...args) {
  const options = (
    Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args)
  )[0];
  if (
    !options.path &&
    (!["127.0.0.1", "localhost", "::1"].includes(options.host ?? "localhost") ||
      !approvedPorts.includes(Number(options.port)))
  ) {
    fs.appendFileSync(
      process.env.EXUI_NETWORK_REJECTIONS,
      JSON.stringify({ code: "UNDECLARED_NODE_DESTINATION" }) + "\n",
    );
    throw new Error("UNDECLARED_NODE_DESTINATION");
  }
  return originalConnect.apply(this, args);
};
