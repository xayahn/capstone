type IntegrationEnvironment = {
  GEMINI_ENABLED?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  PUSH_NOTIFICATIONS_ENABLED?: string;
  EXPO_PROJECT_ID?: string;
  PUSH_DISPATCH_SECRET?: string;
  MAIL_ENABLED?: string;
  MAIL_DELIVERY_VERIFIED?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('An integration feature flag is invalid.');
}

/** Configuration checks only; no provider call or claim of device delivery. */
export function integrationReadiness(environment: IntegrationEnvironment) {
  const gemini = enabled(environment.GEMINI_ENABLED);
  const push = enabled(environment.PUSH_NOTIFICATIONS_ENABLED);
  const mail = enabled(environment.MAIL_ENABLED);
  if (mail && !accountMailConfigured(environment)) throw new Error('Enabled account email requires verified delivery configuration.');
  if (gemini && !isGeminiApiKey(environment.GEMINI_API_KEY)) {
    throw new Error('The enabled assistant is missing its server credential.');
  }
  if (gemini && environment.GEMINI_MODEL
    && !/^gemini-[a-z0-9][a-z0-9.-]{0,70}$/.test(environment.GEMINI_MODEL.trim())) {
    throw new Error('The enabled assistant model identifier is invalid.');
  }
  if (push && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(environment.EXPO_PROJECT_ID ?? '')
    || (environment.PUSH_DISPATCH_SECRET?.length ?? 0) < 32
    || /\s/.test(environment.PUSH_DISPATCH_SECRET ?? ''))) {
    throw new Error('The enabled push integration has incomplete server configuration.');
  }
  return {
    assistant: gemini ? 'configured' as const : 'disabled' as const,
    pushNotifications: push ? 'configured' as const : 'disabled' as const,
    accountEmail: mail ? 'configured' as const : 'disabled' as const,
  };
}
import { isGeminiApiKey } from '@/backend/ai/gemini-assistant';
import { accountMailConfigured } from '@/backend/auth/account-mailer';

