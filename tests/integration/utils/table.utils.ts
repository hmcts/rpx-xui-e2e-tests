import { Locator } from "@playwright/test";

/**
 * Reads a task table including header buttons and cell text.
 * Ignores rows marked aria-hidden.
 */
export async function readTaskTable(tableLocator: Locator): Promise<Array<Record<string, string>>> {
  const headerLocators = await tableLocator.locator("thead th").elementHandles();
  const headers: string[] = [];
  for (const th of headerLocators) {
    const button = await th.$("button");
    if (button) {
      headers.push((await button.textContent())?.trim() || "");
    } else {
      headers.push((await th.textContent())?.trim() || "");
    }
  }

  const rowLocators = tableLocator.locator("tbody tr");
  const rowCount = await rowLocators.count();
  const tableData: Array<Record<string, string>> = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rowLocators.nth(i);
    if ((await row.getAttribute("aria-hidden")) === "true") continue;
    const cellLocators = await row.locator("td").elementHandles();
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j].toLowerCase() === "case name") {
        const link = await cellLocators[j]?.$("a");
        rowObj[headers[j]] = (await link?.textContent())?.trim() || (await cellLocators[j]?.textContent())?.trim() || "";
      } else {
        rowObj[headers[j]] = (await cellLocators[j]?.textContent())?.trim() || "";
      }
    }
    tableData.push(rowObj);
  }
  return tableData;
}

/**
 * Formats an ISO date string to 'D MMMM YYYY' (e.g., '1 February 2024').
 */
export function formatUiDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "long" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
