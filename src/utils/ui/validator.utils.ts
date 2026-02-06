import { expect } from "@playwright/test";

export class ValidatorUtils {
  public DIVORCE_CASE_NUMBER_REGEX = /#?\d{4}-?\d{4}-?\d{4}-?\d{4}/;
  public EMPLOYMENT_CASE_NUMBER_REGEX = /(\d+\/\d+)/;

  public validateDivorceCaseNumber(caseNumber: string) {
    expect(caseNumber).toMatch(this.DIVORCE_CASE_NUMBER_REGEX);
  }
}
