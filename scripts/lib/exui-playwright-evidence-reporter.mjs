import fs from 'node:fs';
import path from 'node:path';
import stageTelemetry from './exui-native-stage-telemetry.cjs';

// Only structured framework events can attribute an assertion; console text cannot.
export default class EvidenceReporter {
  tests = [];
  stages = new stageTelemetry.NativeStageRecorder();
  postalDetail = new stageTelemetry.PostalDetailRecorder();
  globalErrors = [];
  configuredWorkers = null;

  constructor() {
    this.context = JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT, 'utf8'));
  }

  onBegin(config) {
    this.configuredWorkers = Number.isSafeInteger(config?.workers) && config.workers > 0 ? config.workers : null;
  }

  onError() { this.globalErrors.push('FRAMEWORK_GLOBAL_ERROR'); }

  onStepBegin(test, result, step) { this.stages.begin(test.annotations.find(a => a.type === 'harness-proof')?.description, result, step); this.postalDetail.begin(test.annotations.find(a => a.type === 'harness-proof')?.description, result, step); }
  onStepEnd(test, result, step) { this.stages.end(test.annotations.find(a => a.type === 'harness-proof')?.description, result, step); this.postalDetail.end(test.annotations.find(a => a.type === 'harness-proof')?.description, result, step); }

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
    const detail = this.postalDetail.finish(proofs[0]?.description, result);
    this.tests.push({
      proofId: proofs[0]?.description ?? null,
      expectedStatus: test.expectedStatus,
      status: result.status,
      retry: result.retry,
      failureId: attributed ? assertions[0].id : null,
      unattributedErrors: attributed ? 0 : result.errors.length,
      recordedExecution: this.stages.finish(proofs[0]?.description, result),
      ...(detail === undefined ? {} : {recordedDetail:detail})
    });
  }

  onEnd(result) {
    const output = process.env.EXUI_EVIDENCE_REPORT;
    if (!output) throw new Error('EXUI_EVIDENCE_REPORT is required');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      schemaVersion: 1, context: this.context, complete: true, status: result.status,
      tests: this.tests, globalErrors: this.globalErrors, configuredWorkers: this.configuredWorkers
    }) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
  }
}
