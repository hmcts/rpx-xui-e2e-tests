import * as fs from "node:fs";

import type { Cookie } from "@playwright/test";

import { config } from "./config.utils.js";

type FileSystem = Pick<
  typeof fs,
  "readFileSync" | "writeFileSync" | "existsSync" | "mkdirSync"
>;

export class CookieUtils {
  private readonly fs: FileSystem;

  public constructor(fsImpl: FileSystem = fs) {
    this.fs = fsImpl;
  }

  public async addManageCasesAnalyticsCookie(
    sessionPath: string,
  ): Promise<void> {
    try {
      const domain = config.urls.exuiDefaultUrl.replace("https://", "");
      const state = JSON.parse(this.fs.readFileSync(sessionPath, "utf-8")) as {
        cookies?: Cookie[];
      };
      const cookies = Array.isArray(state.cookies) ? state.cookies : [];
      const userId = cookies.find(
        (cookie) => cookie.name === "__userid__",
      )?.value;
      if (!userId) {
        state.cookies = cookies;
        this.fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
        return;
      }
      cookies.push({
        name: `hmcts-exui-cookies-${userId}-mc-accepted`,
        value: "true",
        domain,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      });
      state.cookies = cookies;
      this.fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
    } catch (error) {
      throw new Error(
        `Failed to read or write session data: ${error instanceof Error ? error.message : JSON.stringify(error ?? "")}`,
        { cause: error },
      );
    }
  }

  public writeManageCasesSession(sessionPath: string, cookies: Cookie[]): void {
    try {
      const dir = sessionPath.substring(0, sessionPath.lastIndexOf("/"));
      if (dir && !this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }
      const domain = config.urls.exuiDefaultUrl.replace("https://", "");
      const userId = cookies.find(
        (cookie) => cookie.name === "__userid__",
      )?.value;
      if (userId) {
        cookies.push({
          name: `hmcts-exui-cookies-${userId}-mc-accepted`,
          value: "true",
          domain,
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        });
      }
      const state = { cookies };
      this.fs.writeFileSync(
        sessionPath,
        JSON.stringify(state, null, 2),
        "utf-8",
      );
    } catch (error) {
      throw new Error(
        `Failed to write session file: ${error instanceof Error ? error.message : JSON.stringify(error ?? "")}`,
        { cause: error },
      );
    }
  }
}
