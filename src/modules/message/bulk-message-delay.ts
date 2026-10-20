/** Delay calculation for bulk messages. Does not send messages or access external systems. */
export interface BulkDelayOptions {
  delayBetweenMessages: number;
  randomizeDelay: boolean;
  /** Opt-in uniform random delay from zero to the configured maximum, inclusive. */
  randomizeFullRange?: boolean;
}

export function calculateBulkDelay(options: BulkDelayOptions, random: () => number = Math.random): number {
  if (options.randomizeFullRange) {
    // Math.random() yields [0, 1). Include the upper bound by flooring max + 1.
    return Math.floor(random() * (options.delayBetweenMessages + 1));
  }
  // Backward-compatible v0.24.0 behavior: fixed base plus optional 0..2s jitter.
  return options.delayBetweenMessages + (options.randomizeDelay ? random() * 2000 : 0);
}
