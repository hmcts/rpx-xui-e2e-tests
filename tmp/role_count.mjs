/* global process, console */

import { chromium } from "@playwright/test";

const baseUrl =
  process.env.TEST_URL || "https://manage-case.aat.platform.hmcts.net";

async function fetchUser(username, password) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForSelector("#username", { timeout: 60000 });
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(5000);

    const res = await context.request.get(`${baseUrl}/api/user/details`, {
      failOnStatusCode: false,
      timeout: 120000,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return {
      username,
      status: res.status(),
      uid: data?.userInfo?.uid || data?.userInfo?.id || null,
      roleAssignmentInfo: Array.isArray(data?.roleAssignmentInfo)
        ? data.roleAssignmentInfo
        : [],
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

function summarise(result) {
  const arr = result.roleAssignmentInfo;
  const now = new Date();
  const normAttrs = (a) => {
    if (!a || typeof a !== "object") return "";
    return Object.keys(a)
      .sort()
      .map((k) => `${k}=${JSON.stringify(a[k])}`)
      .join("&");
  };

  const keyOf = (r) =>
    [
      r.roleName || "",
      r.roleType || "",
      r.grantType || "",
      r.classification || "",
      normAttrs(r.attributes),
    ].join("|");

  const groups = new Map();
  let expired = 0;
  for (const r of arr) {
    const k = keyOf(r);
    groups.set(k, (groups.get(k) || 0) + 1);
    if (r?.endTime) {
      const end = new Date(r.endTime);
      if (!Number.isNaN(end.getTime()) && end < now) expired++;
    }
  }

  const duplicateGroups = [...groups.values()].filter((c) => c > 1);
  const duplicateExtras = duplicateGroups.reduce((a, c) => a + (c - 1), 0);

  const topRolesMap = new Map();
  for (const r of arr) {
    const name = r.roleName || "UNKNOWN";
    topRolesMap.set(name, (topRolesMap.get(name) || 0) + 1);
  }
  const topRoles = [...topRolesMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([role, count]) => ({ role, count }));

  return {
    username: result.username,
    status: result.status,
    uid: result.uid,
    total: arr.length,
    expired,
    duplicate_groups: duplicateGroups.length,
    duplicate_extras: duplicateExtras,
    top_roles: topRoles,
  };
}

const users = [
  {
    username:
      process.env.PROD_LIKE_USERNAME ||
      "xui_auto_test_user_solicitor@mailinator.com",
    password: process.env.PROD_LIKE_PASSWORD || "Monday01",
  },
  {
    username:
      process.env.PRL_SOLICITOR2_USERNAME || "prl_aat_solicitor@mailinator.com",
    password: process.env.PRL_SOLICITOR_PASSWORD || "Nagoya0102",
  },
];

const out = [];
for (const u of users) {
  const raw = await fetchUser(u.username, u.password);
  out.push(summarise(raw));
}
console.log(JSON.stringify(out, null, 2));
