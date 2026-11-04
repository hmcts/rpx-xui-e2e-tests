/* Harness-specific navigation uses the existing Odhín filters and test dialogs. */
if (window.jQuery)
  $(document).ready(() => {
    const root = document.getElementById("harness-overview");
    if (!root) return;
    const selects = [...root.querySelectorAll("[data-harness-filter]")];
    const filter = () => {
      const values = Object.fromEntries(
        selects.map((select) => [select.dataset.harnessFilter, select.value]),
      );
      let tests = 0,
        slices = 0;
      root.querySelectorAll("[data-harness-slice]").forEach((slice) => {
        const rows = [...slice.querySelectorAll("[data-harness-check]")];
        rows.forEach((row) => {
          row.hidden = Boolean(
            (values.lane && row.dataset.lane !== values.lane) ||
            (values.services &&
              !JSON.parse(row.dataset.services).includes(values.services)) ||
            (values.caseTypes &&
              !JSON.parse(row.dataset.caseTypes).includes(values.caseTypes)),
          );
        });
        const visible = rows.filter((row) => !row.hidden);
        const count = visible.length;
        for (const [selector, key] of [
          ["[data-slice-services]", "services"],
          ["[data-slice-cases]", "caseTypes"],
        ]) {
          slice.querySelector(selector).textContent = [
            ...new Set(visible.flatMap((row) => JSON.parse(row.dataset[key]))),
          ]
            .sort()
            .join(", ");
        }
        const result = slice.querySelector("[data-slice-outcomes]");
        result.replaceChildren();
        for (const status of ["passed", "failed", "timedOut", "skipped"]) {
          const count = visible.filter(
            (row) => row.dataset.status === status,
          ).length;
          if (!count) continue;
          const badge = document.createElement("span");
          badge.className = `harness-status ${status}`;
          badge.textContent = `${count} ${status === "timedOut" ? "timed out" : status}`;
          result.append(badge);
        }
        slice.hidden = !count;
        slice.querySelector(".harness-match-count").textContent =
          count === rows.length
            ? `${count} tests`
            : `${count} of ${rows.length} tests`;
        if (count) slices++;
        tests += count;
      });
      document.getElementById("harness-filter-count").textContent =
        `${tests} matching tests across ${slices} slices`;
    };
    const nativeFilters = [...root.querySelectorAll("[data-native-filter]")];
    nativeFilters.forEach((select) =>
      select.addEventListener("change", () => {
        const values = Object.fromEntries(
          nativeFilters.map((item) => [item.dataset.nativeFilter, item.value]),
        );
        const counts = { baseline: 0, fault: 0 };
        root.querySelectorAll("[data-native-row]").forEach((row) => {
          row.hidden = Boolean(
            (values.phase && row.dataset.nativePhase !== values.phase) ||
            (values.kind && row.dataset.nativeKind !== values.kind),
          );
          if (!row.hidden) counts[row.dataset.nativeKind]++;
        });
        root.querySelectorAll("[data-native-table]").forEach((table) => {
          table.hidden = !counts[table.dataset.nativeTable];
        });
        root.querySelector("[data-native-count]").textContent =
          `${counts.baseline} matching baseline results and ${counts.fault} deliberate fault checks`;
      }),
    );
    selects.forEach((select) => select.addEventListener("change", filter));
    root.querySelector("[data-harness-clear]").addEventListener("click", () => {
      selects.forEach((select) => (select.value = ""));
      filter();
    });
    root.querySelectorAll("[data-harness-lane]").forEach((button) =>
      button.addEventListener("click", () => {
        selects.forEach(
          (select) =>
            (select.value =
              select.dataset.harnessFilter === "lane"
                ? button.dataset.harnessLane
                : ""),
        );
        filter();
        const heading = document.getElementById("harness-slices-heading");
        const headerHeight =
          document.querySelector(".sticky-top")?.getBoundingClientRect()
            .height || 0;
        heading.style.scrollMarginTop = `${headerHeight + 16}px`;
        heading.scrollIntoView({ block: "start" });
        selects[0].focus({ preventScroll: true });
      }),
    );
    root.querySelectorAll("[data-harness-open-test]").forEach((button) =>
      button.addEventListener("click", () => {
        const table = $("#test-list-table").DataTable();
        document
          .querySelectorAll(".report-filters select")
          .forEach((select) => {
            select.value = "";
          });
        const search = document.querySelector(
          ".report-filters input[type=search]",
        );
        if (search) search.value = "";
        table.search("").columns().search("").draw();
        document.querySelector('.main-tablinks[onclick*="TabTests"]').click();
        bootstrap.Modal.getOrCreateInstance(
          document.getElementById(button.dataset.harnessOpenTest),
        ).show();
      }),
    );
  });
