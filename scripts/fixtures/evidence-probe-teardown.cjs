module.exports = async () => {
  if (process.env.EVIDENCE_PROBE === 'terminated') process.kill(process.pid, 'SIGKILL');
  if (process.env.EVIDENCE_PROBE === 'teardown') throw new Error('synthetic global teardown failure');
};
