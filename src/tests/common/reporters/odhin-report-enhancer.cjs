/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */

const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

function deriveFeatureName(filePath) {
  const normalized = String(filePath ?? '')
    .replace(/\\/g, '/')
    .trim();

  if (!normalized) {
    return 'unknown';
  }

  const segments = normalized.split('/').filter(Boolean);
  const suiteMarkers = ['integration', 'e2e', 'api'];
  const nonFeatureSegments = new Set(['test', 'tests']);

  for (const suiteMarker of suiteMarkers) {
    const suiteIndex = segments.findIndex((segment) => segment.toLowerCase() === suiteMarker);
    if (suiteIndex === -1) {
      continue;
    }

    const featureSegment = segments
      .slice(suiteIndex + 1)
      .find((segment) => !nonFeatureSegments.has(segment.toLowerCase()));

    if (featureSegment) {
      return featureSegment.replace(/\.[^.]+$/, '');
    }
  }

  const baseName = normalized.split('/').pop() ?? normalized;
  return baseName.replace(/\.[^.]+$/, '');
}

function createEmptyFeatureStat(name) {
  return {
    name,
    totalTests: 0,
    durationMs: 0,
    passed: 0,
    failed: 0,
    timedOut: 0,
    skipped: 0,
    interrupted: 0,
    flaky: 0,
  };
}

function normalizeFeatureStats(featureStats) {
  const source =
    featureStats instanceof Map
      ? Array.from(featureStats.values())
      : Array.isArray(featureStats)
        ? featureStats
        : Object.values(featureStats ?? {});

  return source
    .map((entry) => ({
      ...createEmptyFeatureStat(String(entry?.name ?? 'unknown')),
      ...entry,
      totalTests: Number(entry?.totalTests ?? 0),
      durationMs: Number(entry?.durationMs ?? 0),
      passed: Number(entry?.passed ?? 0),
      failed: Number(entry?.failed ?? 0),
      timedOut: Number(entry?.timedOut ?? 0),
      skipped: Number(entry?.skipped ?? 0),
      interrupted: Number(entry?.interrupted ?? 0),
      flaky: Number(entry?.flaky ?? 0),
    }))
    .sort((left, right) => {
      if (right.totalTests !== left.totalTests) {
        return right.totalTests - left.totalTests;
      }
      return left.name.localeCompare(right.name);
    });
}

function colorForFeature(name) {
  let hash = 0;
  for (const char of String(name)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 68% 52%)`;
}

function percentOf(total, value) {
  if (!total) {
    return '0.00';
  }
  return ((value / total) * 100).toFixed(2);
}

function formatDuration(durationMs) {
  const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));
  const hours = Math.floor(safeDuration / 3600000);
  const minutes = Math.floor((safeDuration % 3600000) / 60000);
  const seconds = Math.floor((safeDuration % 60000) / 1000);
  const milliseconds = safeDuration % 1000;
  return `${hours}h ${minutes}m ${seconds}s ${milliseconds}ms`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function injectEnhancerStyles(root) {
  const head = root.querySelector('head');
  if (!head || root.querySelector('#odhin-enhancer-styles')) {
    return;
  }

  head.appendChild(
    parse(`
<style id="odhin-enhancer-styles">
  .odhin-dashboard-stack {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    align-self: stretch;
    height: 100%;
  }

  .odhin-dashboard-stack > .dashboard-block {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .odhin-dashboard-stack > .dashboard-block .odhin-table {
    flex: 1 1 auto;
  }

  #odhin-feature-summary .odhin-feature-overview-layout {
    display: grid;
    grid-template-columns: clamp(220px, 26%, 340px) minmax(0, 1fr);
    gap: clamp(12px, 1.6vw, 20px);
    align-items: stretch;
    padding: clamp(12px, 1.2vw, 18px);
    min-height: 100%;
  }

  #odhin-feature-summary .odhin-feature-overview-layout.odhin-feature-overview-layout-compact {
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  }

  #odhin-feature-summary .odhin-feature-overview-layout.odhin-feature-overview-layout-balanced {
    grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  }

  #odhin-feature-summary .odhin-feature-overview-sidebar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  #odhin-feature-summary .odhin-feature-overview-title {
    text-align: center;
    margin-bottom: 4px;
  }

  #odhin-feature-summary .odhin-feature-overview-cards {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: clamp(10px, 1vw, 14px);
  }

  #odhin-feature-summary .odhin-feature-overview-layout.odhin-feature-overview-layout-compact .odhin-feature-overview-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  #odhin-feature-summary .odhin-feature-overview-card {
    border: 1px solid #d8e3ef;
    border-radius: 12px;
    background: #f8fbfe;
    color: #16324f;
    padding: 14px 10px;
    text-align: center;
  }

  #odhin-feature-summary .odhin-feature-overview-card-value {
    font-size: 34px;
    line-height: 1;
    font-weight: 700;
  }

  #odhin-feature-summary .odhin-feature-overview-card-label {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  #odhin-feature-summary .odhin-feature-overview-largest {
    width: 100%;
    border: 1px solid #d8e3ef;
    border-radius: 12px;
    background: #ffffff;
    padding: 12px 14px;
    color: #16324f;
  }

  #odhin-feature-summary .odhin-feature-overview-largest-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #53657d;
  }

  #odhin-feature-summary .odhin-feature-overview-largest-feature {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  #odhin-feature-summary .odhin-feature-overview-largest-note {
    margin-top: 8px;
    font-size: 13px;
    color: #53657d;
  }

  #odhin-feature-summary .odhin-feature-overview-table {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  #odhin-feature-summary .odhin-feature-overview-table .tableFixHead {
    margin-left: 0 !important;
    height: auto;
    flex: 1 1 auto;
  }

  #odhin-feature-summary .odhin-feature-overview-table table {
    width: 100%;
  }

  #odhin-feature-summary .odhin-feature-overview-table th,
  #odhin-feature-summary .odhin-feature-overview-table td {
    vertical-align: middle;
    white-space: nowrap;
  }

  #odhin-feature-summary .odhin-feature-overview-table td:first-child,
  #odhin-feature-summary .odhin-feature-overview-table th:first-child {
    white-space: normal;
  }

  @media (max-width: 1399px) {
    #odhin-feature-summary .odhin-feature-overview-layout {
      grid-template-columns: 1fr;
    }

    #odhin-feature-summary .odhin-feature-overview-sidebar {
      justify-content: flex-start;
    }
  }

  .odhin-harness-test-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    padding: 12px;
    border: 1px solid #d8e3ef;
    border-radius: 6px;
    background: #f8fbfe;
  }

  .odhin-harness-filter-label {
    margin-right: 4px;
    color: #16324f;
    font-weight: 700;
  }

  .odhin-harness-filter-button {
    border: 1px solid #163647;
    border-radius: 4px;
    background: #ffffff;
    color: #163647;
    padding: 6px 10px;
    font-weight: 700;
    line-height: 1.2;
  }

  .odhin-harness-filter-button:hover,
  .odhin-harness-filter-button.active {
    background: #163647;
    color: #ffffff;
  }

  .odhin-harness-filter-summary {
    flex-basis: 100%;
    color: #53657d;
    font-size: 13px;
  }

  .odhin-harness-lane-badge {
    display: inline-block;
    min-width: 86px;
    margin-right: 8px;
    padding: 3px 7px;
    border-radius: 999px;
    background: #eef5fb;
    color: #163647;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .odhin-harness-lane-link {
    border: 0;
    background: transparent;
    color: #163647;
    padding: 0;
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .odhin-harness-lane-link:hover,
  .odhin-harness-lane-link:focus {
    color: #005ea5;
  }
</style>`)
  );
}

function injectHarnessLaneScript(root) {
  if (root.querySelector('#odhin-harness-lane-script')) {
    return;
  }

  const body = root.querySelector('body');
  if (!body) {
    return;
  }

  body.appendChild(
    parse(`
<script id="odhin-harness-lane-script">
(function () {
  var activeLane = 'all';
  var testRowsCache = null;
  var laneLabels = {
    all: 'All',
    api: 'API',
    ui: 'UI',
    integration: 'Integration',
    accessibility: 'Accessibility'
  };

  function normalise(value) {
    return String(value || '').trim().toLowerCase();
  }

  function parseDuration(durationText) {
    var match = String(durationText || '').match(/(\\d+)h\\s+(\\d+)m\\s+(\\d+)s\\s+(\\d+)ms/);
    if (!match) {
      return 0;
    }
    return Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
  }

  function formatDuration(durationMs) {
    var safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));
    var hours = Math.floor(safeDuration / 3600000);
    var minutes = Math.floor((safeDuration % 3600000) / 60000);
    var seconds = Math.floor((safeDuration % 60000) / 1000);
    var milliseconds = safeDuration % 1000;
    return hours + 'h ' + minutes + 'm ' + seconds + 's ' + milliseconds + 'ms';
  }

  function getModalForRow(row) {
    var modalSelector = row && row.getAttribute('data-bs-target');
    if (!modalSelector) {
      return null;
    }
    if (modalSelector.charAt(0) === '#') {
      return document.getElementById(modalSelector.slice(1));
    }
    return document.querySelector(modalSelector);
  }

  function getProjectForRow(row) {
    var modal = getModalForRow(row);
    if (!modal) {
      return '';
    }

    var infoRows = modal.querySelectorAll('.testcase-run-info-table tr');
    for (var index = 0; index < infoRows.length; index += 1) {
      var header = normalise(infoRows[index].querySelector('th') && infoRows[index].querySelector('th').textContent);
      if (header === 'project') {
        return normalise(infoRows[index].querySelector('td') && infoRows[index].querySelector('td').textContent);
      }
    }

    return '';
  }

  function getTitleForRow(row) {
    var titleCell = row && row.querySelector('td');
    return normalise(titleCell && titleCell.textContent);
  }

  function isAccessibilityRow(row) {
    return getTitleForRow(row).indexOf('accessibility baseline:') !== -1;
  }

  function getProjectLaneForRow(row) {
    var project = getProjectForRow(row);
    if (project === 'api' || project === 'ui' || project === 'integration') {
      return project;
    }

    return 'other';
  }

  function rowMatchesLane(row, lane) {
    if (lane === 'all') {
      return true;
    }
    if (lane === 'accessibility') {
      return isAccessibilityRow(row);
    }
    return getProjectLaneForRow(row) === lane;
  }

  function statusKeyForRow(row) {
    var status = normalise(row && row.children && row.children[1] && row.children[1].textContent);
    if (status === 'timed out') {
      return 'timedOut';
    }
    return status || 'other';
  }

  function allTestRows() {
    return testRowsCache || Array.prototype.slice.call(document.querySelectorAll('#test-list-table tbody tr.test-row-result'));
  }

  function resolveDataTable() {
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) {
      return null;
    }
    return window.jQuery('#test-list-table').DataTable();
  }

  function cacheAllRows(dataTable) {
    if (!dataTable || testRowsCache) {
      return;
    }
    testRowsCache = Array.prototype.slice.call(dataTable.rows().nodes()).filter(function (row) {
      return row && row.classList && row.classList.contains('test-row-result');
    });
  }

  function laneStats() {
    var stats = {};
    ['api', 'ui', 'integration', 'accessibility'].forEach(function (lane) {
      stats[lane] = {
        tests: 0,
        durationMs: 0,
        passed: 0,
        failed: 0,
        timedOut: 0,
        skipped: 0,
        interrupted: 0,
        flaky: 0
      };
    });

    allTestRows().forEach(function (row) {
      var lane = getProjectLaneForRow(row);
      var status = statusKeyForRow(row);
      var durationMs = parseDuration(row.children && row.children[2] && row.children[2].textContent);

      if (stats[lane]) {
        stats[lane].tests += 1;
        stats[lane].durationMs += durationMs;
        if (Object.prototype.hasOwnProperty.call(stats[lane], status)) {
          stats[lane][status] += 1;
        }
      }

      if (isAccessibilityRow(row)) {
        stats.accessibility.tests += 1;
        stats.accessibility.durationMs += durationMs;
        if (Object.prototype.hasOwnProperty.call(stats.accessibility, status)) {
          stats.accessibility[status] += 1;
        }
      }
    });

    return stats;
  }

  function addLaneBadges() {
    allTestRows().forEach(function (row) {
      var titleCell = row.querySelector('td');
      if (!titleCell || titleCell.querySelector('.odhin-harness-lane-badge')) {
        return;
      }
      var lane = isAccessibilityRow(row) ? 'accessibility' : getProjectLaneForRow(row);
      var badge = document.createElement('span');
      badge.className = 'odhin-harness-lane-badge';
      badge.textContent = laneLabels[lane] || 'Other';
      titleCell.insertBefore(badge, titleCell.firstChild);
    });
  }

  function addTestLaneFilters() {
    var tableElement = document.querySelector('#test-list-table');
    var statusFilterRow = document.querySelector('#status-filter-row');
    if (!tableElement || !statusFilterRow || document.querySelector('#odhin-harness-test-filters')) {
      return;
    }

    var toolbar = document.createElement('div');
    toolbar.id = 'odhin-harness-test-filters';
    toolbar.className = 'odhin-harness-test-filters';
    toolbar.innerHTML =
      '<span class="odhin-harness-filter-label">Harness lane</span>' +
      '<button type="button" class="odhin-harness-filter-button active" data-harness-lane="all">All</button>' +
      '<button type="button" class="odhin-harness-filter-button" data-harness-lane="api">API</button>' +
      '<button type="button" class="odhin-harness-filter-button" data-harness-lane="ui">UI</button>' +
      '<button type="button" class="odhin-harness-filter-button" data-harness-lane="integration">Integration</button>' +
      '<button type="button" class="odhin-harness-filter-button" data-harness-lane="accessibility">Accessibility</button>' +
      '<div class="odhin-harness-filter-summary" id="odhin-harness-filter-summary"></div>';
    statusFilterRow.parentNode.insertBefore(toolbar, statusFilterRow);

    var dataTable = resolveDataTable();
    cacheAllRows(dataTable);

    if (dataTable && !window.__odhinHarnessLaneFilterRegistered) {
      window.jQuery.fn.dataTable.ext.search.push(function (settings, _data, dataIndex) {
        if (!settings || !settings.nTable || settings.nTable.id !== 'test-list-table') {
          return true;
        }
        var row = dataTable.row(dataIndex).node();
        return rowMatchesLane(row, activeLane);
      });
      window.__odhinHarnessLaneFilterRegistered = true;
    }

    toolbar.querySelectorAll('[data-harness-lane]').forEach(function (button) {
      button.addEventListener('click', function () {
        activateLane(button.getAttribute('data-harness-lane') || 'all');
      });
    });

    updateFilterSummary();
  }

  function activateLane(lane) {
    activeLane = laneLabels[lane] ? lane : 'all';
    var toolbar = document.querySelector('#odhin-harness-test-filters');
    var dataTable = resolveDataTable();
    cacheAllRows(dataTable);

    if (toolbar) {
      toolbar.querySelectorAll('[data-harness-lane]').forEach(function (candidate) {
        candidate.classList.toggle('active', candidate.getAttribute('data-harness-lane') === activeLane);
      });
    }
    if (dataTable) {
      dataTable.draw();
    }
    updateFilterSummary();
  }

  function openTestsTab() {
    var testsTab = Array.prototype.slice.call(document.querySelectorAll('.main-tablinks')).find(function (tab) {
      return normalise(tab.textContent) === 'tests';
    });

    if (typeof window.openMainTab === 'function' && testsTab) {
      window.openMainTab({ currentTarget: testsTab }, 'TabTests');
      return;
    }

    Array.prototype.slice.call(document.querySelectorAll('.main-tabcontent')).forEach(function (tabContent) {
      tabContent.style.display = 'none';
    });
    Array.prototype.slice.call(document.querySelectorAll('.main-tablinks')).forEach(function (tab) {
      tab.classList.remove('active');
    });
    var testsPanel = document.querySelector('#TabTests');
    if (testsPanel) {
      testsPanel.style.display = 'block';
    }
    if (testsTab) {
      testsTab.classList.add('active');
    }
  }

  function openLaneFromDashboard(lane) {
    openTestsTab();
    activateLane(lane);
    var toolbar = document.querySelector('#odhin-harness-test-filters');
    if (toolbar && typeof toolbar.scrollIntoView === 'function') {
      toolbar.scrollIntoView({ block: 'start' });
    }
  }

  function updateFilterSummary() {
    var summary = document.querySelector('#odhin-harness-filter-summary');
    if (!summary) {
      return;
    }
    var rows = allTestRows();
    var visibleRows = rows.filter(function (row) {
      return rowMatchesLane(row, activeLane);
    });
    summary.textContent = 'Showing ' + visibleRows.length + ' of ' + rows.length + ' tests in ' + laneLabels[activeLane] + '. Accessibility is tracked as its own cross-cutting lane.';
  }

  function addDashboardLaneSummary() {
    var dashboard = document.querySelector('#TabDashboard .row');
    if (!dashboard || document.querySelector('#odhin-harness-lane-summary')) {
      return;
    }

    var stats = laneStats();
    var rows = ['api', 'ui', 'integration', 'accessibility'].map(function (lane) {
      var stat = stats[lane];
      return '<tr>' +
        '<td class="text-start fs-6 text-secondary-emphasis summary-row-left-column">' +
          '<button type="button" class="odhin-harness-lane-link" data-dashboard-harness-lane="' + lane + '" aria-label="Show ' + laneLabels[lane] + ' harness lane tests">' +
            laneLabels[lane] +
          '</button>' +
        '</td>' +
        '<td class="text-secondary-emphasis">' + stat.tests + '</td>' +
        '<td class="text-secondary-emphasis">' + formatDuration(stat.durationMs) + '</td>' +
        '<td class="result-status-passed">' + stat.passed + '</td>' +
        '<td class="result-status-failed">' + stat.failed + '</td>' +
        '<td class="result-status-timedOut">' + stat.timedOut + '</td>' +
        '<td class="result-status-skipped">' + stat.skipped + '</td>' +
        '<td class="result-status-interrupted">' + stat.interrupted + '</td>' +
        '<td class="result-status-flaky">' + stat.flaky + '</td>' +
      '</tr>';
    }).join('');

    var column = document.createElement('div');
    column.className = 'col-12';
    column.id = 'odhin-harness-lane-summary';
    column.innerHTML =
      '<div class="mt-3 mb-3 odhin-thin-border dashboard-block">' +
        '<div class="info-box-header">Harness lanes</div>' +
        '<div class="odhin-table">' +
          '<div class="table-responsive tableFixHead">' +
            '<table class="table table-sm mb-0">' +
              '<thead><tr>' +
                '<th class="odhin-text-2 px-2">Lane</th>' +
                '<th class="odhin-text-2 px-2">Tests</th>' +
                '<th class="odhin-text-2 px-2">Execution Time</th>' +
                '<th class="odhin-text-2 px-2">Passed</th>' +
                '<th class="odhin-text-2 px-2">Failed</th>' +
                '<th class="odhin-text-2 px-2">Timed Out</th>' +
                '<th class="odhin-text-2 px-2">Skipped</th>' +
                '<th class="odhin-text-2 px-2">Interrupted</th>' +
                '<th class="odhin-text-2 px-2">Flaky</th>' +
              '</tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
            '</table>' +
          '</div>' +
          '<div class="px-2 pb-2 text-secondary-emphasis fst-italic">Accessibility is shown separately because it is a cross-cutting assurance lane, even when the underlying Playwright project is UI or Integration.</div>' +
        '</div>' +
      '</div>';

    var statusByProject = Array.prototype.slice.call(dashboard.children).find(function (child) {
      return child.textContent && child.textContent.indexOf('Status by project') !== -1;
    });
    if (statusByProject && statusByProject.nextSibling) {
      dashboard.insertBefore(column, statusByProject.nextSibling);
    } else {
      dashboard.appendChild(column);
    }

    column.querySelectorAll('[data-dashboard-harness-lane]').forEach(function (button) {
      button.addEventListener('click', function () {
        openLaneFromDashboard(button.getAttribute('data-dashboard-harness-lane') || 'all');
      });
    });
  }

  function initialiseHarnessLaneEnhancements() {
    addTestLaneFilters();
    addLaneBadges();
    addDashboardLaneSummary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseHarnessLaneEnhancements);
  } else {
    initialiseHarnessLaneEnhancements();
  }
})();
</script>`)
  );
}

function dashboardBlockTitle(column) {
  return column.querySelector('.info-box-header')?.text.trim() ?? '';
}

function rebalanceTopDashboardColumns(root) {
  const columns = root.querySelectorAll('.col-12.col-xl-6');
  const runInfoColumn = columns.find((column) => dashboardBlockTitle(column) === 'Run info');
  const globalSummaryColumn = columns.find((column) => dashboardBlockTitle(column) === 'Global Summary');
  const featureOverviewColumn = columns.find((column) => dashboardBlockTitle(column) === 'Feature Overview');
  const projectsSummaryColumn = columns.find((column) => dashboardBlockTitle(column) === 'Projects Summary');

  if (!runInfoColumn || !globalSummaryColumn || !featureOverviewColumn || !projectsSummaryColumn) {
    return;
  }

  const parent = runInfoColumn.parentNode;
  if (
    !parent ||
    parent !== globalSummaryColumn.parentNode ||
    parent !== featureOverviewColumn.parentNode ||
    parent !== projectsSummaryColumn.parentNode
  ) {
    return;
  }

  const leftStack = parse(
    `<div class="col-12 col-xl-6 odhin-dashboard-stack">${runInfoColumn.innerHTML}${featureOverviewColumn.innerHTML}</div>`
  );
  const rightStack = parse(
    `<div class="col-12 col-xl-6 odhin-dashboard-stack">${globalSummaryColumn.innerHTML}${projectsSummaryColumn.innerHTML}</div>`
  );

  runInfoColumn.replaceWith(leftStack);
  globalSummaryColumn.replaceWith(rightStack);
  featureOverviewColumn.remove();
  projectsSummaryColumn.remove();
}

function buildFeatureOverviewBlock(featureStats) {
  const totalTests = featureStats.reduce((sum, feature) => sum + feature.totalTests, 0);
  const topFeature = featureStats[0];
  const summaryLabel = featureStats.length > 1 ? 'Distribution' : 'Summary';
  const layoutDensityClass =
    featureStats.length <= 3
      ? 'odhin-feature-overview-layout-compact'
      : featureStats.length <= 6
        ? 'odhin-feature-overview-layout-balanced'
        : 'odhin-feature-overview-layout-dense';
  const tableViewportPx = Math.min(520, Math.max(156, 72 + featureStats.length * 40));
  const rows = featureStats
    .map((feature) => {
      const color = colorForFeature(feature.name);
      return `
                <tr>
                  <td class="text-start fs-6 text-secondary-emphasis summary-row-left-column" style="border-left: 8px solid ${color};">
                    ${escapeHtml(feature.name)}
                  </td>
                  <td class="text-secondary-emphasis">${feature.totalTests}</td>
                  <td class="text-secondary-emphasis">${formatDuration(feature.durationMs)}</td>
                  <td class="result-status-passed">${feature.passed} (<label class="fst-italic">${percentOf(feature.totalTests, feature.passed)}%</label>)</td>
                  <td class="result-status-failed">${feature.failed} (<label class="fst-italic">${percentOf(feature.totalTests, feature.failed)}%</label>)</td>
                  <td class="result-status-timedOut">${feature.timedOut} (<label class="fst-italic">${percentOf(feature.totalTests, feature.timedOut)}%</label>)</td>
                  <td class="result-status-skipped">${feature.skipped} (<label class="fst-italic">${percentOf(feature.totalTests, feature.skipped)}%</label>)</td>
                  <td class="result-status-interrupted">${feature.interrupted} (<label class="fst-italic">${percentOf(feature.totalTests, feature.interrupted)}%</label>)</td>
                  <td class="result-status-flaky">${feature.flaky} (<label class="fst-italic">${percentOf(feature.totalTests, feature.flaky)}%</label>)</td>
                  <td class="text-secondary-emphasis">${percentOf(totalTests, feature.totalTests)}%</td>
                </tr>`;
    })
    .join('\n');

  return `
<div class="mt-3 mb-3 odhin-thin-border dashboard-block" id="odhin-feature-summary">
  <div class="info-box-header">
    Feature Overview
  </div>
  <div class="odhin-table">
    <div class="odhin-feature-overview-layout ${layoutDensityClass}">
      <div class="odhin-feature-overview-sidebar">
        <div class="odhin-text-2 odhin-feature-overview-title">${summaryLabel}</div>
        <div class="odhin-feature-overview-cards">
          <div class="odhin-feature-overview-card">
            <div class="odhin-feature-overview-card-value">${totalTests}</div>
            <div class="odhin-feature-overview-card-label">Tests</div>
          </div>
          <div class="odhin-feature-overview-card">
            <div class="odhin-feature-overview-card-value">${featureStats.length}</div>
            <div class="odhin-feature-overview-card-label">Features</div>
          </div>
        </div>
        <div class="odhin-feature-overview-largest">
          <div class="odhin-feature-overview-largest-title">Largest feature</div>
          <div class="odhin-feature-overview-largest-feature">
            <span style="display:inline-block;width:12px;height:12px;border-radius:999px;background:${colorForFeature(topFeature.name)};"></span>
            <span style="font-size:16px;font-weight:700;">${escapeHtml(topFeature.name)}</span>
          </div>
          <div class="odhin-feature-overview-largest-note">
            ${topFeature.totalTests} tests (${percentOf(totalTests, topFeature.totalTests)}% of this run)
          </div>
        </div>
      </div>
      <div class="odhin-feature-overview-table">
          <div class="table-responsive tableFixHead" style="max-height:${tableViewportPx}px;">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th class="odhin-text-2 px-2">Feature</th>
                  <th class="odhin-text-2 px-2">Tests</th>
                  <th class="odhin-text-2 px-2">Execution Time</th>
                  <th class="odhin-text-2 px-2">Passed</th>
                  <th class="odhin-text-2 px-2">Failed</th>
                  <th class="odhin-text-2 px-2">Timed Out</th>
                  <th class="odhin-text-2 px-2">Skipped</th>
                  <th class="odhin-text-2 px-2">Interrupted</th>
                  <th class="odhin-text-2 px-2">Flaky</th>
                  <th class="odhin-text-2 px-2">Percentage</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="10" class="text-secondary-emphasis text-start">No grouped features found</td></tr>'}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  </div>
</div>`;
}

function replaceDashboardBlock(root, title, replacementHtml) {
  const block = root
    .querySelectorAll('.dashboard-block')
    .find((candidate) => candidate.querySelector('.info-box-header')?.text.trim() === title);

  if (!block) {
    return false;
  }

  block.replaceWith(parse(replacementHtml));
  return true;
}

function removeDuplicateFeatureStatusBlock(root) {
  const featureStatusBlocks = root
    .querySelectorAll('.dashboard-block')
    .filter((candidate) => candidate.querySelector('.info-box-header')?.text.trim() === 'Status by feature');

  featureStatusBlocks.forEach((candidate) => candidate.remove());
}

function removeLegacyFileChartInitializer(scriptContent) {
  return String(scriptContent)
    .replace(
      /\s*(?:let|const|var)\s+ctxFile\s*=\s*document\.getElementById\('chart-file'\)\.getContext\('2d'\);\s*(?:let|const|var)\s+chartFile\s*=\s*new\s+Chart\(ctxFile,\s*\{[\s\S]*?\}\s*\);\s*/g,
      '\n'
    )
    .replace(/\n{3,}/g, '\n\n');
}

function stripLegacyFileChartArtifacts(root) {
  root.querySelectorAll('#chart-file').forEach((node) => node.remove());
  root.querySelectorAll('script').forEach((scriptNode) => {
    const currentContent = scriptNode.innerHTML;
    const nextContent = removeLegacyFileChartInitializer(currentContent);
    if (nextContent !== currentContent) {
      scriptNode.set_content(nextContent);
    }
  });
}

function enhanceDashboardHtml(html, featureStats) {
  const normalizedStats = normalizeFeatureStats(featureStats);
  if (!normalizedStats.length) {
    return html;
  }

  const root = parse(html);
  injectEnhancerStyles(root);

  replaceDashboardBlock(root, 'Files Summary', buildFeatureOverviewBlock(normalizedStats));
  removeDuplicateFeatureStatusBlock(root);
  rebalanceTopDashboardColumns(root);

  stripLegacyFileChartArtifacts(root);
  injectHarnessLaneScript(root);

  return root.toString();
}

function enhanceGeneratedReport(outputFolder, featureStats) {
  if (!outputFolder || !fs.existsSync(outputFolder)) {
    return;
  }

  const normalizedStats = normalizeFeatureStats(featureStats);
  if (!normalizedStats.length) {
    return;
  }

  const reportFiles = fs.readdirSync(outputFolder).filter((fileName) => fileName.toLowerCase().endsWith('.html'));

  reportFiles.forEach((fileName) => {
    const filePath = path.join(outputFolder, fileName);
    const currentHtml = fs.readFileSync(filePath, 'utf8');
    const nextHtml = enhanceDashboardHtml(currentHtml, normalizedStats);
    fs.writeFileSync(filePath, nextHtml, 'utf8');
  });
}

module.exports = {
  createEmptyFeatureStat,
  deriveFeatureName,
  enhanceDashboardHtml,
  enhanceGeneratedReport,
  formatDuration,
  normalizeFeatureStats,
  percentOf,
  __test__: {
    buildFeatureOverviewBlock,
    createEmptyFeatureStat,
    deriveFeatureName,
    enhanceDashboardHtml,
    formatDuration,
    removeLegacyFileChartInitializer,
    normalizeFeatureStats,
    percentOf,
  },
};
