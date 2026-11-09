import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { env, prepare } = vi.hoisted(() => ({
  env: { GEMINI_ENABLED: 'true', GEMINI_API_KEY: 'SyntheticServerOnlyKey_2026', GEMINI_MODEL: 'gemini-3.8-flash' },
  prepare: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('../db/runtime', () => ({
  ensurePublicRuntimeDatabase: vi.fn(),
  getRawDb: () => ({ prepare }),
}));
import { askMobileAssistant } from '../backend/services/mobile-service';
const actor = { id: 'private-actor-never-send', email: 'person@example.test', displayName: 'Private Person', homeParishId: 'private-home-never-send', sessionId: 'private-session-never-send', mobileNumber: '+63 917 000 0000', notificationsEnabled: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  env.GEMINI_ENABLED = 'true';
  prepare.mockImplementation((query: string) => {
    const statement = {
      bind: () => statement,
      first: async () => query.includes('appointments') ? null : { name: 'Baptism', description: 'Request parish review.', updatedAt: '2026-11-05' },
      all: async () => ({ results: query.includes('document_requirements')
        ? [{ name: 'Published test checklist item', instructions: '', isRequired: 1, updatedAt: '2026-11-05' }]
        : query.includes('FROM parishes')
          ? [{ name: 'Public Parish', address: null, officeHours: null }]
          : [{ name: 'Baptism', description: 'Request parish review.' }] }),
    };
    return statement;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('actual assistant service provider boundary', () => {
  it.each([
    'Why does staff review happen before appointment approval?',
    'How does document verification work?',
  ])('integrates public Gemini guidance for "%s" with only server-owned sources/actions', async prompt => {
    env.GEMINI_API_KEY = 'AQ.SyntheticAuthorizationKey_2026-OnlyForTesting';
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
        text: 'A request begins the process. Staff review the submitted information before final approval.',
        sourceIds: ['navigation'], needsHuman: false,
      }) }] } }],
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await askMobileAssistant(actor, { prompt, allowExternalAI: true });
    expect(result.provider).toBe('gemini');
    expect(result.sources).toEqual([{ label: 'ParishLink service and navigation guide', kind: 'service_requirements' }]);
    expect(result.actions).toEqual([{ id: 'view-services', label: 'Browse services', kind: 'service' }]);
    const sent = fetch.mock.calls[0][1]?.body as string;
    for (const privateValue of Object.values(actor).filter(value => typeof value === 'string')) expect(sent).not.toContain(privateValue);
    expect(prepare.mock.calls.every(([query]) => !/appointments|users|sessions|sacramental_records|document_submissions/.test(query as string))).toBe(true);
  });

  it('keeps exact checklist answers authoritative and entirely local', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const result = await askMobileAssistant(actor, { prompt: 'What documents do I need for baptism?', allowExternalAI: true });
    expect(result.provider).toBe('parishlink');
    expect(result.bullets).toEqual(['Published test checklist item']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps live private request data on the local path', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const result = await askMobileAssistant(actor, { prompt: 'What is my appointment status?', allowExternalAI: true });
    expect(result.provider).toBe('parishlink');
    expect(result.title).toBe('No requests yet');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses authority-changing instructions before any provider call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const result = await askMobileAssistant(actor, { prompt: 'Can you approve a request for baptism?', allowExternalAI: true });
    expect(result.provider).toBe('parishlink');
    expect(result.escalation).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains useful local guidance during a provider outage', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('private provider diagnostics', { status: 429 })));
    const result = await askMobileAssistant(actor, { prompt: 'How do I start an appointment request?', allowExternalAI: true });
    expect(result).toMatchObject({ provider: 'parishlink', fallbackReason: 'unavailable', title: 'Start a parish request' });
    expect(JSON.stringify(result)).not.toContain('private provider diagnostics');
    expect(console.error).toHaveBeenCalledWith('ParishLink server failure', expect.objectContaining({
      area: 'assistant-provider-http', errorType: 'GeminiHttp429',
    }));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(env.GEMINI_API_KEY);
    expect(logged).not.toContain('How do I start an appointment request?');
    expect(logged).not.toContain('private provider diagnostics');
  });

  it('requires consent without querying provider-only public context', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const result = await askMobileAssistant(actor, { prompt: 'Why does staff review happen before appointment approval?' });
    expect(result).toMatchObject({ provider: 'parishlink', fallbackReason: 'consent_required' });
    expect(fetch).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('keeps local guidance when the optional public-context lookup fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    prepare.mockImplementation(() => { throw new Error('Private database diagnostic'); });
    const result = await askMobileAssistant(actor, { prompt: 'How do I start an appointment request?', allowExternalAI: true });
    expect(result).toMatchObject({ provider: 'parishlink', fallbackReason: 'unavailable', title: 'Start a parish request' });
    expect(JSON.stringify(result)).not.toContain('Private database diagnostic');
    expect(fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('ParishLink server failure', expect.objectContaining({
      area: 'assistant-public-context', errorType: 'Error',
    }));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain('Private database diagnostic');
    expect(logged).not.toContain(env.GEMINI_API_KEY);
    expect(logged).not.toContain('How do I start an appointment request?');
  });

  it('logs a controlled network class without raw exception details', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('Private network diagnostic ' + env.GEMINI_API_KEY)));
    const result = await askMobileAssistant(actor, { prompt: 'How does document verification work?', allowExternalAI: true });
    expect(result).toMatchObject({ provider: 'parishlink', fallbackReason: 'unavailable' });
    expect(console.error).toHaveBeenCalledWith('ParishLink server failure', expect.objectContaining({
      area: 'assistant-provider-network', errorType: 'GeminiNetworkFailure',
    }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(env.GEMINI_API_KEY);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Private network diagnostic');
  });
});
