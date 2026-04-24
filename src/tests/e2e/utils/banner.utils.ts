import { expect } from "@playwright/test";

const normalizeCaseReference = (value: string): string => value.replace(/\D/g, "");

export const caseBannerMatches = (
  bannerText: string,
  caseNumber: string,
  expectedMessage: string
): boolean => {
  const normalizedBanner = bannerText.replaceAll(/\s+/g, " ").trim();
  const normalizedCaseNumber = normalizeCaseReference(caseNumber);
  const bannerDigits = normalizeCaseReference(normalizedBanner);

  return (
    normalizedBanner.includes(expectedMessage) &&
    normalizedCaseNumber.length > 0 &&
    bannerDigits.includes(normalizedCaseNumber)
  );
};

export const expectCaseBanner = (
  bannerText: string,
  caseNumber: string,
  expectedMessage: string
): void => {
  expect(caseBannerMatches(bannerText, caseNumber, expectedMessage)).toBe(true);
};
