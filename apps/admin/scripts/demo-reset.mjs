// Reset the LOCAL development database and private file storage to a clean state.
// The next request to the development server re-applies every migration and
// re-seeds the synthetic demonstration data (dates relative to today).
//
// Usage: pnpm demo:reset            (stop "pnpm dev" first)
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const state = join(root, '.wrangler', 'state', 'v3');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset: NODE_ENV is "production". This script only touches local development state.');
  process.exit(1);
}

try {
  const response = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(1500) });
  if (response.ok) {
    console.error('The development server is still running on port 3000. Stop it (Ctrl+C) and run "pnpm demo:reset" again.');
    process.exit(1);
  }
} catch {
  // Not running: safe to continue.
}

const targets = ['d1', 'r2'].map((name) => join(state, name)).filter((path) => existsSync(path));
for (const path of targets) {
  rmSync(path, { recursive: true, force: true });
  console.log(`Removed ${path}`);
}
console.log(targets.length
  ? 'Local database and file storage cleared. Start "pnpm dev"; the first request rebuilds the schema from drizzle/ and seeds fresh synthetic demo data.'
  : 'Nothing to reset: no local database exists yet.');
