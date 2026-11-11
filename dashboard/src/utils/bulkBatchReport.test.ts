import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBatchResultsCsv, batchReportFilename } from './bulkBatchReport.ts';
import type { BatchStatusResponse } from '../services/api';

const batch: BatchStatusResponse = {
  batchId: 'batch_teste',
  status: 'cancelled',
  progress: { total: 4, sent: 1, failed: 1, pending: 0, cancelled: 2 },
  results: [
    { chatId: '5519999999999@c.us', status: 'sent', messageId: 'true_123@lid_msg', sentAt: '2026-11-10T17:10:00.000Z' },
    { chatId: '5519888888888@c.us', status: 'failed', error: { code: 'SEND_FAILED', message: '=WEBSERVICE("https://attacker.test")' } },
  ],
};

test('exports sent and failed recipients in order with summary totals', () => {
  const csv = buildBatchResultsCsv(batch);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"1";"batch_teste";"5519999999999@c.us";"sent"'));
  assert.ok(csv.includes('"2";"batch_teste";"5519888888888@c.us";"failed"'));
  assert.ok(csv.includes('"batch_teste";"4";"1";"1";"0";"2";"2";"cancelled"'));
  assert.equal(csv.split('5519999999999').length, 2);
  // The two cancelled (never attempted) recipients are counted, never invented as result rows.
  assert.equal(csv.split('\r\n').filter(line => line.includes('5519')).length, 2);
});

test('does not allow CSV formula execution from error strings', () => {
  const csv = buildBatchResultsCsv(batch);
  assert.ok(csv.includes('"\x27=WEBSERVICE('));
  assert.ok(!csv.includes('";"=WEBSERVICE('));
});

test('escapes quotes, semicolons and newlines in CSV fields', () => {
  const altered: BatchStatusResponse = {
    ...batch,
    results: [{ chatId: '5512345@c.us', status: 'failed', error: { code: 'FAIL', message: 'A;"B"\nC' } }],
  };
  assert.ok(buildBatchResultsCsv(altered).includes('"A;""B""\nC"'));
});

test('uses a safe filename for user-supplied batch identifiers', () => {
  assert.equal(batchReportFilename('../batch:01'), 'openwa-lote-___batch_01.csv');
});
