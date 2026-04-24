import type { Page } from "@playwright/test";

type UnknownRecord = Record<string, unknown>;

const appConfigTemplate = {
  features: {
    ccdCaseCreate: {
      isEnabled: true,
      label: "CCDCaseCreate"
    }
  },
  caseEditorConfig: {
    api_url: "/aggregated",
    case_data_url: "/data",
    document_management_url: "/documents",
    document_management_url_v2: "/documentsv2",
    document_management_secure_enabled: true,
    login_url: "/login",
    oauth2_client_id: "ccd_gateway",
    postcode_lookup_url: "/api/addresses?postcode=${postcode}",
    remote_document_management_url: ".*(\\/documents)",
    documentSecureModeCaseTypeExclusions:
      "DIVORCE,DIVORCE_BulkAction,DIVORCE_ExceptionRecord,DIVORCE_NOTICE_OF_ACTING,CARE_SUPERVISION_EPO,PRLAPPS,Caveat,GrantOfRepresentation,LegacySearch,PROBATE_ExceptionRecord,StandingSearch,WillLodgement,CriminalInjuriesCompensation,Benefit,SSCS_ExceptionRecord,CareStandards,MentalHeath,PrimaryHealthLists,SpecialEducationalNeeds,DisabilityDiscrimination,ET_EnglandWales,ET_Scotland,ET_Scotland_Multiple,ET_EnglandWales_Multiple,MoneyClaimCase,CMC_ExceptionRecord,FINREM_ExceptionRecord",
    payments_url: "/payments",
    pay_bulk_scan_url: "/pay-bulkscan",
    activity_batch_collection_delay_ms: 1,
    activity_next_poll_request_ms: 30000,
    activity_retry: 30,
    timeouts_case_retrieval: [18, 17],
    timeouts_case_retrieval_artificial_delay: 0,
    activity_url: "/activity",
    activity_max_request_per_batch: 25,
    print_service_url: "/print",
    remote_print_service_url: "https://return-case-doc-ccd.nonprod.platform.hmcts.net",
    pagination_page_size: 25,
    annotation_api_url: "/em-anno",
    hrs_url: "/hearing-recordings",
    remote_hrs_url: ".*(\\/hearing-recordings)",
    refunds_url: "api/refund",
    notification_url: "api/notification",
    access_management_mode: false,
    location_ref_api_url: "/refdata/location",
    cam_role_assignments_api_url: "/am/role-assignments",
    categories_and_documents_url: "/categoriesAndDocuments",
    document_data_url: "/documentData/caseref",
    rd_common_data_api_url: "/refdata/commondata",
    case_data_store_api_url: "/getLinkedCases",
    case_flags_refdata_api_url: "/refdata/commondata/caseflags/service-id=:sid",
    events_to_hide: ["queryManagementRespondQuery"]
  },
  urls: {
    idam: {
      idamApiUrl: "https://idam-api.ithc.platform.hmcts.net",
      idamClientID: "xuiwebapp",
      idamLoginUrl: "https://idam-web-public.ithc.platform.hmcts.net",
      indexUrl: "/",
      oauthCallbackUrl: "oauth2/callback"
    }
  }
};

const headerConfigTemplate = {
  "(judge)|(judiciary)": [
    {
      active: true,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease2" }],
      href: "/work/my-work/list",
      roles: [
        "caseworker-civil",
        "caseworker-ia-iacjudge",
        "caseworker-privatelaw",
        "caseworker-publiclaw",
        "caseworker-employment-etjudge"
      ],
      text: "My work"
    },
    {
      active: false,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease2" }],
      href: "/work/all-work/tasks",
      roles: ["task-supervisor"],
      text: "All work"
    },
    {
      active: false,
      href: "/cases",
      roles: [
        "caseworker-sscs-judge",
        "caseworker-sscs-panelmember",
        "caseworker-cmc-judge",
        "caseworker-divorce-judge",
        "caseworker-divorce-financialremedy-judiciary",
        "caseworker-probate-judge",
        "caseworker-ia-iacjudge",
        "caseworker-civil",
        "caseworker-privatelaw",
        "caseworker-publiclaw-judiciary",
        "caseworker-employment-etjudge"
      ],
      text: "Case list"
    }
  ],
  ".+": [
    {
      active: true,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease2" }],
      href: "/work/my-work/list",
      roles: [
        "caseworker-civil",
        "caseworker-civil-staff",
        "caseworker-ia-caseofficer",
        "caseworker-ia-admofficer",
        "caseworker-privatelaw",
        "caseworker-publiclaw",
        "caseworker-employment"
      ],
      text: "My work"
    },
    {
      active: false,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease2" }],
      href: "/work/all-work/tasks",
      roles: ["task-supervisor"],
      text: "All work"
    },
    {
      active: false,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease1" }],
      href: "/tasks",
      roles: ["caseworker-ia-caseofficer"],
      text: "Task list"
    },
    {
      active: false,
      flags: ["MC_Work_Allocation", { flagName: "mc-work-allocation-active-feature", value: "WorkAllocationRelease1" }],
      href: "/tasks/task-manager",
      roles: ["caseworker-ia-caseofficer", "task-supervisor"],
      text: "Task manager"
    },
    {
      active: false,
      href: "/cases",
      roles: [
        "caseworker-caa",
        "caseworker-divorce",
        "caseworker-sscs",
        "caseworker-adoption",
        "caseworker-civil",
        "caseworker-cmc",
        "caseworker-employment",
        "caseworker-privatelaw",
        "caseworker-hrs",
        "caseworker-probate",
        "caseworker-ia",
        "caseworker-publiclaw",
        "caseworker-st_cic"
      ],
      text: "Case list"
    },
    {
      active: false,
      href: "/cases/case-filter",
      text: "Create case"
    },
    {
      active: false,
      flags: ["feature-global-search"],
      href: "/cases/case-search",
      ngClass: "hmcts-search-toggle__button",
      roles: [
        "caseworker-caa",
        "caseworker-divorce",
        "caseworker-sscs",
        "caseworker-adoption",
        "caseworker-civil",
        "caseworker-cmc",
        "caseworker-employment",
        "caseworker-privatelaw",
        "caseworker-hrs",
        "caseworker-probate",
        "caseworker-publiclaw",
        "caseworker-publiclaw-courtadmin",
        "caseworker-st_cic"
      ],
      text: "Find case"
    },
    {
      active: false,
      flags: ["feature-global-search"],
      href: "/search",
      roles: [
        "caseworker-civil",
        "caseworker-ia-caseofficer",
        "senior-tribunal-caseworker",
        "tribunal-caseworker",
        "caseworker-ia-admofficer",
        "caseworker-befta_master",
        "caseworker-privatelaw",
        "caseworker-publiclaw",
        "caseworker-st_cic",
        "caseworker-st_cic-senior-caseworker",
        "caseworker-sscs",
        "caseworker-employment"
      ],
      text: "Search"
    },
    {
      active: false,
      align: "right",
      href: "/cases/case-search",
      ngClass: "hmcts-search-toggle__button",
      notFlags: ["feature-global-search"],
      text: "Find case"
    },
    {
      active: false,
      align: "right",
      flags: ["feature-global-search"],
      href: "",
      text: "Find case"
    },
    {
      active: false,
      flags: [],
      href: "/staff",
      roles: ["staff-admin"],
      text: "Staff"
    }
  ]
};

export interface NgIntegrationUserDetailsOptions {
  userId?: string;
  forename?: string;
  surname?: string;
  email?: string;
  roleCategory?: string;
  roles?: string[];
  roleAssignmentInfo?: UnknownRecord[];
}

export interface NgIntegrationEnvironmentConfigOptions {
  accessManagementEnabled?: boolean;
  ccdGatewayUrl?: string;
  headerConfig?: UnknownRecord;
  launchDarklyClientId?: string;
  waWorkflowApi?: string;
}

export interface NgIntegrationBaseRoutesOptions {
  userDetails?: NgIntegrationUserDetailsOptions;
  environmentConfig?: NgIntegrationEnvironmentConfigOptions;
  clientContextFeatureFlags?: Record<string, unknown>;
  skipUserDetailsMock?: boolean;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildNgIntegrationUserDetailsMock(options?: NgIntegrationUserDetailsOptions) {
  const roles = options?.roles ?? ["caseworker-ia-caseofficer", "caseworker-ia-admofficer", "staff-admin", "task-supervisor"];
  const userId = options?.userId ?? "wave2-user-id";

  return {
    sessionTimeout: {
      idleModalDisplayTime: 300,
      totalIdleTime: 900
    },
    canShareCases: false,
    userInfo: {
      id: userId,
      uid: userId,
      forename: options?.forename ?? "Wave2",
      surname: options?.surname ?? "Playwright",
      email: options?.email ?? "wave2.playwright@justice.gov.uk",
      active: true,
      roleCategory: options?.roleCategory ?? "LEGAL_OPERATIONS",
      roles
    },
    roleAssignmentInfo: deepClone(options?.roleAssignmentInfo ?? [])
  };
}

export function buildNgIntegrationAppConfigMock(): UnknownRecord {
  return deepClone(appConfigTemplate);
}

export function buildNgIntegrationEnvironmentConfigMock(
  options?: NgIntegrationEnvironmentConfigOptions
): UnknownRecord {
  return {
    accessManagementEnabled: options?.accessManagementEnabled ?? true,
    ccdGatewayUrl: options?.ccdGatewayUrl ?? "http://localhost:3001",
    clientId: "xui-webapp",
    idamWeb: "https://idam-web-public.aat.platform.hmcts.net",
    launchDarklyClientId: options?.launchDarklyClientId ?? "5de6610b23ce5408280f2268",
    oAuthCallback: "/oauth2/callback",
    oidcEnabled: true,
    protocol: "http",
    waWorkflowApi: options?.waWorkflowApi ?? "/workallocation",
    headerConfig: options?.headerConfig ?? deepClone(headerConfigTemplate)
  };
}

export function buildNgIntegrationClientContextMock(
  featureFlags?: Record<string, unknown>
): UnknownRecord {
  return {
    client_context: {
      feature_flags: {
        MC_Work_Allocation: true,
        MC_Notice_of_Change: true,
        "feature-global-search": true,
        "feature-refunds": true,
        "mc-work-allocation-active-feature": "WorkAllocationRelease2",
        ...featureFlags
      },
      user_language: {
        language: "en"
      }
    }
  };
}

export async function setupNgIntegrationBaseRoutes(
  page: Page,
  options?: NgIntegrationBaseRoutesOptions
): Promise<void> {
  const userDetails = buildNgIntegrationUserDetailsMock(options?.userDetails);
  const appConfig = buildNgIntegrationAppConfigMock();
  const environmentConfig = buildNgIntegrationEnvironmentConfigMock(options?.environmentConfig);
  const clientContext = buildNgIntegrationClientContextMock(options?.clientContextFeatureFlags);

  if (!options?.skipUserDetailsMock) {
    await page.addInitScript(
      ([seededUserInfo, seededClientContext]) => {
        window.sessionStorage.setItem("userDetails", JSON.stringify(seededUserInfo));
        window.sessionStorage.setItem("clientContext", JSON.stringify(seededClientContext));
      },
      [userDetails.userInfo, clientContext]
    );

    await page.route("**/api/user/details*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(userDetails)
      });
    });
  } else {
    await page.addInitScript(([seededClientContext]) => {
      window.sessionStorage.setItem("clientContext", JSON.stringify(seededClientContext));
    }, [clientContext]);
  }

  await page.route("**/assets/config/config.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appConfig)
    });
  });

  await page.route(/\/external\/config\/ui(?:\/|\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(environmentConfig)
    });
  });

  await page.route("**/api/role-access/roles/manageLabellingRoleAssignment/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route("**/api/role-access/roles/access-get-by-caseId*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/wa-supported-jurisdiction/get*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/workallocation/caseworker/getUsersByServiceName*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/prd/judicial/searchJudicialUserByIdamId*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/role-access/roles/getJudicialUsers*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/role-access/roles/get-my-access-new-count*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0 })
    });
  });
}
