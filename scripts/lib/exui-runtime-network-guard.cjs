// Stops undeclared candidate egress before contact; container networking is also disabled.
const fs = require("node:fs");
const net = require("node:net");
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = (
    Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args)
  )[0];
  if (
    !options.path &&
    (!["127.0.0.1", "localhost", "::1"].includes(options.host ?? "localhost") ||
      ![3100, 3101].includes(Number(options.port)))
  ) {
    fs.appendFileSync(
      process.env.EXUI_NETWORK_REJECTIONS,
      JSON.stringify({ code: "UNDECLARED_NODE_DESTINATION" }) + "\n",
    );
    throw new Error("UNDECLARED_NODE_DESTINATION");
  }
  return originalConnect.apply(this, args);
};
