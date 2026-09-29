// Replay the native geometry trace after a real wheel gesture. This checks
// continued scrolling while idle; jsdom cannot reproduce WebView2 anchoring.
import { readFileSync } from "node:fs";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const anchor = process.argv[2] ?? "none";
if (anchor !== "auto" && anchor !== "none") {
  throw new Error("Usage: node check-grid-scroll.mjs [auto|none]");
}
const samples = gunzipSync(
  readFileSync(new URL("./grid-scroll.trace.ndjson.gz", import.meta.url)),
)
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line).payload)
  .filter((sample) => sample.anchor === anchor);

let wheelTime;
let previous;
let comparisons = 0;
let nonzeroComparisons = 0;
const changes = [];
for (const sample of samples) {
  if (sample.reason === "attached" || (previous && sample.time < previous.time)) {
    wheelTime = undefined;
    previous = undefined;
  }
  if (sample.reason === "wheel") {
    wheelTime = sample.time;
    previous = undefined;
    continue;
  }
  // Exclude wheel input and its ordinary deceleration before checking idle.
  if (wheelTime === undefined || sample.time - wheelTime < 1000) continue;
  const geometry = JSON.stringify([
    sample.viewport,
    sample.widths,
    sample.scroll.slice(1),
    sample.gap,
    sample.focus,
  ]);
  if (
    previous &&
    previous.geometry === geometry &&
    sample.time - previous.time < 1600
  ) {
    comparisons += 1;
    if (previous.top > 0 && sample.scroll[0] > 0) nonzeroComparisons += 1;
    const delta = sample.scroll[0] - previous.top;
    if (Math.abs(delta) > 1) {
      changes.push({
        time: Math.round(sample.time),
        from: previous.top,
        to: sample.scroll[0],
        delta,
      });
    }
  }
  previous = { geometry, time: sample.time, top: sample.scroll[0] };
}

const verdict =
  comparisons === 0 || nonzeroComparisons === 0
    ? "INCONCLUSIVE"
    : changes.length > 0
      ? "FAIL"
      : "PASS";
console.log(
  JSON.stringify(
    {
      anchor,
      verdict,
      sampleCount: samples.length,
      wheelEvents: samples.filter((sample) => sample.reason === "wheel").length,
      idleComparisons: comparisons,
      idleComparisonsAwayFromTop: nonzeroComparisons,
      unexpectedScrollChanges: changes.length,
      examples: changes.slice(0, 6),
    },
    null,
    2,
  ),
);
process.exitCode = verdict === "PASS" ? 0 : verdict === "FAIL" ? 1 : 2;
