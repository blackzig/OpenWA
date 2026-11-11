#!/usr/bin/env python3
"""Resolve the 10 known OpenWA 0.25 custom -> 0.30.0 Git conflict blocks.
Only edits /opt/openwa-v030-complete. No production containers or databases.
"""
from pathlib import Path
import re
import shutil
import tempfile

ROOT = Path('/opt/openwa-v030-complete')
EXPECTED = {
    'dashboard/src/pages/MessageTester.test.ts': 1,
    'dashboard/src/pages/MessageTester.tsx': 3,
    'dashboard/src/pages/Sessions.css': 1,
    'src/modules/message/bulk-message.service.ts': 4,
    'src/modules/message/dto/bulk-message.dto.ts': 1,
}
PATTERN = re.compile(r'(?ms)^<<<<<<< ours\n(.*?)^=======\n(.*?)^>>>>>>> theirs\n')


def check(ok, msg):
    if not ok:
        raise RuntimeError(msg)


def merge(path, n, ours, theirs):
    if path.endswith('MessageTester.test.ts'):
        check(n == 0 and 'phone fields are tel inputs' in ours and 'formatNextBulkSendCountdown' in theirs, path)
        check("assert.equal(attr('mt-11', 'dir'), 'ltr');" in ours[-140:], 'test official ending changed')
        check('assert.equal(body.options, undefined);' in theirs[-140:], 'custom test ending changed')
        return ours.rstrip('\n') + '\n});\n\n' + theirs

    if path.endswith('MessageTester.tsx'):
        if n == 0:
            check('useMemo' in ours and 'useMemo' in theirs, 'React imports changed')
            return ours
        if n == 1:
            check('PHONE_DIGITS_MAX' in ours and 'formatNextBulkSendCountdown' in theirs, 'phone/countdown changed')
            return ours.rstrip('\n') + '\n\n' + theirs
        if n == 2:
            check('const bulkRecipientList = useMemo' in ours, 'official memoization changed')
            prefix = '  const bulkRecipientList = parseBulkRecipients(bulkRecipients);\n'
            check(theirs.startswith(prefix), 'custom bulk list changed')
            check('bulkPrepared' in theirs and 'bulkRandomInlineTooLarge' in theirs, 'bulk options missing')
            return ours + theirs[len(prefix):]
        raise RuntimeError('Unrecognized MessageTester block')

    if path.endswith('Sessions.css'):
        check(n == 0 and ".proxy-form-section input[type='text']:focus" in ours, 'focus style changed')
        check('.session-reconnect-notice' in theirs, 'notice style missing')
        return ours.rstrip('\n') + '\n}\n\n' + theirs

    if path.endswith('bulk-message.service.ts'):
        if n == 0:
            check('renderedLength' in ours and 'TemplateRenderError' in ours, 'template validation absent')
            check('EngineStatus' in theirs, 'engine enum absent')
            return ("import { renderedLength, renderTemplate, TemplateRenderError } from '../../common/utils/template-render';\n"
                    "import { EngineStatus, IWhatsAppEngine, MessageResult } from '../../engine/interfaces/whatsapp-engine.interface';\n")
        if n == 1:
            check('this.shutdownService?.isShuttingDown()' in ours, 'shutdown guard changed')
            check('blockDelaysMinutes' in theirs and 'resolveBulkDelayOptions' in theirs, 'custom pacing absent')
            return ours  # The official concurrency guard is already present after this conflict.
        if n == 2:
            check('lifetime.close()' in ours and 'this.awaitingReconnect.delete(batchDbId)' in theirs, 'cleanup changed')
            return ("      this.nextSendAt.delete(batchDbId);\n"
                    "      this.awaitingReconnect.delete(batchDbId);\n"
                    "      lifetime.close();\n")
        if n == 3:
            check('lifetime.assertCurrent();' in ours and 'processBatchMessage(batch, i, state, lifetime)' in ours,
                  'official session write scope changed')
            check('awaitSessionBeforeNextItem' in theirs, 'reconnect pause missing')
            return ("      lifetime.assertCurrent();\n"
                    "      if (!(await this.awaitSessionBeforeNextItem(batch, state, lifetime))) break;\n"
                    "      lifetime.assertCurrent();\n"
                    "      if (!(await this.processBatchMessage(batch, i, state, lifetime))) break;\n")
        raise RuntimeError('Unrecognized service block')

    if path.endswith('bulk-message.dto.ts'):
        check(n == 0 and 'ValidatorConstraint' in ours and 'Matches' in ours, 'official validation missing')
        check('ArrayMinSize' in theirs and 'IsInt' in theirs, 'pacing validation missing')
        return ours + theirs

    raise RuntimeError('Unexpected file')


modified = {}
for rel, count in EXPECTED.items():
    source = (ROOT / rel).read_text()
    matches = list(PATTERN.finditer(source))
    check(len(matches) == count, f'{rel}: expected {count} conflicts, found {len(matches)}')
    pieces, last = [], 0
    for n, m in enumerate(matches):
        pieces.append(source[last:m.start()])
        pieces.append(merge(rel, n, m.group(1), m.group(2)))
        last = m.end()
    pieces.append(source[last:])
    merged = ''.join(pieces)
    check(not re.search(r'(?m)^(?:<<<<<<<|=======|>>>>>>>)', merged), f'{rel}: unresolved marker')
    modified[rel] = merged

# Retain the v0.30.0 shutdown/ownership lifecycle, replacing only default pacing options.
path = 'src/modules/message/bulk-message.service.ts'
s = modified[path]
old = '''      const options = {
        delayBetweenMessages: dto.options?.delayBetweenMessages ?? 3000,
        randomizeDelay: dto.options?.randomizeDelay ?? true,
        stopOnError: dto.options?.stopOnError ?? false,
      };'''
new = '''      // Custom block scheduling; keep the official concurrency/shutdown checks above.
      if (dto.options?.pacingMode === 'blocks') {
        if (
          !dto.options.blockSize ||
          !dto.options.blockDelaysMinutes?.length ||
          dto.options.delayBetweenMessages !== undefined ||
          dto.options.randomizeDelay !== undefined
        ) {
          throw new BadRequestException(
            'Block pacing requires blockSize and blockDelaysMinutes; do not combine with delayBetweenMessages/randomizeDelay',
          );
        }
      } else if (dto.options?.blockSize !== undefined || dto.options?.blockDelaysMinutes !== undefined) {
        throw new BadRequestException('Block pacing parameters require pacingMode=blocks');
      }
      const options = resolveBulkDelayOptions(dto.options);'''
check(s.count(old) == 1, 'official batch options changed: manual review required')
s = s.replace(old, new)

old_sig = 'private async awaitSessionBeforeNextItem(batch: MessageBatch, state: BatchExecutionState): Promise<boolean> {'
new_sig = ('private async awaitSessionBeforeNextItem(\n'
           '    batch: MessageBatch,\n'
           '    state: BatchExecutionState,\n'
           '    lifetime: SessionWriteScope,\n'
           '  ): Promise<boolean> {')
check(s.count(old_sig) == 1, 'reconnect method signature changed')
s = s.replace(old_sig, new_sig)

old_loop = '''      while (!this.shuttingDown && this.processingBatches.get(batch.id) === true) {
        const engine = this.engines.get(batch.sessionId);'''
new_loop = '''      while (!this.shuttingDown && this.processingBatches.get(batch.id) === true) {
        lifetime.assertCurrent();
        const engine = this.engines.get(batch.sessionId);'''
check(s.count(old_loop) == 1, 'reconnect wait loop changed')
s = s.replace(old_loop, new_loop)

old_read = '        if (!stored || stored.status !== BatchStatus.PROCESSING) {'
check(s.count(old_read) == 1, 'reconnect storage read changed')
s = s.replace(old_read, '        lifetime.assertCurrent();\n' + old_read)

for marker in ('getNextSendAt(batchDbId:', 'listRecentBatches(', 'isAwaitingReconnect(',
               'private async processBatchMessage(', 'lifetime.close();'):
    check(marker in s, f'Lost feature / official guard: {marker}')
modified[path] = s

backup = Path(tempfile.mkdtemp(prefix='openwa-conflicts-', dir='/root'))
backup.chmod(0o700)
for rel in EXPECTED:
    out = backup / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / rel, out)
for rel, source in modified.items():
    (ROOT / rel).write_text(source)
print(f'10 conflict blocks resolved in {len(modified)} files.')
print(f'Original conflict files saved in: {backup}')
print('No production containers or databases were accessed.')
