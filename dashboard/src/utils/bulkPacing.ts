import type { SendBulkPayload } from '../services/api';

export type BulkPacingMode = 'random' | 'blocks' | 'custom';

export type BulkPacingResult = {
  valid: boolean;
  error?: string;
  options?: SendBulkPayload['options'];
  sequence?: number[];
};

export function buildBulkPacing(
  mode: BulkPacingMode,
  sizeText: string,
  sequenceText: string,
  legacyDelayText: string,
): BulkPacingResult {
  if (mode === 'random') {
    // No options => existing 0–300000ms random pause, one independent draw per gap.
    return { valid: true };
  }
  if (mode === 'custom') {
    if (!/^\d+$/.test(legacyDelayText.trim())) return { valid: false, error: 'invalidCustom' };
    const delay = Number(legacyDelayText);
    if (!Number.isInteger(delay) || delay < 1000 || delay > 60000) {
      return { valid: false, error: 'invalidCustom' };
    }
    return { valid: true, options: { delayBetweenMessages: delay } };
  }
  if (!/^\d+$/.test(sizeText.trim())) return { valid: false, error: 'invalidSize' };
  const size = Number(sizeText);
  if (!Number.isInteger(size) || size < 1 || size > 100) return { valid: false, error: 'invalidSize' };

  const parts = sequenceText.split(/[,;\s]+/).filter(Boolean);
  if (!parts.length || parts.length > 10 || parts.some(s => !/^[1-5]$/.test(s))) {
    return { valid: false, error: 'invalidSequence' };
  }
  const minutes = parts.map(Number);
  return {
    valid: true,
    sequence: minutes,
    options: { pacingMode: 'blocks', blockSize: size, blockDelaysMinutes: minutes },
  };
}

export function previewBlockPacing(blockSize: number, minutes: readonly number[], maxBlocks = 5): string[] {
  return Array.from({ length: Math.min(minutes.length, maxBlocks) }, (_, index) =>
    `${index * blockSize + 1}–${(index + 1) * blockSize}: ${minutes[index]} min`,
  );
}
