import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const executable = process.execPath;
const steps = [
  ['TypeScript', 'node_modules/typescript/bin/tsc', ['--noEmit']],
  ['lint', 'node_modules/eslint/bin/eslint.js', ['.']],
  ['unit tests', 'node_modules/vitest/vitest.mjs', ['run', '--config', 'vitest.config.ts', '--configLoader', 'runner']],
  ['database migrations', 'scripts/validate-migration.mjs', []],
  ['production build', 'node_modules/vinext/dist/cli.js', ['build']],
];

for (const [label, modulePath, args] of steps) {
  process.stdout.write(`\nParishLink admin release check: ${label}\n`);
  const result = spawnSync(executable, [modulePath, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write('\nParishLink admin release checks passed. No deployment was performed.\n');
