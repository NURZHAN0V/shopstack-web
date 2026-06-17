import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function checkJsSyntax(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Syntax error in ${file}:\n${result.stderr}`);
    process.exit(1);
  }
}

const files = [
  join(root, 'dev-server.mjs'),
  ...readdirSync(jsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(jsDir, f)),
];

for (const file of files) {
  checkJsSyntax(file);
}

console.log(`OK: ${files.length} JS files`);
