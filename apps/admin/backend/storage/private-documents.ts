import { env } from 'cloudflare:workers';
import { isDemoDeployment } from '@/backend/config/deployment-mode';

export type StoredDocumentMetadata = {
  contentType?: string;
  contentDisposition?: string;
};

export type StoredDocument = {
  body: BodyInit;
  httpMetadata?: StoredDocumentMetadata;
};

export type PrivateDocumentStore = {
  readonly kind: 'r2' | 'demo-kv';
  put(key: string, value: ArrayBuffer, metadata: StoredDocumentMetadata): Promise<void>;
  get(key: string): Promise<StoredDocument | null>;
  delete(key: string): Promise<void>;
};

/**
 * Resolve the private document store.
 * - Standard deployments and local development require the R2 bucket (`FILES`).
 * - Only an online demonstration explicitly marked `DEMO_DEPLOYMENT=true` may
 *   fall back to `DEMO_FILES_KV` (Cloudflare Workers KV) when R2 is not enabled
 *   on a free Cloudflare account. Without `DEMO_DEPLOYMENT=true`, `DEMO_FILES_KV`
 *   is ignored and callers fail closed with HTTP 503.
 */
export function getPrivateDocumentStore(): PrivateDocumentStore | null {
  if (env.FILES) {
    const bucket = env.FILES;
    return {
      kind: 'r2',
      async put(key, value, metadata) {
        await bucket.put(key, value, { httpMetadata: metadata });
      },
      async get(key) {
        const object = await bucket.get(key);
        if (!object) return null;
        return { body: object.body, httpMetadata: object.httpMetadata };
      },
      async delete(key) {
        await bucket.delete(key);
      },
    };
  }

  if (isDemoDeployment() && env.DEMO_FILES_KV) {
    const kv = env.DEMO_FILES_KV;
    return {
      kind: 'demo-kv',
      async put(key, value, metadata) {
        await kv.put(key, value, { metadata });
      },
      async get(key) {
        const result = await kv.getWithMetadata<StoredDocumentMetadata>(key, 'arrayBuffer');
        if (result.value === null) return null;
        return { body: result.value, httpMetadata: result.metadata ?? undefined };
      },
      async delete(key) {
        await kv.delete(key);
      },
    };
  }

  return null;
}
