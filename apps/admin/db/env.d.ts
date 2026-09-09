declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    MOBILE_ALLOWED_ORIGINS?: string;
    RELEASE_VERSION?: string;
    FILES: R2Bucket;
  }
}
