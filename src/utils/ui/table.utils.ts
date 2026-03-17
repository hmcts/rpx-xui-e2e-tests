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
          .replaceAll(/^[▲▼⇧⇩⯅⯆\s]+/g, "")
          .replaceAll(/[▲▼⇧⇩⯅⯆\s]+$/g, "")
          .replaceAll(/\s+/g, " ")
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
      return resolvedPage.locator(`${selector} tr`).evaluateAll(fn);
    }
    return selector.locator("tr").evaluateAll(fn);
  }

  async parseKeyValueTable(
    selector: string | Locator,
    page?: Page,
  ): Promise<TableRow> {
    // Note: sanitize is intentionally duplicated inside each evaluateAll closure — these
    // functions are serialised and executed in the browser context, so they cannot
    // reference outer-scope helpers.
    const fn = (rows: Element[]) => {
      const sanitize = (value: string): string =>
        // NOSONAR typescript:S1192 - intentional duplicate: browser-serialised closure cannot reference outer scope
        value
          .replaceAll(/^[▲▼⇧⇩⯅⯆\s]+/g, "")
          .replaceAll(/[▲▼⇧⇩⯅⯆\s]+$/g, "")
          .replaceAll(/\s+/g, " ")
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
        if (!Object.hasOwn(parsed, key)) {
          parsed[key] = value;
        }
      }
      return parsed;
    };

    if (typeof selector === "string") {
      const resolvedPage = ensurePageForSelector(selector, page);
      return resolvedPage.locator(`${selector} tr`).evaluateAll(fn);
    }
    return selector.locator("tr").evaluateAll(fn);
  }

  async parseWorkAllocationTable(
    selector: string | Locator,
    page?: Page,
  ): Promise<TableRow[]> {
    const rows = await this.parseDataTable(selector, page);
    return rows.filter((row) => {
      const caseName = row["Case name"]?.trim() ?? "";
      const caseCategory = row["Case category"]?.trim() ?? "";
      const location = row["Location"]?.trim() ?? "";
      const task = row["Task"]?.trim() ?? "";
      const dueDate = row["Due date"]?.trim() ?? "";
      const hearingDate = row["Hearing date"]?.trim() ?? "";
      const priority = row["Priority"]?.trim() ?? "";
      const populatedCells = [
        caseName,
        caseCategory,
        location,
        task,
        dueDate,
        hearingDate,
        priority,
      ].filter((value) => value.length > 0).length;

      return populatedCells >= 4 && Boolean(caseName && location && task);
    });
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
