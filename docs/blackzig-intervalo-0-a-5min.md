# BlackZig: optional random 0–5 minute bulk-message interval

Based on upstream OpenWA **v0.24.0** (commit `e9afb97da44fa1f3c1fdc469a134a706394eda46`).

## What changed

- Increased the `delayBetweenMessages` ceiling from **60,000** to **300,000 ms** in API validation, Swagger and the message tester UI.
- Introduced **`randomizeFullRange`**, an opt-in flag. With `true`, a separate random delay is sampled uniformly from `0` to `delayBetweenMessages`, including the maximum. When the upper limit is omitted in this mode, it defaults to **300,000 ms**.
- Added a checkbox in the Message Tester page, with Portuguese and English labels.
- Retained existing behaviour when the new flag is absent: the existing fixed base plus optional 0–2 second jitter (`randomizeDelay`).
- Added isolated unit tests for fixed delay, legacy jitter, zero, midpoint and upper bound.

Example request options:

```json
{
  "options": {
    "delayBetweenMessages": 300000,
    "randomizeFullRange": true
  }
}
```

The integer milliseconds value is capped by DTO validation in the **1000–300000** range. Zero is possible only as a *randomly selected wait*, not as the configured upper limit.

## Scope and caveats

The waiting period applies **between messages inside the same bulk batch**. It does not coordinate sends from multiple batches, other API endpoints or other independent programs. This is **not** a global per-number throttle and does not guarantee account safety.

OpenWA is an unofficial WhatsApp client. Test only with authorized, opted-in numbers. Do not infer that timing variations evade WhatsApp anti-abuse systems.

## Local verification (without connecting a WhatsApp account)

```sh
npm ci
npm test -- --runInBand src/modules/message/bulk-message-delay.spec.ts
npm run build
npm run dashboard:ci
npm run dashboard:build
```

Before a client deployment: make a backup, verify the WSL installation and local changes, build a separate test instance and record the exact commit. **No deployment is performed by this change.**
