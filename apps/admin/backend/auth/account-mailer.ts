/** Server-only transport. A provider acceptance is not proof of inbox delivery. */
export type AccountEmail = {
  email: string;
  purpose: 'password_reset' | 'email_verification';
  code: string;
  challengeId: string;
};
export type AccountMailer = { send(message: AccountEmail): Promise<void> };
export type AccountMailConfiguration = {
  MAIL_ENABLED?: string;
  MAIL_DELIVERY_VERIFIED?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

export class AccountMailError extends Error {
  constructor() { super('Account email delivery is unavailable.'); this.name = 'AccountMailError'; }
}

export function accountMailConfigured(configuration: AccountMailConfiguration): boolean {
  return configuration.MAIL_ENABLED === 'true' && configuration.MAIL_DELIVERY_VERIFIED === 'true'
    && /^re_[A-Za-z0-9_-]{12,200}$/.test(configuration.RESEND_API_KEY ?? '')
    && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(configuration.MAIL_FROM ?? '')
    && (configuration.MAIL_FROM?.length ?? 0) <= 254;
}

/** Fixed HTTPS host, no redirects, no user-controlled headers/URLs, bounded I/O. */
export function createAccountMailer(configuration: AccountMailConfiguration, fetcher: typeof fetch = fetch): AccountMailer {
  if (!accountMailConfigured(configuration)) throw new AccountMailError();
  return {
    async send(message) {
      const controller = new AbortController();
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => undefined); reject(new AccountMailError()); }, 8_000);
      });
      const operation = async () => {
        const verification = message.purpose === 'email_verification';
        const grouped = message.code.match(/.{4}/g)?.join('-') ?? '';
        response = await fetcher('https://api.resend.com/emails', {
          method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { 'Authorization': `Bearer ${configuration.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `account-${message.challengeId}` },
          body: JSON.stringify({ from: configuration.MAIL_FROM, to: [message.email],
            subject: verification ? 'Verify your ParishLink email' : 'Reset your ParishLink password',
            text: `Your ParishLink ${verification ? 'email verification' : 'password reset'} code is ${grouped}.\n\nEnter it in the ParishLink app within 15 minutes. Only the latest requested code works. Do not share this code. Parish staff will never ask for it.\n\nIf you did not request this, ignore this message.`,
          }),
        });
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => undefined); throw new AccountMailError(); }
        if (response.status >= 300 && response.status < 400 || response.redirected || response.type === 'opaqueredirect' || !response.ok) {
          void response.body?.cancel().catch(() => undefined); throw new AccountMailError();
        }
        if (!response.body) throw new AccountMailError();
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) {
          const item = await reader.read(); if (item.done) break;
          length += item.value.byteLength;
          if (length > 8_192) { void reader.cancel().catch(() => undefined); throw new AccountMailError(); }
          chunks.push(item.value);
        }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const result = JSON.parse(new TextDecoder().decode(bytes)) as { id?: unknown };
        if (typeof result?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)) throw new AccountMailError();
      };
      try { await Promise.race([operation(), deadline]); }
      catch { throw new AccountMailError(); }
      finally { if (timer) clearTimeout(timer); if (reader) { void reader.cancel().catch(() => undefined); } }
    },
  };
}
