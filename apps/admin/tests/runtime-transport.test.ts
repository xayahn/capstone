import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Test the installed, pinned module transport rather than copying its retry logic.
const file = new URL('../node_modules/@cloudflare/vite-plugin/dist/workers/runner-worker/index.js', import.meta.url);
const source = ts.createSourceFile('runner-worker.js', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const methods: string[] = [];
function visit(node: ts.Node): void {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'invoke') methods.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);

function transport(fetch: (request: Request) => Promise<Response>): (data: unknown) => Promise<unknown> {
  if (methods.length !== 1) throw new Error('Review the installed runtime transport after a dependency change.');
  return vm.runInNewContext(`({${methods[0]}}).invoke`, {
    env: { __VITE_INVOKE_MODULE__: { fetch } }, Request,
    UNKNOWN_HOST: 'http://local-module-transport', ENVIRONMENT_NAME_HEADER: 'x-vite-environment', environmentName: 'rsc',
  });
}

describe('installed Cloudflare local module transport', () => {
  it('recovers from two transient module-fetch failures', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Network connection lost')).mockRejectedValueOnce(new Error('Network connection lost')).mockResolvedValue(Response.json({ result: 'synthetic module' }));
    await expect(transport(fetch)({ name: 'fetchModule', data: ['synthetic'] })).resolves.toEqual({ result: 'synthetic module' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('stops after three failed attempts', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('Network connection lost'));
    await expect(transport(fetch)({ name: 'fetchModule' })).rejects.toThrow('Network connection lost');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not retry a successful module fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ result: 'synthetic module' }));
    await transport(fetch)({ name: 'fetchModule' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
