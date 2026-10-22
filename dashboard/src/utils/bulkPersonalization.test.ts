import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalizedBulkMessages,
  buildRandomizedBulkMessages,
  normalizePersonalizedRecipient,
  parsePersonalizedCsv,
} from './bulkPersonalization.ts';

test('reads a Brazilian CSV with number-specific messages and quoted commas', () => {
  const rows = parsePersonalizedCsv('\uFEFFnumero;mensagem\r\n5511999990001;"Olá, Maria!"\r\n5511999990002;"Seu pedido chegou."');
  assert.equal(rows.length, 2);
  assert.deepEqual(buildPersonalizedBulkMessages(rows), [
    { chatId: '5511999990001@c.us', type: 'text', content: { text: 'Olá, Maria!' } },
    { chatId: '5511999990002@c.us', type: 'text', content: { text: 'Seu pedido chegou.' } },
  ]);
});

test('supports comma-separated CSV and multiline quoted content', () => {
  const rows = parsePersonalizedCsv('phone,message\n+55 (11) 99999-0001,"Linha 1\nLinha 2"\n5511999990002,Outro');
  assert.equal(rows[0].message, 'Linha 1\nLinha 2');
  assert.equal(buildPersonalizedBulkMessages(rows)[0].chatId, '5511999990001@c.us');
});

test('rejects wrong or missing headers rather than interpreting message as phone number', () => {
  assert.throws(() => parsePersonalizedCsv('nome;frase\nAna;Oi'), /invalidHeader/);
  assert.throws(() => parsePersonalizedCsv('numero;mensagem\n12345;Oi'), /invalidRecipient/);
  assert.throws(() => parsePersonalizedCsv('numero;mensagem\n123456;'), /emptyMessage/);
  assert.throws(() => parsePersonalizedCsv('numero;mensagem\n123456;"broken'), /invalidCsv/);
  assert.throws(() => parsePersonalizedCsv('numero;mensagem\n123456;ok;extra'), /invalidCsv/);
});

// Duplicate inputs are rejected at parsing, before a network request.
test('rejects duplicate recipients', () => {
  assert.throws(
    () => parsePersonalizedCsv('numero;mensagem\n+55 11 99999-0001;A\n5511999990001;B'),
    /duplicateRecipient/,
  );
});

test('rejects invalid phones, repeated chats, oversized messages and too many rows', () => {
  assert.throws(() => normalizePersonalizedRecipient('=HYPERLINK("evil")'), /invalidRecipient/);
  assert.throws(() => normalizePersonalizedRecipient('5511@evil.com'), /invalidRecipient/);
  assert.throws(
    () => buildPersonalizedBulkMessages([{ recipient: '5511999990001', message: 'a'.repeat(4097) }]),
    /longMessage/,
  );
  assert.throws(
    () => buildPersonalizedBulkMessages(Array.from({ length: 101 }, (_, i) => ({
      recipient: String(5511999990000 + i),
      message: 'Teste',
    }))),
    /invalidCount/,
  );
});

test('randomized variants cycle over all entries and do not repeat consecutively', () => {
  const recipients = Array.from({ length: 12 }, (_, i) => `${5511999990000 + i}@c.us`);
  const result = buildRandomizedBulkMessages(recipients, ['Texto A', 'Texto B', 'Texto C'], () => 0);
  assert.equal(result.length, 12);
  const texts = result.map(entry => entry.content.text);
  for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1]);
  for (let i = 0; i < texts.length; i += 3) {
    assert.deepEqual([...texts.slice(i, i + 3)].sort(), ['Texto A', 'Texto B', 'Texto C']);
  }
});

test('requires two distinct saved alternatives and at least one recipient', () => {
  assert.throws(() => buildRandomizedBulkMessages(['5511999990001@c.us'], ['A', 'A']), /needVariations/);
  assert.throws(() => buildRandomizedBulkMessages(['5511999990001@c.us'], ['A']), /needVariations/);
  assert.throws(() => buildRandomizedBulkMessages([], ['A', 'B']), /invalidCount/);
});

test('manual entries map exact individualized texts to WhatsApp chats', () => {
  const entries = buildPersonalizedBulkMessages([
    { recipient: '5511999990001', message: 'Bom dia, Ana!' },
    { recipient: '5511999990002', message: 'Boa tarde, Carlos!' },
  ]);
  assert.notEqual(entries[0].content.text, entries[1].content.text);
  assert.equal(entries[1].chatId, '5511999990002@c.us');
});
