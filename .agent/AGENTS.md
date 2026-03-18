# 🧠 HMCTS Agents Manifest

This handbook defines His Majesty’s Courts and Tribunals Service (HMCTS) standards for developing and operating AI-powered agents, copilots, and automations. It aligns with the HMCTS Responsible Technology Principles, the Ministry of Justice (MoJ) security baseline, and cross-government AI guidance. All contributors must follow this guidance before enabling any agent (e.g., GitHub Copilot, OpenAI assistants, Anthropic Claude, Microsoft Copilot, bespoke GPTs) within HMCTS delivery environments.

---

## 1. Overview

- Ensure every AI capability is operated within approved HMCTS environments and upholds legal, privacy, and security obligations.
- Require full traceability: prompts, outputs, and deployment decisions must be attributable, reviewable, and auditable.
- Embed responsible AI controls into everyday engineering practice, including this Playwright test project.

---

## 2. Agent Categories

| Category              | Description                                                                           | Example Tools                                            | Access Level                |
| --------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------- |
| **Code Agents**       | Accelerate delivery through code generation, refactoring, tests, and static analysis. | GitHub Copilot, OpenAI Assistants, Cursor AI             | Engineering teams           |
| **Knowledge Agents**  | Summarise policy, surface documentation, and answer procedural queries.               | ChatGPT Enterprise, Microsoft Copilot, Custom HMCTS GPTs | HMCTS staff                 |
| **Operations Agents** | Automate CI/CD, monitoring, incident triage, and infrastructure tasks.                | Azure Copilot, GitHub Actions Bots, PagerDuty AI         | DevOps / SRE                |
| **Domain Agents**     | Provide domain-specific reasoning (case management, analytics, accessibility).        | Power Platform Copilot, bespoke MoJ GPTs                 | Business & Functional units |

---

## 3. HMCTS Core Governance Principles

### 3.1 Security

- Agents operate only on HMCTS-managed infrastructure (MoJ Cloud Platform, Azure, or accredited on-prem).
- Never transmit restricted data, client materials, or live case details to public endpoints.
- Secrets stored in Azure Key Vault or MoJ Key Management Service; environment variables redacted in prompts.
- Apply HMCTS data classification, redaction, and prompt sanitisation before model submission.
- All outbound model calls traverse approved Secure API Gateways; direct internet egress for agents is prohibited.

### 3.2 Privacy & Compliance

- Comply with UK GDPR, Data Protection Act 2018, ISO 27001, and MoJ Security Policy.
- Prefer enterprise contracts: Azure OpenAI, MoJ-approved Anthropic tenancy, or MoJ-hosted LLMs.
- Retain logs in accordance with MoJ retention schedules; ensure outputs are auditable.
- Respect regional hosting constraints and client contractual obligations.

### 3.3 Transparency

- Attribute AI assistance in code, documentation, and change logs, e.g.
  ```bash
  git commit -m "feat: add case filter helper [Generated with HMCTS AI Assistant v1]"
  ```
- Record prompts, responses, and reasoning steps in Azure Monitor / Log Analytics (or approved log stores).
- Maintain agent model cards outlining data sources, fine-tuning history, risk mitigations, and owners.

### 3.4 Human Oversight

- No AI-generated artefact reaches production without human review (code review, test evidence, or SME sign-off).
- CI pipelines must gate AI-originated changes with manual approval steps.
- Agents executing autonomously use scoped service identities following least-privilege and managed identity patterns.

### 3.5 Responsible AI & Ethics

- Adhere to HMCTS Responsible Technology Principles: fairness, accountability, transparency, privacy, and safety.
- Complete an HMCTS AI Risk Assessment before go-live; reassess on major updates.
- Disallow outputs that are discriminatory, misleading, or intended to bypass compliance controls.

---

## 4. Implementation Standards

### 4.1 Configuration Guidelines

- Limit prompt context to the minimum viable data; explicitly scrub PII and restricted materials.
- Scope access via Azure AD / MoJ RBAC groups; rotate secrets and tokens regularly.
- Track model configuration, prompt templates, and evaluation results in Azure DevOps or GitHub Projects.
- Apply existing Data Loss Prevention (DLP) and classification tooling to AI chat and log streams.

### 4.2 Audit & Traceability

- Attach metadata to every AI-generated asset:
  - `agent_name`, `version`, `prompt_id`, `reviewer`, `timestamp`, `audit_reference`.
- Send logs to Microsoft Sentinel (or designated SIEM) for **minimum 7-year retention** unless policy dictates longer.
- Provide audit trails linking commits, test evidence, and deployment tickets back to originating prompts.

### 4.3 Integration Architecture

- Route all agent traffic through HMCTS-secured gateways; no unmanaged outbound connectivity.
- Authenticate via Azure AD; enforce conditional access and multifactor safeguards.
- Prefer Azure OpenAI, MoJ Anthropic tenancy, or HMCTS-hosted LLMs; justify any alternative via governance review.

---

## 5. HMCTS AI Governance Framework

| Layer        | Description                                                                  | Owner                                  |
| ------------ | ---------------------------------------------------------------------------- | -------------------------------------- |
| **Policy**   | Defines Responsible AI standards, risk appetite, and compliance controls.    | HMCTS Digital Governance Board         |
| **Platform** | Operates secure infrastructure, networking, and monitoring for AI workloads. | MoJ Cloud Engineering & Cyber Security |
| **Usage**    | Oversees departmental adoption, training, and operational guardrails.        | HMCTS Product & Delivery Leads         |
| **Audit**    | Performs independent reviews, red-teaming, and continuous risk assessment.   | HMCTS Internal Audit & Assurance       |

---

## 6. Developer & Operator Best Practices

### ✅ Do

- Use only HMCTS-approved tools, tenants, and model endpoints.
- Apply structured prompt templates; log prompt IDs and scenarios.
- Annotate AI-generated code and include reviewer sign-off in pull requests.
- Use a plan-review-build loop: create a plan, implement changes, run required unit tests, and repeat reviews until code and tests pass and meet HMCTS standards and development practices.
- Write tests that communicate behavior clearly; name things precisely and keep assertions visible.
- Run `yarn lint`, `yarn test:*`, and capture Playwright reports (HTML, Odhín, JUnit) for evidence.
- Complete HMCTS AI Safety & Prompt Engineering training modules annually.

### ❌ Don’t

- Expose client data, credentials, or unreleased legal content to models.
- Use personal AI accounts or unapproved SaaS extensions.
- Allow agents to push directly to `main`/`master` branches or production environments.
- Disable telemetry, redact audit trails, or bypass manual review gates.

### 6.1 Playwright Test Automation Standards

**Locator Strategy Hierarchy (Aspirational vs Current Reality):**

**⭐ ASPIRATIONAL STANDARD:** Test IDs (`data-testid`, `data-test-id`) should be the primary locator strategy for maximum test stability and maintainability.

**🚧 CURRENT REALITY:** Many HMCTS applications (especially CCD-based pages) **do not yet have test IDs implemented**. This is recognized as technical debt and a long-term improvement goal.

**Pragmatic Locator Priority Order:**

1. **Test IDs (PREFERRED - USE WHEN AVAILABLE)** – Use `data-testid`, `data-test-id`, or semantic `id` attributes:

   ```ts
   // ✅ Ideal - test ID (rare in CCD pages currently)
   page.getByTestId("submit-button");
   page.locator('[data-testid="case-reference-input"]');
   page.locator("#user-email-field"); // if semantic and stable
   ```

2. **ARIA Roles & Accessible Attributes (CURRENT BEST PRACTICE)** – Use semantic/accessible locators as primary strategy:

   ```ts
   // ✅ Current best practice - semantic/accessible
   page.getByRole("button", { name: "Submit" });
   page.getByRole("heading", { name: "Case Details" });
   page.getByLabel("Email address");
   page.getByPlaceholder("Enter case reference");
   ```

3. **Stable CSS Selectors & Element IDs (ACCEPTABLE)** – Use when ARIA attributes insufficient:

   ```ts
   // ✅ Acceptable - stable selectors
   page.locator("#next-step"); // CCD action dropdown
   page.locator("#cc-jurisdiction"); // CCD jurisdiction select
   page.locator(".govuk-button"); // GOV.UK Design System classes
   ```

4. **CSS Classes with Fallbacks (USE WITH CAUTION)** – Document brittleness and provide fallbacks:

   ```ts
   // ⚠️ Fragile but necessary - use fallbacks
   page.locator(
     ".hmcts-banner--success .alert-message, .exui-alert .alert-message",
   );
   page.locator(".event-trigger button");
   ```

5. **XPath or Text Content (LAST RESORT)** – Avoid unless no alternative exists:
   ```ts
   // ❌ Last resort only - brittle and slow
   page.locator('xpath=//div[@class="container"]//button[1]');
   page.locator("text=Click here");
   ```

**Implementation Requirements:**

- **Prioritize test IDs when they exist** – Check the DOM first; if test IDs are present, use them
- **Default to ARIA roles** – For CCD and legacy pages without test IDs, use `getByRole()`, `getByLabel()`, etc.
- **Use stable element IDs** – CCD form field IDs (`#TextField`, `#cc-jurisdiction`) are acceptable and stable
- **Document fragile selectors** – Add comments explaining why CSS classes are used and any known brittleness
- **Advocate for test IDs** – Raise awareness in planning/refinement that test IDs improve quality, but **don't block delivery**
- **No TODO comments for missing test IDs** – Accept current reality; don't litter code with aspirational TODOs that won't be actioned

**Example Page Object (CCD Reality):**

```ts
export class CaseDetailsPage {
  constructor(private page: Page) {}

  // ✅ CCD provides stable element IDs - use them
  readonly caseActionsDropdown = this.page.locator("#next-step");
  readonly caseActionGoButton = this.page.locator(".event-trigger button");

  // ✅ ARIA roles work well for GOV.UK components
  readonly continueButton = this.page.getByRole("button", { name: "Continue" });
  readonly submitButton = this.page.getByRole("button", { name: "Submit" });

  // ⚠️ Banner has no test ID or role - use class fallbacks
  readonly caseAlertSuccessMessage = this.page
    .locator(
      ".hmcts-banner--success .alert-message, .exui-alert .alert-message",
    )
    .first();

  async selectCaseAction(action: string) {
    await this.caseActionsDropdown.selectOption(action);
    await this.caseActionGoButton.click();
  }
}
```

**AI Agent Responsibilities:**

- **Inspect the actual DOM** before generating selectors – check for test IDs, ARIA roles, and element IDs
- **Prefer semantic locators** (`getByRole`, `getByLabel`) over CSS classes when both are available
- **Use stable CCD patterns** – recognize common CCD field IDs (`#cc-jurisdiction`, `#TextField0`, etc.) as acceptable
- **Don't generate unrealistic TODO comments** – if test IDs don't exist in the application, use the next best strategy without aspirational comments
- **Document intentionally** – explain why a selector is fragile if using CSS classes, but don't imply it will change soon

---

### 6.2 Playwright Test Development Best Practices

**Derived from PR #4913 review feedback - lessons learned to prevent recurring issues.**

#### 6.2.1 Code Organization & Reusability

**🎯 RULE: No inline helper functions in test files**

❌ **WRONG:**

```ts
// test/myTest.spec.ts
test("example", async () => {
  // ❌ Inline helper - not reusable
  const isEmptyRow = (row: Record<string, string>) => {
    return !Object.values(row).join("").trim();
  };
  const filtered = table.filter(isEmptyRow);
});
```

✅ **CORRECT:**

```ts
// utils/table.utils.ts
export function filterEmptyRows(table: Record<string, string>[]) {
  return table.filter((row) => !Object.values(row).join("").trim());
}

// test/myTest.spec.ts
import { filterEmptyRows } from "../../utils";
test("example", async () => {
  const filtered = filterEmptyRows(table);
});
```

**Where to put reusable code:**

- **Regex patterns & validation logic** → `utils/validator.utils.ts`
- **Date formatting & matching** → `utils/date.utils.ts`
- **Table filtering & parsing** → `utils/table.utils.ts`
- **Banner validation** → `utils/banner.utils.ts`
- **Mock data builders** → `integration/mocks/*.mock.ts`

#### 6.2.2 Case Number Extraction Pattern

**🎯 RULE: Always extract case numbers from URL (not banners/alerts)**

❌ **WRONG:**

```ts
// ❌ Conditional logic with fallbacks - brittle and complex
const alertVisible = await page
  .locator(".alert")
  .isVisible()
  .catch(() => false);
if (alertVisible) {
  caseNumber = await getCaseNumberFromAlert();
} else {
  caseNumber = await getCaseNumberFromUrl();
}
```

✅ **CORRECT:**

```ts
// ✅ URL is authoritative, always present, no race conditions
// Always collect case number from URL for consistency
caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
```

**Rationale:**

- **URL is authoritative** - browser navigated using it
- **Always available** - no visibility race conditions
- **Consistent format** - 16 digits, predictable parsing
- **Eliminates flakiness** - no polling for banner appearance

#### 6.2.3 Mock Data Organization

**🎯 RULE: Mock data belongs in dedicated mock files, not test files**

❌ **WRONG:**

```ts
// test/caseList.spec.ts
const mockData = [  // ❌ Inline mock in test
  { id: 'DIVORCE', name: 'Family Divorce', caseTypes: [...] }
];
```

✅ **CORRECT:**

```ts
// integration/mocks/caseList.mock.ts
export function buildCaseListJurisdictionsMock() {
  return [
    { id: 'DIVORCE', name: 'Family Divorce', caseTypes: [...] }
  ];
}

// test/caseList.spec.ts
import { buildCaseListJurisdictionsMock } from '../../mocks/caseList.mock';
const mockData = buildCaseListJurisdictionsMock();
```

**Benefits:**

- ✅ Reusable across multiple test files
- ✅ Centralized maintenance
- ✅ Easier to version mock data
- ✅ Clear separation of concerns

#### 6.2.4 Assertion Strategy

**🎯 RULE: Use expect.soft() for non-blocking validations**

❌ **WRONG:**

```ts
// ❌ Hard assertion blocks test execution
await expect(banner).toBeVisible();
await expect.poll(() => bannerText).toContain(caseNumber);
```

✅ **CORRECT:**

```ts
// ✅ Soft assertion allows test to continue
await expect.soft(banner).toBeVisible(); // Non-blocking
await expect.poll(() => bannerText).toContain(caseNumber); // Real validation
```

**When to use expect.soft():**

- Visibility checks when subsequent polls verify content
- Pre-conditions that help debugging but aren't critical
- Multiple assertions where you want to see all failures

**When NOT to use expect.soft():**

- Final verification assertions
- Security/authorization checks
- Data integrity validations

#### 6.2.5 Date/Time Handling

**🎯 RULE: Extract date regex and formatting logic to utilities**

❌ **WRONG:**

```ts
// ❌ Complex inline date matching
const expectedDate = new Date().toLocaleDateString('en-GB');
const longDateMatch = updateDate.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/);
const numericMatch = updateDate.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
const normalizeLongDate = (value: string) => { /* 10 lines */ };
const dateMatches = normalizeLongDate(longDateMatch?.[0]) === expectedDate || ...;
```

✅ **CORRECT:**

```ts
// utils/date.utils.ts
export function getTodayFormats() {
  return {
    longFormat: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    numericFormat: new Date().toLocaleDateString("en-GB"),
  };
}

export function matchesToday(
  dateString: string,
  expectedLong: string,
  expectedNumeric: string,
): boolean {
  const updateDateOnly = extractDateOnly(dateString);
  return (
    normalizeLongDate(updateDateOnly) === expectedLong ||
    updateDateOnly === expectedNumeric ||
    dateString.includes(expectedLong)
  );
}

// test file
const { numericFormat } = getTodayFormats();
const dateMatches = matchesToday(updateDate, expectedDate, numericFormat);
```

#### 6.2.6 Page Object Rules

**🎯 RULE: Minimal assertions in Page Objects - prefer defensive validation**

❌ **AVOID (but justified if defensive):**

```ts
// Page Object method
async clickContinue() {
  await expect(this.button).toBeVisible();  // ⚠️ Test assertion in PO
  await this.button.click();
}
```

✅ **ACCEPTABLE (defensive validation):**

```ts
// Page Object method
private async clickContinueAndWait() {
  await this.continueButton.waitFor({ state: 'visible' });
  await expect(this.continueButton).toBeEnabled();  // ✅ Defensive check prevents flaky failures
  await this.continueButton.click();
}
```

✅ **PREFERRED (no assertions):**

```ts
// Page Object method
async clickContinue() {
  await this.button.waitFor({ state: 'visible' });
  await this.button.scrollIntoViewIfNeeded();
  await this.button.click();
}

// Test file handles assertions
await expect(page.continueButton).toBeEnabled();
await page.clickContinue();
```

**When assertions in POs are acceptable:**

- **Defensive state validation** before risky operations (CCD form navigation)
- **Private helper methods** not exposed to tests
- **Complex UI workflows** where invalid state causes misleading failures

**Always document justification:**

```ts
// ✅ Defensive check prevents false-negative test failures in CCD workflows
await expect(this.continueButton).toBeEnabled();
```

#### 6.2.7 Step Naming Conventions

**🎯 RULE: Step names must accurately describe assertions**

❌ **WRONG:**

```ts
await test.step("Check there are no flags", async () => {
  const rows = filterEmptyRows(table);
  expect(rows.length).toBeGreaterThanOrEqual(0); // ❌ Allows flags!
});
```

✅ **CORRECT:**

```ts
await test.step("Record existing case level flags", async () => {
  const rows = filterEmptyRows(table);
  expect(rows.length).toBeGreaterThanOrEqual(0); // ✅ Name matches assertion
});
```

**Naming guidelines:**

- **Describe what you're doing**, not what you expect
- **Match assertion logic** - if you accept ≥0, don't say "no flags"
- Use verbs: "Record", "Verify", "Update", "Create", "Validate"

#### 6.2.8 Timeout Management

**🎯 RULE: Avoid explicit timeouts unless necessary**

❌ **WRONG:**

```ts
await expect(element).toBeVisible({ timeout: 60000 }); // ❌ Redundant
await expect.poll(() => text, { timeout: 60000 }).toContain("value");
```

✅ **CORRECT:**

```ts
await expect(element).toBeVisible(); // ✅ Uses Playwright defaults
await expect.poll(() => text).toContain("value");
```

**When explicit timeouts ARE needed:**

- Known slow operations (external API calls, large file uploads)
- CCD event transitions (state machine delays)
- Document WHY: `{ timeout: 45000 }  // CCD state transition can take 30-40s`

#### 6.2.9 Utility Function Design Patterns

**✅ GOOD utility characteristics:**

```ts
// ✅ Pure function, single responsibility
export function normalizeCaseNumber(raw: string): string {
  return raw.replaceAll(/\D/g, "");
}

// ✅ Descriptive name, clear purpose
export function filterEmptyRows(
  table: Record<string, string>[],
): Record<string, string>[] {
  return table.filter((row) => !isEmptyTableRow(row));
}

// ✅ Composable, reusable
export function caseBannerMatches(
  bannerText: string,
  caseNumber: string,
  expectedMessage: string,
): boolean {
  const { digits, message } = getCaseBannerInfo(bannerText);
  return (
    digits.includes(normalizeCaseNumber(caseNumber)) &&
    message.includes(expectedMessage)
  );
}
```

**❌ AVOID:**

- God functions doing multiple things
- Functions tightly coupled to specific tests
- Over-abstraction (utilities wrapping single-line operations)
- Unclear naming (`doStuff`, `helper1`, `checkIt`)

#### 6.2.10 Avoiding Defensive Overengineering

**🎯 RULE: Inline-first approach - only extract helpers when genuinely reusable**

**Background:** PR #4913 review identified 180+ lines of overengineered auto-advance complexity created by overzealous Sonar compliance. Stages 1 & 2 refactoring removed 122 lines (~10% of file), deleting 19 unnecessary helper methods.

**What Caused the Overengineering:**

1. **Metric Gaming** - Sonar flagged `typescript:S3776` (complexity > 15)
   - Response: "split into helpers" → created 13 fragmented methods
   - Problem: Optimized for metric, not maintainability

2. **Premature Abstraction** - Each small operation got its own method
   - `shouldStopSubmitPolling()` - 3 lines (just `remainingMs <= 1500`)
   - `getMaxAutoAdvanceAttempts()` - 5 lines (simple calculation)
   - Problem: Abstraction for abstraction's sake

3. **Defensive Progress Tracking** - Solved problems that didn't exist
   - Added `getWizardProgressSignature()` for stall detection
   - Used URL + heading comparison to detect "stalled" auto-advances
   - Problem: Never observed stalled wizards in practice

**The Refactoring Solution:**

**Before (Complex - 220 lines):**

```ts
// ❌ Main method + 13 helper methods across 220 lines
type SubmitLoopState = {
  autoAdvanceAttempts: number;
  stalledAutoAdvanceAttempts: number;
  lastProgressSignature: string;
};

async clickSubmitAndWait(context, options) {
  const state: SubmitLoopState = {
    autoAdvanceAttempts: 0,
    maxAutoAdvanceAttempts: this.getMaxAutoAdvanceAttempts(timeoutMs),
    stalledAutoAdvanceAttempts: 0,
    lastProgressSignature: await this.getWizardProgressSignature()
  };
  const btn = await this.findSubmitButtonWithAutoAdvance(context, timeoutMs, deadline, pollMs, state);
  await this.clickSubmitButtonWithRetry(btn, context, timeoutMs);
}
// + findSubmitButtonWithAutoAdvance (30 lines)
// + attemptAutoAdvanceCycle (25 lines)
// + handleAutoAdvanceProgress (24 lines)
// + tryAutoAdvanceToSubmit (35 lines)
// + clickSubmitButtonWithRetry (30 lines)
// + getWizardProgressSignature (12 lines)
// + 7 more tiny helpers (3-12 lines each)
```

**After (Simple - 120 lines):**

```ts
// ✅ Self-contained method, all logic visible in one place
async clickSubmitAndWait(context, options = {}) {
  const timeoutMs = options.timeoutMs ?? this.getRecommendedTimeoutMs();
  const deadline = Date.now() + Math.min(90000, Math.floor(timeoutMs * 0.5));
  const maxAutoAdvances = Math.max(2, Math.min(10, Math.floor(timeoutMs / 15000)));
  let autoAdvanceCount = 0;

  while (Date.now() < deadline) {
    const submitButton = await this.getVisibleSubmitButton();
    if (submitButton) {
      try {
        await submitButton.click({ timeout: timeoutMs });
      } catch (error) {
        if (errorMsg.includes('intercepts pointer events')) {
          await submitButton.click({ force: true, timeout: timeoutMs });
        }
      }
      await this.waitForSpinnerToComplete(`after ${context}`, timeoutMs);
      return;
    }

    // Auto-advance if Continue visible
    if (continueVisible && continueEnabled && autoAdvanceCount < maxAutoAdvances) {
      autoAdvanceCount++;
      await this.clickContinueAndWait(`auto-advance ${autoAdvanceCount}`, { timeoutMs: 12000 });
      continue;
    }

    await this.page.waitForTimeout(500);
  }
  throw new Error(`Timeout waiting for submit button before ${context}`);
}
```

**What Changed:**

- ✅ **Net -103 lines** (220 → 120 lines)
- ✅ **13 helper methods deleted** - all logic inlined
- ✅ **Simple counter variable** - no SubmitLoopState object
- ✅ **No progress tracking** - removed URL+heading stall detection
- ✅ **Inline retry logic** - no clickSubmitButtonWithRetry helper
- ✅ **Clear control flow** - single while loop, obvious exit conditions

**Guidelines: When to Inline vs Extract**

✅ **DO Inline:**

- **Simple calculations** - `Math.max(2, Math.min(10, Math.floor(timeoutMs / 15000)))`
- **Configuration constants** - declare at method start
- **Retry logic** - if-try-catch blocks for single operations
- **State tracking** - simple counter variables vs complex objects
- **Logic used once** - if only one caller, keep it inline

❌ **DO Extract (to helper/utility):**

- **Truly reusable logic** - used by 3+ different methods/tests
- **Complex domain logic** - case number extraction, date parsing
- **Test utilities** - validation helpers shared across test files
- **Complex regex patterns** - banner parsing, date matching

**Practical Rules of Thumb:**

| Scenario                              | Recommendation         | Rationale                       |
| ------------------------------------- | ---------------------- | ------------------------------- |
| **3-5 line calculation**              | Inline at method start | Extraction adds no value        |
| **Try-catch retry for one operation** | Inline                 | Flow is clearer without jumping |
| **State with 1-2 variables**          | Simple counter/boolean | No need for type/object         |
| **Operation used in 1 place**         | Inline                 | Premature abstraction           |
| **Logic repeated 3+ times**           | Extract to helper      | Real reusability                |
| **Complex parsing (10+ lines)**       | Extract to utility     | Testable in isolation           |
| **Method > 150 lines**                | Consider splitting     | But prefer inline-first         |

**Sonar Complexity Warnings - When to Ignore:**

Sonar `typescript:S3776` (cognitive complexity > 15) is a **guideline, not law**:

✅ **Acceptable to ignore when:**

- Method is self-contained and readable (one clear purpose)
- Splitting would fragment clear control flow
- Logic is linear (polling loop with simple branches)
- Alternative is 10+ tiny helpers that obscure flow

❌ **Should refactor when:**

- Method does multiple unrelated things
- Nested loops with complex conditions
- Business logic mixed with retry/polling infrastructure
- Test failures are hard to debug due to method jumping

**Documentation Pattern for High-Complexity Methods:**

When keeping a method >15 cognitive complexity, add clear documentation:

```ts
/**
 * Click Submit button with auto-advance through multi-page wizards
 *
 * CCD wizards can have variable page counts before Submit appears.
 * This method automatically clicks Continue until Submit is visible.
 *
 * **Auto-Advance Strategy:**
 * - Poll for Submit button (every 500ms)
 * - If not found after 5s → click Continue (wizard has more pages)
 * - Repeat until Submit appears or timeout
 * - Max auto-advances: 2-10 based on timeout (prevents infinite loops)
 *
 * **Known CCD Issues Handled:**
 * - Submit button takes time to appear after last Continue
 * - Spinner overlay blocks Submit click (retry with force)
 * - Event creation failures (error banner check)
 */
async clickSubmitAndWait(context: string, options = {}) {
  // Implementation stays inline despite Sonar warning
}
```

**Lessons from 122-Line Reduction:**

1. **Sonar warnings aren't dogma** - 120-line self-contained method beats 220 lines split across 14 methods
2. **Inline calculations** - `Math.max(2, Math.min(10, ...))` is fine, no need for `getMaxAutoAdvances()`
3. **Simple state** - One counter variable beats SubmitLoopState with 4 fields
4. **Clear > clever** - Obvious while loop beats state-machine with progress signatures
5. **Document intent** - JSDoc explains why method is complex, no apology for Sonar warning

**When Refactoring Existing Code:**

Ask these questions before extracting helpers:

1. **Is this logic used elsewhere?** - If no, inline it
2. **Does extraction improve readability?** - Often it makes flow harder to follow
3. **Am I solving a real problem?** - Or gaming metrics / being "defensive"?
4. **Would I understand this in 6 months?** - Inline is often clearer
5. **Does Sonar warning matter?** - Not if method is self-contained and readable

**Real-World Impact:** Stages 1 & 2 refactoring of `createCase.po.ts`:

- **Before:** 1,113 lines, 20+ fragmented methods, complex state machines
- **After:** 1,002 lines (-10%), 19 methods deleted, clear inline logic
- **Risk:** VERY LOW - preserved all functionality, zero breaking changes
- **Tests:** 100% pass rate (Stage 1), environmental timeout only (Stage 2)

#### 6.2.11 PR #4807 Review-Derived Guardrails

**🎯 RULE: Close recurring review gaps before PR review, not after it**

**Selector and Locator Rules:**

- Prefer stable test IDs and semantic IDs first.
- For EXUI search/find/case-list pages, prefer stable CSS class/ID selectors over natural-language selectors when both are available.
- Avoid XPath selectors; use CSS selectors instead.
- Declare page-object locators once at class scope (`readonly`) and avoid reassigning them inside constructors/methods.
- Avoid mixed locator style in the same file unless there is a clear DOM-driven reason.

**Page Object Boundaries:**

- Keep deterministic test data (jurisdiction, case type, expected strings) in specs; page objects should accept parameters and perform interactions.
- Keep assertions in test files; page objects may use defensive waits/checks only where needed for stability.
- Reuse existing page objects/utilities instead of duplicating equivalent logic in new files.

**Test Setup and Data Discipline:**

- Use shared session helpers (`ensureSession`, `loadSessionCookies`, `ensureAuthenticatedPage`) for authentication bootstrap.
- Avoid hard-coded case references and brittle static data in tests; create or resolve data via shared helpers.
- Prefer shared utility modules (regex/validators/table helpers) over inline helpers in spec files.

**Hygiene and Consistency:**

- Remove commented-out code and unused variables before requesting review.
- Use consistent timeout literal formatting in config files (for example `180_000`, `60_000`) to match project conventions.
- Keep one source of truth for reusable logic; do not duplicate helper functions across specs/page objects.

---

## 8. HMCTS Agent Metadata Template

```yaml
agent:
  name: "HMCTS-Copilot-Playwright"
  version: "v1.0"
  type: "code"
  owner: "HMCTS Digital Delivery"
  model_provider: "Azure OpenAI"
  data_policy:
    retention_days: 30
    pii_handling: "mask"
    encryption: "AES-256-GCM"
  review_required: true
  audit_reference: "HMCTS-AI-2025-04"
  last_audit: "2025-10-01"
  region: "UK South"
  compliance: ["UK GDPR", "ISO27001", "MoJ Security Policy"]
```

---

## 9. Governance Lifecycle

| Stage       | Description                                                           | Deliverables                                |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------- |
| **Plan**    | Define objectives, risk profile, data flows, and contractual impacts. | Risk register, DPIA, architecture diagram   |
| **Develop** | Build prompts, evaluate safety, and run red-team tests.               | Prompt/eval specs, safety test results      |
| **Deploy**  | Release only after governance approval and security review.           | Change request, approval record             |
| **Monitor** | Continuously monitor drift, usage, and abuse signals.                 | Sentinel dashboards, alert runbooks         |
| **Retire**  | Decommission deprecated agents; revoke access and archive logs.       | Retirement plan, access revocation evidence |

---

## 10. Operational Quick Reference (This Repository)

- **Reporter selection:**
  - `PLAYWRIGHT_DEFAULT_REPORTER` controls the single default reporter (defaults to `list` locally, `dot` in CI).
  - Override fully via `PLAYWRIGHT_REPORTERS=list,html` or `PLAYWRIGHT_REPORTERS=list,odhin`.
- **HTML report:**
  ```bash
  PLAYWRIGHT_REPORTERS=list,html yarn playwright test
  open playwright-report/index.html
  ```
- **Odhín report:**
  ```bash
  PW_ODHIN_START_SERVER=true PLAYWRIGHT_REPORTERS=list,odhin yarn playwright test
  # open test-results/odhin-report/playwright-odhin.html
  ```
  Key env vars: `PW_ODHIN_OUTPUT`, `PW_ODHIN_INDEX`, `PW_ODHIN_TITLE`, `PW_ODHIN_ENV`, `PW_ODHIN_PROJECT`, `PW_ODHIN_RELEASE`, `PW_ODHIN_TEST_FOLDER`, `PW_ODHIN_TEST_OUTPUT`, `PW_ODHIN_API_LOGS`.
- **JUnit XML:**
  ```bash
  PLAYWRIGHT_REPORTERS=list,junit yarn playwright test
  # artifact: playwright-junit.xml (override with PLAYWRIGHT_JUNIT_OUTPUT)
  ```
- **Core automation commands:**

  ```bash
  # Playwright Test Execution
  yarn test:playwrightE2E                    # E2E tests (playwright.e2e.config.cjs)
  yarn test:playwright:integration           # Integration tests
  yarn test:smoke                            # Smoke tests
  yarn test:crossbrowser                     # Cross-browser (webkit, firefox, chromium)
  yarn test:fullfunctional                   # Full functional suite (parallel)

  # API Testing
  yarn test:api:pw                           # API tests with Odhin report
  yarn test:api:pw:coverage                  # API tests with c8 coverage

  # Test Setup
  yarn test:setup:playwright-install-all     # Install all browsers with deps
  yarn test:setup:playwright-install-chromium # Install chromium only

  # Code Quality
  yarn lint                                  # Run all linters (prettier + src + api)
  yarn lint:src                              # ESLint on src
  yarn lint:api                              # ESLint on api
  yarn lint:prettier                         # Prettier check
  yarn lint:src:fix                          # Auto-fix src issues
  yarn lint:api:fix                          # Auto-fix api issues
  yarn lint:prettier:fix                     # Auto-fix formatting

  # Coverage & Reports
  yarn test:coverage:node                    # Node/API test coverage
  yarn test:coverage:ng                      # Angular test coverage
  yarn test:coverage:all                     # Full coverage (ng + node)

  # Build & Start
  yarn build                                 # Production build (ng + node)
  yarn build:dev                             # Development build
  yarn start                                 # Start production server
  yarn start:local                           # Start local development
  ```

---

## 11. References

- HMCTS Responsible Technology Principles (internal)
- MoJ Security Policy Framework & Cloud Operating Model
- UK Government Algorithmic Transparency Recording Standard (GDS)
- Information Commissioner’s Office: AI & Data Protection Guidance
- NIST AI Risk Management Framework
- OECD AI Principles
- Microsoft Responsible AI Standard v2 (for Azure OpenAI tenancy)
- OpenAI Safety Best Practices (enterprise tenancy)

## 12. ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

## 13. Secure by design

use at all times a SecureByDesign plan (as described in .agent/SECURE.md) from design to implementation.

## 14. Sonar Guardrails

To prevent recurring Sonar failures in this repository, apply these rules on every PR:

### 14.1 Complexity (`typescript:S3776`)

**Default Standard:**

- Keep method cognitive complexity at `<=15`.
- For retry/polling/timeout logic, split orchestration into small private helpers.
- Avoid deeply nested `if/try/catch` inside loops; extract branch decisions into named methods.
- Prefer bounded retry loops with explicit stop conditions and clear failure reasons.

**Acceptable Exceptions (Per Section 6.2.10):**

When cognitive complexity >15 is **defensible and documented**:

✅ **ACCEPT with comprehensive JSDoc** when ALL of the following are true:

- Method is self-contained orchestration (single clear purpose)
- Linear flow with clear exit conditions (not tangled state machine)
- Splitting would fragment clear control flow
- Alternative helper extraction would obscure debugging
- Comprehensive JSDoc documents:
  - Why complexity is necessary (CCD workflow orchestration, auto-advance, retry logic)
  - Why splitting would harm maintainability
  - What known issues the method handles
  - Reference to Section 6.2.10 justification

**Example (Production Code):**

```typescript
/**
 * Click Submit button with auto-advance through multi-page wizards
 *
 * **Cognitive Complexity: 31** (SonarQube limit: 15)
 * Inline complexity is intentional and preferable to method fragmentation.
 *
 * **Why Complexity is Acceptable:**
 * - Self-contained polling loop with clear exit conditions
 * - Alternative (14 helper methods, 220 total lines) was less maintainable
 * - Current 120-line implementation is more readable than fragmented state machine
 *
 * See: agents.md Section 6.2.10 "Avoiding Defensive Overengineering"
 * Reference: STAGE-2-COMPLETE.md for detailed analysis
 *
 * @param context - Description for logging/errors
 * @throws {Error} If Submit not found, click fails, or event creation error
 */
// NOSONAR typescript:S3776 - Cognitive Complexity 31 acceptable per agents.md Section 6.2.10
async clickSubmitAndWait(context: string, options = {}) {
  // Implementation: 120 lines, self-contained polling loop
}
```

**Current Acceptable Exceptions in Repository:**

- `createCase.po.ts` (3 methods): `clickContinueAndWait` (24), `clickSubmitAndWait` (31), `createCase` (17)
  - All have comprehensive JSDoc per Section 6.2.10
  - Refactoring history: Stage 2 reduced 220 lines → 120 lines by ELIMINATING helper fragmentation
  - SonarQube warnings present but documented as acceptable

❌ **REFACTOR immediately** when:

- Method does multiple unrelated things (violates Single Responsibility)
- Nested loops with complex conditions (candidate for extraction)
- Business logic mixed with retry/polling infrastructure
- No JSDoc justification for complexity

### 14.2 Error stringification (`typescript:S6551`)

- Do not use `String(error)` on unknown objects in logs or messages.
- Use typed extraction:
  - `error instanceof Error ? error.message : JSON.stringify(error)`
  - or a local helper such as `extractErrorMessage(error)`.
- Never interpolate unknown objects directly into template strings.

### 14.3 Timeout/retry hygiene

- Do not allow retries to run until global test timeout without a "no progress" exit path.

### 14.4 Authoring checklist

- Before push: run `yarn lint` (or scoped `npx eslint` on changed files).
- If Sonar findings appear, fix in code and update docs when introducing a new resilience pattern.
- Keep `playwright_tests_new/README.md` and this manifest aligned with new guardrails.

---

## 15. Mandatory Four-Agent Execution Protocol

### 15.1 Scope

- This protocol is mandatory for every Action Request.
- Action Request means any request that writes/edits files, runs side-effecting commands, changes configuration/pipelines, or prepares delivery artifacts.
- Pure read-only Q&A/explanations are not Action Requests.

### 15.2 Agent Topology (Fixed)

- Run exactly four agents in this sequence: `Planner` -> `Builder` -> `Critical-Reviewer` -> `Tester`.
- `Supervisor` orchestrates loop control and stop/continue decisions.
- Maximum loops: `3`.

### 15.3 Shared Artifacts (Update Every Loop)

- `/workspace/PLAN.md`
- `/workspace/TODO.md`
- `/workspace/DECISIONS.md`
- `/workspace/RESULT.md`
- If `/workspace` is unavailable in runtime, use repo-root equivalents and log the mapping in `DECISIONS.md`.

### 15.4 Agent Message Contract (Mandatory)

Every agent handoff must include:

- Inputs consumed
- Outputs produced (files changed + summary)
- Notes / risks
- Next instructions (1-5 bullets)

Use this exact structure:

```text
Agent: <Planner|Builder|Critical-Reviewer|Tester|Supervisor>

Consumed
- ...

Produced
- ...

Notes / Risks
- ...

Next Instructions (to next agent)
1. ...
```

### 15.5 Planner Agent

Mission: turn the request into an executable plan with acceptance criteria and task board.

Must update:

- `PLAN.md` with:
  - Problem statement (1-3 lines)
  - Scope / non-scope
  - Assumptions
  - Acceptance criteria checklist
  - High-level approach
  - Risks and mitigations
- `TODO.md` with:
  - Ordered tasks
  - Ownership labels: `[B]`, `[R]`, `[T]`
  - `Fast path (MVP)` and `Nice-to-have`

Handoff to Builder:

- Smallest first milestone buildable in <1 loop
- Exact files/modules expected to change
- Constraints (style, performance, security, time)

### 15.6 Builder Agent

Mission: implement minimally and cleanly in a testable state.

Rules:

- Prefer small edits that keep the system runnable.
- Add/adjust tests or runnable checks for code changes.
- For docs/data tasks, include validation steps (lint/schema/sample run).

Must update:

- Deliverable files
- `TODO.md` progress and discovered tasks
- `DECISIONS.md` for non-trivial implementation choices

Handoff to Critical-Reviewer:

- What changed and why
- How to run/verify locally
- Known limitations

### 15.7 Critical-Reviewer Agent

Mission: pressure-test quality and risks without unnecessary rewrites.

Checklist:

- Acceptance criteria coverage
- Edge cases and failure modes
- Security/privacy/compliance concerns
- Maintainability/readability
- Overengineering check ("is this the simplest thing that works?")

Must update:

- Review section in `PLAN.md` or `RESULT.md` with:
  - Must-fix findings
  - Should-fix findings
  - Concrete patch suggestions (file + line/block references)
- `TODO.md` with missing tests/criteria/tasks

Handoff to Tester:

- Exact scenarios (happy path + 3-5 high-risk cases)
- Required instrumentation/logging

### 15.8 Tester Agent

Mission: verify with executable checks or explicit manual validation steps.

Must update:

- `RESULT.md` with:
  - How to run checks
  - What passed
  - What failed (reproduction + logs)
  - Confidence level and remaining risks
- `TODO.md` with discovered bugs/tasks

Handoff to Supervisor:

- Ship / Don't ship recommendation
- If Don't ship, minimal fix list for the next loop

### 15.9 Supervisor Loop Controller

Loop 1 (mandatory):

- Run `Planner -> Builder -> Critical-Reviewer -> Tester`.

Loop 2 (only if needed):

- Run only if Tester reports failures or Reviewer reports must-fix findings.
- Focus on the smallest fix set.

Loop 3 (last chance):

- Critical fixes only, then final verification.
- If still failing, stop and publish best-possible `RESULT.md` with limitations and next steps.

Stop early when all are true:

- Acceptance criteria met
- Checks pass, or known exceptions are documented and accepted in `DECISIONS.md`
- `RESULT.md` is complete and actionable

### 15.10 Definition of Done (DoD)

- Deliverable exists and is reproducible.
- Tests/checks pass, or failures are explicitly documented with reason and impact.
- `RESULT.md` explains how to run and verify.
- HMCTS controls remain satisfied: human oversight, auditability, secure-by-design.

### 15.11 HMCTS Overlay Controls (Always-On)

- Apply Section 12 ExecPlan requirements for complex changes.
- Apply Section 13 Secure-by-Design planning from design through implementation.
- Preserve auditability: assumptions, inputs/prompts summary, reviewer identity, and verification evidence.
- Never bypass human oversight gates before merge/deploy.

### 15.12 Operational Hardening

#### 15.12.1 Intake Gate (Before Planner)

- Classify each Action Request as `Low`, `Medium`, or `High` risk before planning starts.
- Use this baseline:
  - `Low`: doc-only or isolated non-production change with no sensitive data path.
  - `Medium`: production code/config change with bounded blast radius.
  - `High`: authn/authz, privacy/security controls, infra/deployment, or broad cross-module impact.
- Record classification and rationale in `DECISIONS.md`.
- Scale required evidence depth by risk:
  - `Low`: focused checks + targeted review.
  - `Medium`: full role outputs + standard validation set.
  - `High`: full outputs + expanded negative testing + explicit risk acceptance.

#### 15.12.2 Agent Timeboxes (Default)

- Default time budgets per loop:
  - Planner: `10m`
  - Builder: `30m`
  - Critical-Reviewer: `15m`
  - Tester: `20m`
- Supervisor may rebalance budgets by risk, but total loop budget must be stated in `PLAN.md`.

#### 15.12.3 Must-Stop Escalation Rule

- If the same `must-fix` issue appears in two consecutive loops, stop further implementation cycling.
- Supervisor must escalate to the user with options, tradeoffs, and a recommendation.
- Do not consume Loop 3 on repeated unresolved blockers without an explicit user decision.

#### 15.12.4 Acceptance-to-Evidence Traceability Matrix

- `RESULT.md` must include a matrix mapping:
  - Acceptance criterion
  - Validation method (test/check/manual step)
  - Evidence reference (log/report/file path)
  - Status (`Pass`, `Fail`, `Waived`)
- Every waived criterion must reference the approval note in `DECISIONS.md`.

#### 15.12.5 DECISIONS.md Entry Schema

- Use this structure for each non-trivial decision:
  - `decision`
  - `options`
  - `chosen`
  - `why`
  - `risk`
  - `owner`
  - `date`
- Keep entries append-only for auditability.

#### 15.12.6 Severity and Ship Policy

- Severity classification:
  - `P0`: critical safety/security/data-loss risk
  - `P1`: major functional/regression/compliance blocker
  - `P2`: important but non-blocking issue with workaround
  - `P3`: minor issue or improvement
- Ship rules:
  - `P0/P1`: block release
  - `P2`: may ship only with explicit waiver in `DECISIONS.md`
  - `P3`: backlog by default

#### 15.12.7 Non-Functional Validation Baseline (Tester)

- Unless explicitly out of scope, Tester must report:
  - lint/typecheck status
  - security/privacy checklist outcome
  - flaky-test signal (retries/quarantine indicators if applicable)
  - direct unit or fake-driven coverage status for changed shared Playwright support modules
  - session/auth reuse proof when login, storage-state, or shared-user handling changes
  - diagnostics/reporting evidence paths when relevant (for example HTML, Odhín, JUnit, traces, API logs, or structured attachments)
- If a baseline check is not runnable, document exactly why and the residual risk.

#### 15.12.8 Loop Retrospective (Result Closeout)

- At loop closeout, add a short retrospective line in `RESULT.md`:
  - primary rework cause
  - one preventive action for the next cycle

### 15.13 Jira/Confluence SDET Extensions

#### 15.13.1 Artifact Policy for Ticket-Based Work

- For ticket-based work, maintain on every loop:
  - `docs/PLAN.md`
  - `docs/TODO.md`
  - `docs/TRACEABILITY.md`
  - `docs/DECISIONS.md`
  - `docs/RESULT.md`
- Additionally for ticket-based work, produce:
  - `docs/JIRA_COMMENT.md` (ready-to-paste Jira update)
  - `docs/CONFLUENCE_UPDATE.md` (ready-to-paste Confluence update)
  - `docs/PR_DESCRIPTION.md` (ready-to-paste PR description)
- For non-ticket work, Jira/Confluence/PR artifacts are optional and should not block completion.

#### 15.13.2 Traceability Requirements (Mandatory for Ticket Work)

- `docs/TRACEABILITY.md` must map each acceptance criterion to at least one validation path.
- Minimum schema per row:
  - `AC ID / statement`
  - `Validation type` (unit/api/integration/ui/e2e/manual)
  - `Test/check identifier` (name/path)
  - `Evidence path` (report/log/screenshot)
  - `Status` (`Pass` / `Fail` / `Waived`)
- A ticket cannot be marked done if any AC lacks a mapped validation or waiver reference.

#### 15.13.3 Reviewer Flake-Prevention Gate (Must-Pass)

- Before SHIP recommendation, Critical-Reviewer must confirm all:
  - No `sleep`/fixed delay usage unless explicitly justified in `DECISIONS.md`
  - Selectors are stable (test IDs/semantic IDs/roles preferred)
  - Test data is isolated, created, and cleaned (or deterministic by design)
  - Assertions provide clear failure signals/messages
  - No new `_helpers` folders; reusable helpers live in named support modules
  - Page objects stay interaction-focused and do not hide auth/session capture that belongs in fixtures or support modules
  - At least one targeted local run command is documented in `RESULT.md`
- If any gate fails, classify as at least `must-fix` unless user accepts risk explicitly.

#### 15.13.4 Tester Evidence Bundle Standard

- Tester must include in `RESULT.md` and `docs/JIRA_COMMENT.md`:
  - exact commands executed
  - test report locations (for example `playwright-report/`, Odhin report path, JUnit XML path)
  - attachment or trace names for structured diagnostics when available
  - concise failure log excerpts for failed checks
  - rerun outcome when flake is suspected (`reproduced` or `not reproduced`)
- Evidence paths must be repository-relative or absolute paths that reviewers can open directly.

#### 15.13.5 Monorepo Instruction Overrides

- Use directory-level `AGENTS.md` files for specialized rules in large repositories.
- Precedence model:
  - nearest `AGENTS.md` to the target files has highest priority
  - parent/root instructions remain in force unless explicitly overridden
- Recommended pattern:
  - `/AGENTS.md` for shared org-level standards
  - `<domain>/AGENTS.md` for domain-specific setup/commands/guardrails

#### 15.13.6 Skills for Repeatable SDET Operations

- For recurring workflows, prefer the repo-local HMCTS SDET skills under `/Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/.codex/skills/hmcts-sdet` to reduce prompt size and improve consistency.
- Default active set:
  - `hmcts-sdet-builder`
  - `hmcts-sdet-tester`
  - `hmcts-sdet-pr-reviewer`
- Conditional set:
  - `hmcts-sdet-planner`
  - `hmcts-sdet-critical-reviewer`
  - `hmcts-sdet-orchestrator`
- Governance set (this repository):
  - `.agent/skills/hmcts-ai-governance/SKILL.md`
  - `.agent/skills/subagent-playbook/SKILL.md`
- Do not load framework-bootstrap skills by default; use them only for new framework creation or major runner migration if such a skill is installed locally.
- Load shared Playwright reference docs only when the change touches abstraction boundaries, session/auth handling, or diagnostics/reporting.
- Skills must not bypass governance, review gates, or evidence requirements in this manifest.

#### 15.13.7 Governance Trigger Map

Use the trigger map below to enforce deterministic workflow choices:

| Trigger                             | Required path                                        | Required evidence                                                                |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Security/auth/pipeline/infra change | secure-review path + manual reviewer sign-off        | `docs/DECISIONS.md`, `docs/RESULT.md`, CI artifacts                              |
| AI-assisted implementation          | AI governance skill + metadata generation/validation | `functional-output/tests/governance/ai-audit-metadata.json`, PR metadata section |
| Test/reporting changes              | tester + reviewer gates                              | Odhin/JUnit evidence path in PR + result notes                                   |

Mandatory for AI-assisted changes:

- run `yarn audit:ai:metadata`
- run `yarn audit:ai:validate`
- run `yarn audit:ai:export`
- include metadata fields in PR template:
  - `agent_name`, `version`, `prompt_id`, `reviewer`, `timestamp`, `audit_reference`
