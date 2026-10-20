import { calculateBulkDelay } from './bulk-message-delay';

describe('calculateBulkDelay (OpenWA v0.24.0 customization)', () => {
  it('preserves fixed delay when randomization is disabled', () => {
    expect(calculateBulkDelay({ delayBetweenMessages: 300000, randomizeDelay: false }, () => 0.5)).toBe(300000);
  });

  it('preserves the previous optional 0..2000ms jitter', () => {
    expect(calculateBulkDelay({ delayBetweenMessages: 3000, randomizeDelay: true }, () => 0.5)).toBe(4000);
  });

  it('allows a sampled zero delay in full-range random mode', () => {
    expect(calculateBulkDelay({ delayBetweenMessages: 300000, randomizeDelay: true, randomizeFullRange: true }, () => 0)).toBe(0);
  });

  it('allows the upper bound and ignores legacy jitter in full-range mode', () => {
    expect(calculateBulkDelay({ delayBetweenMessages: 300000, randomizeDelay: true, randomizeFullRange: true }, () => 1 - Number.EPSILON)).toBe(300000);
  });

  it('samples the full range rather than adding to the configured limit', () => {
    expect(calculateBulkDelay({ delayBetweenMessages: 300000, randomizeDelay: true, randomizeFullRange: true }, () => 0.5)).toBe(150000);
  });
});
