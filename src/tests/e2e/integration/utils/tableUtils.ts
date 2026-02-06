import type { Locator } from "@playwright/test";

export async function readTaskTable(
  tableLocator: Locator,
): Promise<Array<Record<string, string>>> {
  const headerLocators = await tableLocator
    .locator("thead th")
    .elementHandles();
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
    const ariaHidden = await row.getAttribute("aria-hidden");
    if (ariaHidden === "true") continue;
    const cellLocators = await row.locator("td").elementHandles();
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j].toLowerCase() === "case name") {
        const aTag = await cellLocators[j]?.$("a");
        if (aTag) {
          rowObj[headers[j]] = (await aTag.textContent())?.trim() || "";
        } else {
          rowObj[headers[j]] =
            (await cellLocators[j]?.textContent())?.trim() || "";
        }
      } else {
        rowObj[headers[j]] =
          (await cellLocators[j]?.textContent())?.trim() || "";
      }
    }
    tableData.push(rowObj);
  }
  return tableData;
}

export function getTableHeaderButtons(tableLocator: Locator): Locator {
  return tableLocator.locator("thead th button");
}

export function formatUiDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "long" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
