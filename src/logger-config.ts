import { createLogger, format, transports } from "winston";

export function getLogger(serviceName = "rpx-xui-e2e"): ReturnType<typeof createLogger> {
  const isCi = process.env.CI === "true" || process.env.CI === "1";
  const logLevel = process.env.LOG_LEVEL ?? "info";

  return createLogger({
    level: logLevel,
    defaultMeta: { service: serviceName },
    format: isCi
      ? format.json()
      : format.combine(
          format.colorize(),
          format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          format.printf(({ level, message, timestamp, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
            return `[${timestamp}] ${level}: ${message}${metaString}`;
          })
        ),
    transports: [new transports.Console()]
  });
}
