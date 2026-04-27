import { expect, test } from "../../../fixtures/ui";
import {
  applySessionCookies,
  openCreateCaseJourney,
  setupCreateCaseBaseRoutes,
  submitCaseAndCaptureRequest
} from "../helpers/index.js";

const userIdentifier = "SOLICITOR";
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";

let interceptedCreateCaseRequestBody: { data?: Record<string, unknown> } | null;

type CreateCaseSubmissionData = {
  TextField0?: string;
  TextField1?: string;
  TextField2?: string;
  TextField3?: string;
  DivorceReason?: string[];
  Person1?: {
    Title?: string;
    FirstName?: string;
    LastName?: string;
    PersonGender?: string;
    PersonJob?: {
      Title?: string;
      Description?: string;
    };
  };
  Person2?: {
    Title?: string;
    FirstName?: string;
    MaidenName?: string;
    LastName?: string;
    PersonGender?: string;
    PersonJob?: {
      Title?: string;
      Description?: string;
    };
  };
};

test.beforeEach(async ({ createCasePage, page }) => {
  await applySessionCookies(page, userIdentifier);
  await setupCreateCaseBaseRoutes(page);
  interceptedCreateCaseRequestBody = null;
  await openCreateCaseJourney(page, createCasePage, { jurisdiction, caseType });
});

test.describe(`Create a ${jurisdiction} case as ${userIdentifier}`, { tag: ["@integration", "@integration-create-case"] }, () => {
  test("All expected fields are filled, seen, and sent in the create case API call", async ({
    caseDetailsPage,
    createCasePage,
    page
  }) => {
    const caseData = await createCasePage.generateDivorcePoCData({ divorceReasons: ["Adultery"] });
    const person1Data = await createCasePage.generateDivorcePoCPersonData({
      gender: "Male"
    });
    const person2Data = await createCasePage.generateDivorcePoCPersonData({
      gender: "Female"
    });

    await test.step("User fills out the form", async () => {
      await createCasePage.fillDivorcePocSections({
        data: [person1Data, person2Data],
        textFields: {
          textField0: caseData.textField0,
          textField1: caseData.textField1,
          textField2: caseData.textField2,
          textField3: caseData.textField3
        },
        divorceReasons: caseData.divorceReasons,
        gender: caseData.gender
      });
    });

    await test.step("Check the answers shown match the entered data", async () => {
      const answerTable = await caseDetailsPage.trRowsToObjectInPage(createCasePage.checkYourAnswers);
      expect(answerTable).toMatchObject({
        "Text Field 0": caseData.textField0,
        "Text Field 1": caseData.textField1,
        "Text Field 2": caseData.textField2,
        "Text Field 3": caseData.textField3,
        "Select your gender": caseData.gender,
        "Choose divorce reasons": caseData.divorceReasons?.[0]
      });

      const person1 = await caseDetailsPage.trRowsToObjectInPage(await createCasePage.findTableInCheckAnswers("Person 1"));
      const person2 = await caseDetailsPage.trRowsToObjectInPage(await createCasePage.findTableInCheckAnswers("Person 2"));

      expect(person1).toMatchObject({
        Title: person1Data.title,
        Gender: person1Data.gender,
        "First Name": person1Data.firstName,
        "Last Name": person1Data.lastName
      });
      expect(person2).toMatchObject({
        Title: person2Data.title,
        Gender: person2Data.gender,
        "First Name": person2Data.firstName,
        "Maiden Name": person2Data.maidenName,
        "Last Name": person2Data.lastName
      });

      const jobSubTable = await caseDetailsPage.trRowsToObjectInPage(await createCasePage.findSubTableInCheckAnswers("Person 1"));
      expect(jobSubTable).toMatchObject({
        Title: person1Data.jobTitle,
        Description: person1Data.jobDescription
      });

      const person2JobSubTable = await caseDetailsPage.trRowsToObjectInPage(
        await createCasePage.findSubTableInCheckAnswers("Person 2")
      );
      expect(person2JobSubTable).toMatchObject({
        Title: person2Data.jobTitle,
        Description: person2Data.jobDescription
      });
    });

    await test.step("Submit the case for creation and capture the request body", async () => {
      interceptedCreateCaseRequestBody = (await submitCaseAndCaptureRequest(page, createCasePage)) as {
        data?: Record<string, unknown>;
      } | null;
    });

    await test.step("Check the JSON sent in the creation request matches the expected data", async () => {
      expect(interceptedCreateCaseRequestBody).toBeTruthy();
      const submittedData = interceptedCreateCaseRequestBody?.data as CreateCaseSubmissionData;
      expect(submittedData).toBeTruthy();
      expect(submittedData.TextField0).toBe(caseData.textField0);
      expect(submittedData.TextField1).toBe(caseData.textField1);
      expect(submittedData.TextField2).toBe(caseData.textField2);
      expect(submittedData.TextField3).toBe(caseData.textField3);
      expect(submittedData.DivorceReason?.[0]).toEqual(caseData.divorceReasons?.[0]?.toLowerCase());

      expect(submittedData.Person1?.Title).toBe(person1Data.title);
      expect(submittedData.Person1?.FirstName).toBe(person1Data.firstName);
      expect(submittedData.Person1?.LastName).toBe(person1Data.lastName);
      expect(submittedData.Person1?.PersonGender).toBe(person1Data.gender?.toLowerCase());
      expect(submittedData.Person1?.PersonJob?.Title).toBe(person1Data.jobTitle);
      expect(submittedData.Person1?.PersonJob?.Description).toBe(person1Data.jobDescription);

      expect(submittedData.Person2?.Title).toBe(person2Data.title);
      expect(submittedData.Person2?.FirstName).toBe(person2Data.firstName);
      expect(submittedData.Person2?.MaidenName).toBe(person2Data.maidenName);
      expect(submittedData.Person2?.LastName).toBe(person2Data.lastName);
      expect(submittedData.Person2?.PersonGender).toBe(person2Data.gender?.toLowerCase());
      expect(submittedData.Person2?.PersonJob?.Title).toBe(person2Data.jobTitle);
      expect(submittedData.Person2?.PersonJob?.Description).toBe(person2Data.jobDescription);
    });
  });

  test("Creating a case with hidden and omitted fields, shows the expected answers and JSON request body", async ({
    caseDetailsPage,
    createCasePage,
    page
  }) => {
    const caseData = await createCasePage.generateDivorcePoCData({
      textField0: "Hide all",
      divorceReasons: ["Adultery"]
    });
    const person1Data = await createCasePage.generateDivorcePoCPersonData({
      gender: "Male"
    });

    await test.step("User fills out the case pages", async () => {
      await createCasePage.fillDivorcePocSections({
        data: person1Data,
        textFields: {
          textField0: caseData.textField0,
          textField1: caseData.textField1,
          textField2: caseData.textField2,
          textField3: caseData.textField3
        },
        gender: caseData.gender
      });
    });

    await test.step("Check the answers shown match the expected visible fields", async () => {
      const table = await caseDetailsPage.trRowsToObjectInPage(createCasePage.checkYourAnswersTable);
      expect(table).toMatchObject({
        "Text Field 0": caseData.textField0,
        "Text Field 3": caseData.textField3
      });
      expect(table).not.toHaveProperty("Text Field 1");
      expect(table).not.toHaveProperty("Text Field 2");
      expect(table).not.toHaveProperty("Select your gender");
      expect(table).not.toHaveProperty("Choose divorce reasons");

      const jobSubTable = await caseDetailsPage.trRowsToObjectInPage(await createCasePage.findSubTableInCheckAnswers("Person 1"));
      expect(jobSubTable).toMatchObject({
        Title: person1Data.jobTitle,
        Description: person1Data.jobDescription
      });
    });

    await test.step("Submit the case for creation and capture the request body", async () => {
      interceptedCreateCaseRequestBody = (await submitCaseAndCaptureRequest(page, createCasePage)) as {
        data?: Record<string, unknown>;
      } | null;
    });

    await test.step("Check the JSON sent in the creation request matches the expected data, and no omitted items are sent", async () => {
      expect(interceptedCreateCaseRequestBody).toBeTruthy();

      const submittedData = interceptedCreateCaseRequestBody?.data as CreateCaseSubmissionData;
      expect(submittedData).toBeTruthy();
      expect(submittedData.TextField0).toBe(caseData.textField0);
      expect(submittedData.TextField2).toBe(caseData.textField2);
      expect(submittedData.TextField3).toBe(caseData.textField3);

      expect(submittedData.Person1?.Title).toBe(person1Data.title);
      expect(submittedData.Person1?.FirstName).toBe(person1Data.firstName);
      expect(submittedData.Person1?.LastName).toBe(person1Data.lastName);
      expect(submittedData.Person1?.PersonGender).toBe(person1Data.gender?.toLowerCase());
      expect(submittedData.Person1?.PersonJob?.Title).toBe(person1Data.jobTitle);
      expect(submittedData.Person1?.PersonJob?.Description).toBe(person1Data.jobDescription);
      expect(submittedData).not.toHaveProperty("DivorceReason");
      expect(submittedData).not.toHaveProperty("TextField1");
    });
  });
});
