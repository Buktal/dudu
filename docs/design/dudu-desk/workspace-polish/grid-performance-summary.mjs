import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const recordings = gunzipSync(
  readFileSync(new URL("./grid-scroll.trace.ndjson.gz", import.meta.url)),
)
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line).payload)
  .filter((sample) => sample.reason === "performance");

console.log(
  JSON.stringify(
    recordings.map((recording) => {
      const frames = [...recording.frames].sort((a, b) => a - b);
      const renders = recording.renders;
      const mounts = recording.cards?.filter((card) => card.phase === "mount");
      return {
        native: recording.native,
        stage: recording.stage,
        viewport: recording.viewport,
        visibility: recording.visibility,
        wheels: recording.wheels,
        frames: frames.length,
        frameP95: Math.round((frames[Math.floor((frames.length - 1) * 0.95)] ?? 0) * 10) / 10,
        frameMax: Math.round((frames.at(-1) ?? 0) * 10) / 10,
        framesOver25ms: frames.filter((frame) => frame > 25).length,
        renders: renders.length,
        renderTotal: Math.round(renders.reduce((sum, value) => sum + value, 0) * 10) / 10,
        renderMax: Math.round(Math.max(0, ...renders) * 10) / 10,
        cardMounts: mounts?.length,
        cardMountDuration: mounts
          ? Math.round(mounts.reduce((sum, card) => sum + card.duration, 0) * 10) / 10
          : undefined,
      };
    }),
    null,
    2,
  ),
);
