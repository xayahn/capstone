declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_ENABLED?: string;
    PUSH_NOTIFICATIONS_ENABLED?: string;
    EXPO_PROJECT_ID?: string;
    EXPO_ACCESS_TOKEN?: string;
    PUSH_DISPATCH_SECRET?: string;
    MAIL_ENABLED?: string;
    MAIL_DELIVERY_VERIFIED?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    MOBILE_ALLOWED_ORIGINS?: string;
    RELEASE_VERSION?: string;
    FILES: R2Bucket;
    DOCUMENT_SCANNER?: Fetcher;
  }
}
