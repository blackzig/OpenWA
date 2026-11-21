import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  outgoingMessageCsv, outgoingRecipientCsv, summarizeOutgoing,
  type OutgoingRecord,
} from './sessionSendReport.ts';

function item(id: string, chatId: string, status: OutgoingRecord['status']): OutgoingRecord {
  return {
    id, chatId, status, createdAt: '2026-11-21T14:51:00.000Z',
    type: 'text', waMessageId: 'wamid-' + id,
  };
}

test('individual messages are grouped per recipient without counting one recipient multiple times', () => {
  const rows = [
    item('1', '111@c.us', 'read'),
    item('2', '111@c.us', 'delivered'),
    item('3', '222@c.us', 'sent'),
    item('4', '222@c.us', 'failed'),
  ];
  const report = summarizeOutgoing(rows);
  assert.equal(report.total, 4);
  assert.equal(report.recipients.length, 2);
  assert.deepEqual(report.counts, {
    pending: 0, sent: 1, delivered: 1, read: 1, failed: 1,
  });
  assert.deepEqual(report.recipients.map(x => [x.chatId, x.total]), [
    ['111@c.us', 2], ['222@c.us', 2],
  ]);
});

test('CSV includes numbers, status, WhatsApp ID and a summary by recipient', () => {
  const rows = [item('1', '111@c.us', 'read'), item('2', '111@c.us', 'failed')];
  const detailed = outgoingMessageCsv(rows, false);
  const grouped = outgoingRecipientCsv(rows, false);
  assert.match(detailed, /"111@c.us";"read";"2026-11-21T14:51:00.000Z";"text";"wamid-1"/);
  assert.match(detailed, /"111@c.us";"failed"/);
  assert.match(grouped, /"111@c.us";"0";"0";"1";"1";"0";"2"/);
  assert.match(grouped, /"Cobertura";"Completa para registros consultados"/);
  assert.ok(detailed.startsWith('\uFEFF'));
});

test('CSV formula injection is neutralized in untrusted recipient identifiers', () => {
  const csv = outgoingRecipientCsv([item('1', '  =1+1', 'sent')], true);
  assert.match(csv, /"'  =1\+1"/);
  assert.match(csv, /"Cobertura";"PARCIAL/);
});
