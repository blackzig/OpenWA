import '../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';

let rows: unknown[] = [];
let total = 0;
let failed = false;
const requests: string[] = [];
const session = { id: 'sess-1', name: 'disparopizza' };

function installFetchStub() {
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (failed) {
      return Promise.resolve(new Response(JSON.stringify({ message: 'Temporary failure' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ messages: rows, total }), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }) as typeof fetch;
}

let rtl: typeof import('@testing-library/react');
let SessionSendMonitor: (typeof import('./SessionSendMonitor.tsx'))['SessionSendMonitor'];

before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  installFetchStub();
  rtl = await import('@testing-library/react');
  ({ SessionSendMonitor } = await import('./SessionSendMonitor.tsx'));
});

afterEach(() => {
  rtl.cleanup();
  rows = [];
  total = 0;
  failed = false;
  requests.length = 0;
});

function row(id: string, chatId: string, status: string) {
  return {
    id, chatId, status, createdAt: '2026-11-21T15:00:00.000Z',
    direction: 'outgoing', type: 'text', waMessageId: 'wamid-' + id,
  };
}

test('the monitor does not read messages or send anything until the operator clicks', async () => {
  rows = [row('1', '111@c.us', 'read'), row('2', '222@c.us', 'delivered')];
  total = 2;
  const { container } = rtl.render(createElement(SessionSendMonitor, { sessions: [session] }));
  await rtl.waitFor(() => {
    assert.equal(rtl.screen.getByRole('button', { name: 'Consultar envios' }).hasAttribute('disabled'), false);
  });
  assert.equal(requests.length, 0, 'a background request was made without the operator asking');

  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Consultar envios' }));
  await rtl.screen.findByText('111@c.us');
  const cardCounts = Array.from(container.querySelectorAll('.session-send-metrics strong'), el => el.textContent);
  assert.deepEqual(cardCounts, ['2', '2', '0', '1', '1', '0', '0']);

  assert.equal(requests.length, 1);
  const query = new URL(requests[0], 'http://localhost');
  assert.equal(query.pathname, '/api/sessions/sess-1/messages');
  assert.equal(query.searchParams.get('direction'), 'outgoing');
  assert.equal(query.searchParams.get('inlineMedia'), 'false');
  assert.equal(query.searchParams.get('limit'), '100');
  assert.ok(rtl.screen.getByRole('button', { name: 'Exportar mensagens CSV' }));
  assert.ok(rtl.screen.getByRole('button', { name: 'Exportar destinatários CSV' }));
});

test('a failed history read is an error, not an empty report', async () => {
  failed = true;
  rtl.render(createElement(SessionSendMonitor, { sessions: [session] }));
  await rtl.waitFor(() => {
    assert.equal(rtl.screen.getByRole('button', { name: 'Consultar envios' }).hasAttribute('disabled'), false);
  });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Consultar envios' }));
  assert.ok(await rtl.screen.findByRole('alert'));
  assert.equal(rtl.screen.queryByText('Não há mensagens de saída registradas nesta sessão.'), null);
});

test('an empty history is displayed explicitly without inventing failures', async () => {
  rtl.render(createElement(SessionSendMonitor, { sessions: [session] }));
  await rtl.waitFor(() => {
    assert.equal(rtl.screen.getByRole('button', { name: 'Consultar envios' }).hasAttribute('disabled'), false);
  });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Consultar envios' }));
  assert.ok(await rtl.screen.findByText('Não há mensagens de saída registradas nesta sessão.'));
  assert.equal(requests.length, 1);
});
