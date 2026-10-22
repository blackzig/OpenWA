import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBulkPacing, previewBlockPacing } from './bulkPacing.ts';

test('random mode retains existing random 0-5min server default', () => {
  assert.deepEqual(buildBulkPacing('random', '5', '2,3,4,5,1', ''), { valid: true });
  assert.equal(buildBulkPacing('random', '0', 'invalid', 'abc').valid, true);
});

test('block mode defaults to five recipients and a rotating 2-3-4-5-1 minute sequence', () => {
  const result = buildBulkPacing('blocks', '5', '2,3,4,5,1', '');
  assert.deepEqual(result.options, { pacingMode: 'blocks', blockSize: 5, blockDelaysMinutes: [2, 3, 4, 5, 1] });
  assert.deepEqual(previewBlockPacing(5, result.sequence!), [
    '1–5: 2 min', '6–10: 3 min', '11–15: 4 min', '16–20: 5 min', '21–25: 1 min',
  ]);
});

test('block mode accepts 1–100 recipients per group and validates every minute', () => {
  for (const size of ['', '0', '101', '5.5', '-1', 'NaN']) {
    assert.equal(buildBulkPacing('blocks', size, '2,3', '').error, 'invalidSize');
  }
  for (const sequence of ['', '0', '6', '1,2,6', '2,x', '1.5', '2,3,4,5,1,2,3,4,5,1,2']) {
    assert.equal(buildBulkPacing('blocks', '5', sequence, '').error, 'invalidSequence');
  }
  assert.deepEqual(buildBulkPacing('blocks', '2', '5; 1 2', '').sequence, [5, 1, 2]);
});

test('custom interval retains original API range and jitter semantics', () => {
  assert.deepEqual(buildBulkPacing('custom', '5', '2,3,4,5,1', '3000').options, { delayBetweenMessages: 3000 });
  for (const ms of ['', '0', '999', '60001', '1000.5', 'abc']) {
    assert.equal(buildBulkPacing('custom', '5', '2', ms).error, 'invalidCustom');
  }
});
