import { expect } from "@playwright/test";

export class ValidatorUtils {
  public DIVORCE_CASE_NUMBER_REGEX = /^#\d{4}-\d{4}-\d{4}-\d{4}$/;

  public validateDivorceCaseNumber(caseNumber: string) {
    expect(caseNumber).toMatch(this.DIVORCE_CASE_NUMBER_REGEX);
  }
}
