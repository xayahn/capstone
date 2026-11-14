import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// Local development binding names (D1 database "DB", R2 bucket "FILES").
// Internal sign-in is handled by ParishLink itself (backend/auth/staff-auth.ts).
const LOCAL_D1_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'parishlink-d1',
      database_id: LOCAL_D1_PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [
    {
      binding: 'FILES',
      bucket_name: 'parishlink-r2',
    },
  ],
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
