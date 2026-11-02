import fs from 'node:fs';
import path from 'node:path';

// Only structured framework events can attribute an assertion; console text cannot.
export default class EvidenceReporter {
  tests = [];
  globalErrors = [];

  constructor() {
    this.context = JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT, 'utf8'));
  }

  onError() { this.globalErrors.push('FRAMEWORK_GLOBAL_ERROR'); }

  onTestEnd(test, result) {
    const proofs = test.annotations.filter((annotation) => annotation.type === 'harness-proof');
    if (proofs.length !== 1 || !proofs[0].description) this.globalErrors.push('INVALID_PROOF_ANNOTATION');
    const assertions = [];
    const visit = (steps, assertionId = null) => {
      for (const step of steps) {
        if (step.category === 'hook' || step.category === 'fixture') continue;
        const id = step.category === 'test.step' && step.title.startsWith('harness-assertion:')
          ? step.title.slice('harness-assertion:'.length) : assertionId;
        if (id && step.category === 'expect' && step.error) assertions.push({ id, error: step.error });
        visit(step.steps, id);
      }
    };
    visit(result.steps);
    const attributed = result.errors.length === 1 && assertions.length === 1 &&
      assertions[0].error.message === result.errors[0].message && assertions[0].error.stack === result.errors[0].stack;
    this.tests.push({
      proofId: proofs[0]?.description ?? null,
      expectedStatus: test.expectedStatus,
      status: result.status,
      retry: result.retry,
      failureId: attributed ? assertions[0].id : null,
      unattributedErrors: attributed ? 0 : result.errors.length
    });
  }

  onEnd(result) {
    const output = process.env.EXUI_EVIDENCE_REPORT;
    if (!output) throw new Error('EXUI_EVIDENCE_REPORT is required');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      schemaVersion: 1, context: this.context, complete: true, status: result.status,
      tests: this.tests, globalErrors: this.globalErrors
    }) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
  }
}
