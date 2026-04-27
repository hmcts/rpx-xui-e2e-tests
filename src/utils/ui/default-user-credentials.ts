import { resolveTestEnv } from "../../config/api.js";

import type { UserCredentials } from "./user.utils.js";

type SupportedEnv = "aat" | "demo";

const SOURCE_COMPAT_DEFAULT_USERS: Record<SupportedEnv, Record<string, UserCredentials>> = {
  aat: {
    SOLICITOR: {
      email: "xui_auto_test_user_solicitor@mailinator.com",
      password: "Monday01"
    },
    DIVORCE_SOLICITOR: {
      email: "xui_auto_test_user_solicitor@mailinator.com",
      password: "Monday01"
    },
    CASEWORKER_GLOBALSEARCH: {
      email: "exuigsuser@mailinator.com",
      password: "Welcome01"
    },
    WA2_GLOBAL_SEARCH: {
      email: "exuigsuser@mailinator.com",
      password: "Welcome01"
    },
    FPL_GLOBAL_SEARCH: {
      email: "fpl-ctsc-admin@justice.gov.uk",
      password: "Password12"
    },
    STAFF_ADMIN: {
      email: "xui_caseofficer@justice.gov.uk",
      password: "Welcome01"
    },
    SEARCH_EMPLOYMENT_CASE: {
      email: "employment_service@mailinator.com",
      password: "Nagoya0102"
    },
    USER_WITH_FLAGS: {
      email: "henry_fr_harper@yahoo.com",
      password: "Nagoya0102"
    },
    RESTRICTED_CASE_FILE_VIEW_ON: {
      email: "xui_casefileview_v11_on@mailinator.com",
      password: "Welcome01"
    },
    RESTRICTED_CASE_FILE_VIEW_OFF: {
      email: "xui_casefileview_v11_off@mailinator.com",
      password: "Welcome01"
    },
    RESTRICTED_CASE_ACCESS_ON: {
      email: "xui_restricted_case_access_on@mailinator.com",
      password: "Welcome01"
    },
    RESTRICTED_CASE_ACCESS_OFF: {
      email: "xui_restricted_case_access_off@mailinator.com",
      password: "Welcome01"
    },
    "BOOKING_UI-FT-ON": {
      email: "49932114EMP-@ejudiciary.net",
      password: "Hmcts1234"
    },
    HEARING_MANAGER_CR84_ON: {
      email: "xui_hearing_manager_cr84_on@justice.gov.uk",
      password: "Monday01"
    },
    HEARING_MANAGER_CR84_OFF: {
      email: "xui_hearing_manager_cr84_off@justice.gov.uk",
      password: "Monday01"
    }
  },
  demo: {
    SOLICITOR: {
      email: "lukesuperuserxui_new@mailnesia.com",
      password: "Monday01"
    },
    DIVORCE_SOLICITOR: {
      email: "lukesuperuserxui_new@mailnesia.com",
      password: "Monday01"
    },
    CASEWORKER_GLOBALSEARCH: {
      email: "CRD_func_test_demo_stcw@justice.gov.uk",
      password: "AldgateT0wer"
    },
    FPL_GLOBAL_SEARCH: {
      email: "CRD_func_test_demo_stcw@justice.gov.uk",
      password: "AldgateT0wer"
    },
    STAFF_ADMIN: {
      email: "xui_caseofficer@justice.gov.uk",
      password: "Welcome01"
    }
  }
};

const SOURCE_COMPAT_DEFAULT_FIRST_USERS = new Set([
  "SOLICITOR",
  "CASEWORKER_GLOBALSEARCH",
  "WA2_GLOBAL_SEARCH",
  "FPL_GLOBAL_SEARCH",
  "STAFF_ADMIN",
  "SEARCH_EMPLOYMENT_CASE",
  "USER_WITH_FLAGS",
  "RESTRICTED_CASE_FILE_VIEW_ON",
  "RESTRICTED_CASE_FILE_VIEW_OFF",
  "RESTRICTED_CASE_ACCESS_ON",
  "RESTRICTED_CASE_ACCESS_OFF",
  "BOOKING_UI-FT-ON",
  "HEARING_MANAGER_CR84_ON",
  "HEARING_MANAGER_CR84_OFF"
]);

export function resolveDefaultUserCredentials(
  userIdentifier: string,
  env: NodeJS.ProcessEnv = process.env
): UserCredentials | undefined {
  const normalizedUserIdentifier = userIdentifier.trim().toUpperCase();
  const supportedEnv = resolveTestEnv(env.TEST_ENV);
  return SOURCE_COMPAT_DEFAULT_USERS[supportedEnv][normalizedUserIdentifier];
}

export function shouldPreferDefaultUserCredentials(userIdentifier: string): boolean {
  return SOURCE_COMPAT_DEFAULT_FIRST_USERS.has(userIdentifier.trim().toUpperCase());
}
