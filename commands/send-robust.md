---
description: Send a Solana transaction the reliable way (the golden path)
---

Send a transaction reliably using the golden path in `skill/SKILL.md`.

For a safe live demo on devnet:
`SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx scripts/send-robust.ts`

When building a **real** transaction for the user, apply every step and load the
relevant skill file as you go:
- `skill/compute-budget.md` — simulate, then set the CU limit to used × 1.1.
- `skill/priority-fees.md` — price from live data on the writable accounts, capped.
- `skill/transactions.md` — v0 transaction; add an ALT if it's > 1232 bytes.
- `skill/sending.md` — send with `maxRetries: 0`, self-rebroadcast, confirm by
  polling, stop on blockhash expiry.
- For swaps, also `skill/slippage-mev.md` and consider Jito (`skill/jito.md`).

Never hardcode a priority fee, and always simulate before sending.
