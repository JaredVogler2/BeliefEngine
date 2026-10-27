/**
 * Fails when the production bundle outgrows its budget (after `npm run build`). The budgets sit about a third above today's size, so they
 * catch an accidental large dependency or an un-split asset without breaking on ordinary growth. Raise them deliberately, in a commit that says why.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = { jsGzKb: 260, cssGzKb: 12, totalFiles: 12 };
const dir = 'dist/assets';
const files = readdirSync(dir).map((f) => ({ f, raw: statSync(join(dir, f)).size, gz: gzipSync(readFileSync(join(dir, f))).length }));
const sum = (ext: string) => files.filter((x) => x.f.endsWith(ext)).reduce((a, x) => a + x.gz, 0) / 1024;
const js = sum('.js');
const css = sum('.css');
console.log(`JS ${js.toFixed(0)} KB gzip (budget ${BUDGET.jsGzKb}), CSS ${css.toFixed(1)} KB gzip (budget ${BUDGET.cssGzKb}), ${files.length} files`);
const problems: string[] = [];
if (js > BUDGET.jsGzKb) problems.push(`JavaScript is ${js.toFixed(0)} KB gzipped; the budget is ${BUDGET.jsGzKb}`);
if (css > BUDGET.cssGzKb) problems.push(`CSS is ${css.toFixed(1)} KB gzipped; the budget is ${BUDGET.cssGzKb}`);
if (files.length > BUDGET.totalFiles) problems.push(`${files.length} asset files; expected at most ${BUDGET.totalFiles}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
