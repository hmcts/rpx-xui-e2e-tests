/* global module, process */
function fullMachineReporters(output, env = process.env) {
  for (const reporter of ['JSON', 'JUNIT']) {
    const name = `PLAYWRIGHT_${reporter}_ONLY_FAILURES`;
    const value = env[name] ?? env[`npm_config_${name.toLowerCase()}`] ?? env[`npm_package_config_${name.toLowerCase()}`];
    if (value && value !== 'false' && value !== '0') throw new Error(`HARNESS_FULL_${reporter}_REPORT_REQUIRED`);
  }
  return [
    ['json', { outputFile: `${output}/playwright.json`, onlyFailures: false }],
    ['junit', { outputFile: `${output}/junit.xml`, onlyFailures: false }]
  ];
}
module.exports = { fullMachineReporters };
