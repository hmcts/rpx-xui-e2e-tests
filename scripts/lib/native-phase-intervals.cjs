function calculateNativePhaseIntervals(timings) {
  const totalMs = timings.reduce((sum, item) => sum + item.durationMs, 0);
  const intervals = timings.map((item) => {
    const start = Date.parse(item.startedAt);
    return { start, end: start + item.durationMs, label: item.label };
  }).sort((a, b) => a.start - b.start);
  const overlapPairs = [];
  for (let left = 0; left < intervals.length; left++) for (let right = left + 1; right < intervals.length; right++) {
    if (Math.min(intervals[left].end, intervals[right].end) > Math.max(intervals[left].start, intervals[right].start))
      overlapPairs.push([intervals[left].label, intervals[right].label]);
  }
  let coveredMs = 0, intervalEnd = -Infinity;
  for (const { start, end } of intervals) {
    if (end > intervalEnd) {
      coveredMs += end - Math.max(start, intervalEnd);
      intervalEnd = end;
    }
  }
  return { coveredMs, overlapMs: totalMs - coveredMs, overlapPairs };
}

module.exports = { calculateNativePhaseIntervals };
