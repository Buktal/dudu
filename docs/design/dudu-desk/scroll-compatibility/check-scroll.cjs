const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const input = process.argv[2] || path.join(__dirname, 'baseline.ndjson.gz');
const raw = fs.readFileSync(input);
const events = (input.endsWith('.gz') ? gunzipSync(raw) : raw)
  .toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const streams = new Map();
for (const event of events.filter(item => item.type === 'frame')) {
  if (!streams.has(event.id)) streams.set(event.id, []);
  streams.get(event.id).push(event);
}
const rebounds = [];
let comparisons = 0;
for (const frames of streams.values()) {
  for (let index = 1; index < frames.length; index++) {
    const before = frames[index - 1];
    const after = frames[index];
    if (after.t - before.t > 120 || before.viewport !== after.viewport) continue;
    if (before.delta <= 0 || after.delta <= 0) continue;
    // Track the same visible message, so ordinary virtual row replacement and
    // scrollTop compensation do not count as a visual rebound.
    const row = before.items.find(item => item[2] > 0 && item[1] >= 0 && item[1] < before.viewport);
    const next = row && after.items.find(item => item[0] === row[0]);
    if (!next || next[2] !== row[2]) continue;
    comparisons++;
    const shift = next[1] - row[1];
    if (shift > 2) rebounds.push({
      time: after.time, shift,
      wasAtBottom: Math.abs(before.height - before.viewport - before.top) <= 1,
      scrollHeight: [before.height, after.height],
    });
  }
}
const verdict = !comparisons ? 'INCONCLUSIVE' : rebounds.length ? 'FAIL' : 'PASS';
console.log(JSON.stringify({
  verdict, comparisons,
  rebounds: rebounds.length,
  reboundsFromBottom: rebounds.filter(item => item.wasAtBottom).length,
  examples: rebounds.slice(0, 6),
}, null, 2));
process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
