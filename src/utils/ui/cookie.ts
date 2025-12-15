import fs from "node:fs";
import path from "node:path";
import type { Cookie } from "@playwright/test";
import { resolveConfig, type UserConfig } from "./config.js";

export class CookieUtils {
  private readonly domain: string;

  constructor() {
    const config = resolveConfig();
    this.domain = config.baseUrl.replace(/^https?:\/\//, "");
  }

  public writeManageCasesSession(sessionPath: string, cookies: Cookie[], user?: UserConfig): void {
    const dir = path.dirname(sessionPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
    const stateCookies = [...cookies];
    if (userId) {
      stateCookies.push({
        name: `hmcts-exui-cookies-${userId}-mc-accepted`,
        value: "true",
        domain: this.domain,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax"
      });
    }
    if (user?.cookieName) {
      stateCookies.push({
        name: user.cookieName,
        value: "true",
        domain: this.domain,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax"
      });
    }
    fs.writeFileSync(sessionPath, JSON.stringify({ cookies: stateCookies }, null, 2), "utf-8");
  }
}
