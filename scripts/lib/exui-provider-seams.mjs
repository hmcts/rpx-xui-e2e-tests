import http from "node:http";
import fs from "node:fs";
export const REVIEWED_FAMILIES = [
  "IA",
  "CIVIL",
  "PRIVATELAW",
  "PUBLICLAW",
  "EMPLOYMENT",
  "ST_CIC",
];
const labels = [
  "Immigration and Asylum",
  "Civil",
  "Private Law",
  "Public Law",
  "Employment",
  "Special Tribunals",
];
export async function startProviderSeams(
  output,
  assignments = syntheticRoleAssignments(),
) {
  const server = http.createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const url = new URL(request.url, "http://127.0.0.1:3101");
    fs.appendFileSync(
      `${output}/provider-requests.jsonl`,
      JSON.stringify({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: text ? JSON.parse(text) : null,
      }) + "\n",
    );
    let body;
    if (url.pathname === "/o/.well-known/openid-configuration")
      body = { issuer: "http://127.0.0.1:3101" };
    else if (url.pathname === "/lease") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(
        [
          "eyJhbGciOiJub25lIn0",
          Buffer.from(JSON.stringify({ exp: 4102444800 })).toString(
            "base64url",
          ),
          "synthetic",
        ].join("."),
      );
      return;
    } else if (url.pathname.startsWith("/am/role-assignments/actors/"))
      body = { roleAssignmentResponse: assignments };
    else if (url.pathname === "/refdata/location/orgServices")
      body = REVIEWED_FAMILIES.map((family, index) => ({
        ccd_service_name: family,
        service_short_description: labels[index],
      }));
    else if (url.pathname === "/task" && request.method === "POST")
      body = { tasks: [], total_records: 0 };
    else if (url.pathname === "/work-types")
      body = { work_types: [{ id: "hearing_work", label: "Hearing work" }] };
    else if (url.pathname === "/refdata/location/court-venues/venue-search")
      body = syntheticVenues();
    else if (url.pathname === "/refdata/location/court-venues")
      body = syntheticVenues();
    else if (url.pathname.startsWith("/refdata/location/court-venues/"))
      body =
        url.pathname === "/refdata/location/court-venues/765324"
          ? syntheticVenues()
          : { court_venues: syntheticVenues() };
    else if (url.pathname.includes("/locations"))
      body = [
        {
          epimms_id: "765324",
          site_name: "Synthetic Hearing Centre",
          region_id: "1",
          region: "London",
          court_type_id: "1",
          is_case_management_location: "Y",
        },
      ];
    else if (url.pathname === "/task/task-types") body = { task_types: [] };
    else if (url.pathname === "/health" || url.pathname === "/health/liveness")
      body = { status: "UP" };
    else {
      fs.appendFileSync(
        `${output}/provider-rejections.jsonl`,
        JSON.stringify({
          code: "UNDECLARED_PROVIDER_REQUEST",
          path: url.pathname,
        }) + "\n",
      );
      response.writeHead(501, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "UNDECLARED_PROVIDER_REQUEST" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
  return server;
}

// Authentication is an excluded seam: seed a synthetic session in the candidate's own file store.
export function seedSyntheticSession(assignments = syntheticRoleAssignments()) {
  const id = "harness-supervisor-session";
  const roles = [
    "caseworker",
    "caseworker-ia",
    "caseworker-ia-caseofficer",
    "hmcts-legal-operations",
    "task-supervisor",
  ];
  const userinfo = {
    id: "harness-supervisor",
    uid: "harness-supervisor",
    email: "supervisor@example.invalid",
    forename: "Synthetic",
    surname: "Supervisor",
    roles,
    roleCategory: "LEGAL_OPERATIONS",
    roleCategories: ["LEGAL_OPERATIONS"],
  };
  const accessToken = [
    "eyJhbGciOiJub25lIn0",
    Buffer.from(
      JSON.stringify({ sub: userinfo.uid, exp: 4102444800 }),
    ).toString("base64url"),
    "synthetic",
  ].join(".");
  const roleAssignmentResponse = assignments;
  fs.mkdirSync("/tmp/.sessions", { recursive: true });
  fs.writeFileSync(
    `/tmp/.sessions/${id}.json`,
    JSON.stringify({
      cookie: {
        originalMaxAge: null,
        expires: null,
        httpOnly: true,
        path: "/",
        secure: false,
      },
      passport: {
        user: {
          userinfo,
          tokenset: { accessToken, refreshToken: accessToken },
        },
      },
      roleAssignmentResponse,
      __lastAccess: Date.now(),
    }),
  );
  return { id, userinfo, accessToken };
}

export function syntheticRoleAssignments() {
  // A global supervisor uses the candidate configuration list; explicit role IDs would re-add missing families.
  return [
    {
      roleName: "task-supervisor",
      roleType: "ORGANISATION",
      roleCategory: "LEGAL_OPERATIONS",
      attributes: { jurisdiction: null, substantive: "Y" },
    },
  ];
}

export function scopeRoleAssignments(organisationFamily) {
  if (!["IA", "CIVIL"].includes(organisationFamily))
    throw new Error("UNKNOWN_SCOPE_PERSONA");
  return [
    {
      roleName: "caseworker",
      roleType: "ORGANISATION",
      roleCategory: "LEGAL_OPERATIONS",
      attributes: {
        jurisdiction: organisationFamily,
        substantive: "Y",
        baseLocation: "765324",
      },
    },
    {
      roleName: "caseworker",
      roleType: "CASE",
      roleCategory: "LEGAL_OPERATIONS",
      attributes: {
        jurisdiction: organisationFamily === "IA" ? "CIVIL" : "IA",
        substantive: "Y",
        baseLocation: "999999",
        caseId: "synthetic-case",
      },
    },
  ];
}
function syntheticVenues() {
  return [
    {
      epimms_id: "765324",
      site_name: "Synthetic Hearing Centre",
      region_id: "1",
      region: "London",
      court_type_id: "1",
      service_code: "BFA1",
      is_case_management_location: "Y",
      is_hearing_location: "Y",
    },
  ];
}
