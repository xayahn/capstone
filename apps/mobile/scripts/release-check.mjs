import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const executable = process.execPath;
const productionEnvironment = {
  ...process.env,
  PARISHLINK_REQUIRE_PRODUCTION: 'true',
};

const steps = [
  ['production app configuration', 'node_modules/expo/bin/cli', ['config', '--type', 'public']],
  ['TypeScript', 'node_modules/typescript/bin/tsc', ['--noEmit']],
  ['unit tests', 'node_modules/vitest/vitest.mjs', ['run', '--configLoader', 'runner']],
  [
    'unsigned all-platform export',
    'node_modules/expo/bin/cli',
    ['export', '--platform', 'all', '--output-dir', 'dist-release-check', '--clear'],
  ],
];

for (const [label, modulePath, args] of steps) {
  process.stdout.write(`\nParishLink release check: ${label}\n`);
  const result = spawnSync(executable, [modulePath, ...args], {
    cwd: projectRoot,
    env: productionEnvironment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write('\nParishLink mobile release checks passed. No deployment was performed.\n');
