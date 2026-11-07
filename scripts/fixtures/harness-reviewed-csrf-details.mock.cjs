// Synthetic presentation events only. Literal IDs are independent of validators.
// These events are never evidence of a real parser/application execution.
function reviewedCsrfDetailChildren(parentId) {
  if (parentId !== 'auth-basic-csrf') return [];
  return [
    {title:'harness-detail:csrf-present', category:'test.step', duration:1, steps:[]},
    {title:'harness-detail:csrf-absent', category:'test.step', duration:1, steps:[]},
  ];
}
module.exports = {reviewedCsrfDetailChildren};
