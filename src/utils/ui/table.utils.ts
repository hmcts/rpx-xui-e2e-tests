import type { Locator, Page } from "@playwright/test";

const ensurePageForSelector = (selector: string, page?: Page): Page => {
  if (!page) {
    throw new Error(
      `A Playwright Page is required when selector is a string: "${selector}"`,
    );
  }
  return page;
};

type TableRow = Record<string, string>;

export class TableUtils {
  async parseDataTable(
    selector: string | Locator,
    page?: Page,
  ): Promise<TableRow[]> {
    const fn = (rows: Element[]) => {
      const sanitize = (value: string): string =>
        value
          .replace(/[▲▼⇧⇩⯅⯆]\s*$/g, "")
          .replace(/\s+/g, " ")
          .trim();

      if (!rows.length) {
        return [] as TableRow[];
      }
      const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
        (cell) => sanitize(cell.textContent ?? ""),
      );
      const dataRows = rows.slice(1);
      const parsed: TableRow[] = [];

      for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (!cells.length) {
          continue;
        }

        const item: TableRow = {};
        for (let index = 0; index < cells.length; index += 1) {
          const key = headerCells[index] || `column_${index + 1}`;
          item[key] = sanitize(cells[index].textContent ?? "");
        }
        parsed.push(item);
      }
      return parsed;
    };

    if (typeof selector === "string") {
      const resolvedPage = ensurePageForSelector(selector, page);
      return resolvedPage.$$eval(`${selector} tr`, fn);
    }
    return selector.locator("tr").evaluateAll(fn);
  }

  async parseKeyValueTable(
    selector: string | Locator,
    page?: Page,
  ): Promise<TableRow> {
    const fn = (rows: Element[]) => {
      const sanitize = (value: string): string =>
        value
          .replace(/[▲▼⇧⇩⯅⯆]\s*$/g, "")
          .replace(/\s+/g, " ")
          .trim();

      const parsed: TableRow = {};

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (cells.length < 2) {
          continue;
        }
        const key = sanitize(cells[0].textContent ?? "");
        if (!key) {
          continue;
        }
        const value = sanitize(
          cells
            .slice(1)
            .map((cell) => cell.textContent ?? "")
            .join(" "),
        );
        if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
          parsed[key] = value;
        }
      }
      return parsed;
    };

    if (typeof selector === "string") {
      const resolvedPage = ensurePageForSelector(selector, page);
      return resolvedPage.$$eval(`${selector} tr`, fn);
    }
    return selector.locator("tr").evaluateAll(fn);
  }

  async parseWorkAllocationTable(
    selector: string | Locator,
    page?: Page,
  ): Promise<TableRow[]> {
    return this.parseDataTable(selector, page);
  }
}

export function isEmptyTableRow(row: Record<string, string>): boolean {
  const text = Object.values(row).join(" ").replaceAll(/\s+/g, " ").trim();
  return (
    !text ||
    /no flags|no active flags|no case flags|no data|no items|no results|\bnone\b/i.test(
      text,
    )
  );
}

export function filterEmptyRows(
  table: Record<string, string>[],
): Record<string, string>[] {
  return table.filter((row) => !isEmptyTableRow(row));
}

export const isEmptyFlagsRow = isEmptyTableRow;
