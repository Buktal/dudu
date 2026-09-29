import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../../dudu-desk/package.json', import.meta.url));
const { convert } = await import(pathToFileURL(require.resolve('@asamuzakjp/css-color')));
const { contrast_ratio_wcag_2_1 } = await import(pathToFileURL(require.resolve('@csstools/color-helpers')));
const bases = JSON.parse(await fs.readFile(new URL('./bases.json', import.meta.url), 'utf8'));
console.log(contrast_ratio_wcag_2_1.toString());
console.table(bases.map(base => ({
  id: base.id,
  base: base.base,
  oklch: convert.colorToOklch(base.base).slice(0, 3).map(value => Number(value.toFixed(4))).join(' '),
})));
