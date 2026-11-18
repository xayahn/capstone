import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// Local development binding names (D1 database "DB", R2 bucket "FILES").
// Internal sign-in is handled by ParishLink itself (backend/auth/staff-auth.ts).
const LOCAL_D1_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

// Building the online demonstration (fictional data only) for Cloudflare:
// PARISHLINK_D1_DATABASE_ID is the real D1 database ID (not a secret) and
// PARISHLINK_DEMO_DEPLOYMENT=true marks the build with DEMO_DEPLOYMENT=true.
// Without these, the build keeps the local placeholder and standard settings.
const deployDatabaseId = process.env.PARISHLINK_D1_DATABASE_ID?.trim();
if (deployDatabaseId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deployDatabaseId)) {
  throw new Error('PARISHLINK_D1_DATABASE_ID must be a D1 database UUID.');
}
const demoDeploymentBuild = process.env.PARISHLINK_DEMO_DEPLOYMENT === 'true';
if (demoDeploymentBuild && !deployDatabaseId) {
  throw new Error('PARISHLINK_DEMO_DEPLOYMENT requires PARISHLINK_D1_DATABASE_ID.');
}
const releaseVersion = process.env.PARISHLINK_RELEASE_VERSION?.trim();

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'parishlink-d1',
      database_id: deployDatabaseId || LOCAL_D1_PLACEHOLDER_DATABASE_ID,
      migrations_dir: 'drizzle',
    },
  ],
  r2_buckets: [
    {
      binding: 'FILES',
      bucket_name: 'parishlink-r2',
    },
  ],
  ...(demoDeploymentBuild ? {
    vars: {
      DEMO_DEPLOYMENT: 'true',
      ...(releaseVersion ? { RELEASE_VERSION: releaseVersion } : {}),
    },
  } : {}),
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      host: true,
      port: 3000,
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
