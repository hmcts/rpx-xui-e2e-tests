import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIResponse, Page } from "@playwright/test";

export interface RoutingJournalEntry {
  port: number;
  method: string;
  path: string;
  query: string[][];
  body: unknown;
}
export function verifyRoutingAsset(
  assetRoot: string,
  pathname: string,
  bytes: Uint8Array,
) {
  const root = fs.realpathSync(assetRoot),
    file = path.resolve(root, `.${pathname}`);
  assert(
    file.startsWith(`${root}${path.sep}`) &&
      fs.realpathSync(file).startsWith(`${root}${path.sep}`),
    "ROUTING_ASSET_PATH_ESCAPE",
  );
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  assert.equal(
    digest,
    `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`,
    "ROUTING_SERVED_ASSET_MISMATCH",
  );
  return { path: pathname, digest };
}
export const routingJournal = (): RoutingJournalEntry[] => {
  const file = `${process.env.EXUI_ROUTING_EVIDENCE}/routing-destinations.jsonl`;
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
};
export const routingSessions = (): Record<
  "primary" | "fresh",
  { id: string; cookie: string }
> => JSON.parse(fs.readFileSync(process.env.EXUI_ROUTING_SESSIONS!, "utf8"));
export const signedSessionHeader = (cookie: string) => ({
  Cookie: `xui-webapp=${encodeURIComponent(cookie)}`,
});
export function csrfToken(response: APIResponse): string {
  for (const header of response.headersArray()) {
    if (header.name.toLowerCase() !== "set-cookie") continue;
    const value = header.value.match(/(?:^|,\s*)XSRF-TOKEN=([^;,\s]+)/)?.[1];
    if (value) return decodeURIComponent(value);
  }
  throw new Error("ACTUAL_CANDIDATE_CSRF_TOKEN_REQUIRED");
}
export async function selectRoutingEvent(
  page: Page,
  caseType: string,
  eventId: string,
) {
  await page.goto("/cases/case-filter");
  await page.getByLabel("Jurisdiction", { exact: true }).selectOption("PCS");
  await page.getByLabel("Case type", { exact: true }).selectOption(caseType);
  await page.getByLabel("Event", { exact: true }).selectOption(eventId);
}
// Wait for either declared product outcome, so an omission is measured as a destination mismatch, not a timeout.
export async function routingArrival(
  after: number,
  kind: "ui" | "noc",
): Promise<RoutingJournalEntry> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = routingJournal()
      .slice(after)
      .find((item) =>
        kind === "ui"
          ? item.port === 3103 ||
            (item.port === 3101 &&
              item.path.startsWith("/internal/case-types/"))
          : item.method === "POST" &&
            item.path.endsWith("/noc/verify-noc-answers"),
      );
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("DECLARED_ROUTING_OUTCOME_NOT_OBSERVED");
}
