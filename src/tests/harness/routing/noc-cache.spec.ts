import { test, expect } from "../../../fixtures/harnessIdentity";
import {
  csrfToken,
  routingJournal,
  routingSessions,
  signedSessionHeader,
} from "../../../harness/routing";

test(
  "actual NoC handlers preserve case-keyed cache and fresh-session fallback with real CSRF tokens",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "routing-noc-url-omission"
        : "routing-noc-session-cache",
    },
  },
  async ({ playwright }) => {
    const sessions = routingSessions();
    expect(sessions.primary.id).not.toBe(sessions.fresh.id);
    const primary = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
      extraHTTPHeaders: signedSessionHeader(sessions.primary.cookie),
    });
    const fresh = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
      extraHTTPHeaders: signedSessionHeader(sessions.fresh.cookie),
    });
    const a = "1111222233334444",
      b = "5555666677778888";
    const answers = (id: string) => ({
      case_id: id,
      answers: [{ question_id: "routing-question", value: "synthetic-answer" }],
    });
    const before = routingJournal().length;
    try {
      const questionsA = await primary.get(`/api/noc/nocQuestions?caseId=${a}`);
      expect(questionsA.status()).toBe(200);
      expect((await questionsA.json()).questions[0].case_type_id).toBe("PCS");
      const token = csrfToken(questionsA);
      const first = await primary.post("/api/noc/validateNoCQuestions", {
        data: answers(a),
        headers: { "x-xsrf-token": token },
      });
      expect(first.status()).toBe(200);
      expect(await first.json()).toBe(true);

      await test.step("harness-assertion:noc-session-routing", async () => {
        expect(
          routingJournal()
            .slice(before)
            .filter((item) => item.method === "POST"),
        ).toEqual([
          {
            port: 3102,
            method: "POST",
            path: "/pcs-assignment/noc/verify-noc-answers",
            query: [],
            body: answers(a),
          },
        ]);
      });

      const questionsB = await primary.get(`/api/noc/nocQuestions?caseId=${b}`);
      expect(questionsB.status()).toBe(200);
      expect((await questionsB.json()).questions[0].case_type_id).toBe("CIVIL");
      const second = await primary.post("/api/noc/validateNoCQuestions", {
        data: answers(b),
        headers: { "x-xsrf-token": token },
      });
      expect(second.status()).toBe(200);
      expect(await second.json()).toBe(true);
      const repeated = await primary.post("/api/noc/validateNoCQuestions", {
        data: answers(a),
        headers: { "x-xsrf-token": token },
      });
      expect(repeated.status()).toBe(200);
      expect(await repeated.json()).toBe(true);
      const submitted = await primary.post("/api/noc/submitNocEvents", {
        data: answers(a),
        headers: { "x-xsrf-token": token },
      });
      expect(submitted.status()).toBe(200);
      expect(await submitted.json()).toEqual({
        result: "synthetic-routing-submit",
      });
      const tokenGet = await fresh.get("/external/config/ui");
      expect(tokenGet.status()).toBe(200);
      const freshToken = csrfToken(tokenGet);
      const uncached = await fresh.post("/api/noc/validateNoCQuestions", {
        data: answers(a),
        headers: { "x-xsrf-token": freshToken },
      });
      expect(uncached.status()).toBe(200);
      expect(await uncached.json()).toBe(true);
      const uncachedSubmit = await fresh.post("/api/noc/submitNocEvents", {
        data: answers(a),
        headers: { "x-xsrf-token": freshToken },
      });
      expect(uncachedSubmit.status()).toBe(200);
      expect(await uncachedSubmit.json()).toEqual({
        result: "synthetic-routing-submit",
      });
      const observed = routingJournal()
        .slice(before)
        .filter((item) => item.path.includes("/noc/"));
      expect(observed).toEqual([
        {
          port: 3101,
          method: "GET",
          path: "/central-assignment/noc/noc-questions",
          query: [["case_id", a]],
          body: null,
        },
        {
          port: 3102,
          method: "POST",
          path: "/pcs-assignment/noc/verify-noc-answers",
          query: [],
          body: answers(a),
        },
        {
          port: 3101,
          method: "GET",
          path: "/central-assignment/noc/noc-questions",
          query: [["case_id", b]],
          body: null,
        },
        {
          port: 3101,
          method: "POST",
          path: "/central-assignment/noc/verify-noc-answers",
          query: [],
          body: answers(b),
        },
        {
          port: 3102,
          method: "POST",
          path: "/pcs-assignment/noc/verify-noc-answers",
          query: [],
          body: answers(a),
        },
        {
          port: 3102,
          method: "POST",
          path: "/pcs-assignment/noc/noc-requests",
          query: [],
          body: answers(a),
        },
        {
          port: 3101,
          method: "POST",
          path: "/central-assignment/noc/verify-noc-answers",
          query: [],
          body: answers(a),
        },
        {
          port: 3101,
          method: "POST",
          path: "/central-assignment/noc/noc-requests",
          query: [],
          body: answers(a),
        },
      ]);
    } finally {
      await primary.dispose();
      await fresh.dispose();
    }
  },
);
