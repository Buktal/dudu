import fs from "node:fs/promises";

// PROTOTYPE: audit the same colors used by the cards; no production imports or writes.
const source = await fs.readFile(new URL("./palette-cards.html", import.meta.url), "utf8");
const data = JSON.parse(source.match(/<script type="application\/json" id="palette-study-data">([\s\S]*?)<\/script>/)[1]);

function luminance(hex) {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(3));
}

const report = [...data.fixed, ...data.accents].map(palette => {
  const base = data.neutrals[palette.scheme];
  return {
    id: palette.id,
    name: palette.name,
    incomingText: contrast(base.ink, base.paper),
    outgoingText: contrast(base.ink, palette.soft),
    selectedTitle: contrast(base.ink, palette.selected),
    secondaryOnPaper: contrast(base.secondary, base.paper),
    secondaryOnSelected: contrast(base.secondary, palette.selected),
    buttonLabel: contrast(base["on-strong"], palette.strong),
  };
});
await fs.writeFile(new URL("./contrast-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.table(report);
const failures = report.flatMap(row => Object.entries(row)
  .filter(([, value]) => typeof value === "number" && value < 4.5)
  .map(([role, ratio]) => `${row.name}: ${role} = ${ratio}`));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
