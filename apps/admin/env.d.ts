declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    MOBILE_ALLOWED_ORIGINS?: string;
    RELEASE_VERSION?: string;
    FILES: R2Bucket;
  }
}
