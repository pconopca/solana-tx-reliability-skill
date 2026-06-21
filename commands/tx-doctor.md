---
description: Diagnose a Solana transaction by signature — why it failed, dropped, or landed
argument-hint: <transaction-signature>
---

Diagnose the Solana transaction `$ARGUMENTS` (if empty, ask the user for a
signature).

1. Ensure dependencies are installed once: `npm install`.
2. Run the diagnoser:
   `SOLANA_RPC_URL=${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com} npx tsx scripts/tx-doctor.ts $ARGUMENTS`
3. Using `skill/debugging.md`, translate the output into a plain-English
   explanation and a concrete fix:
   - Ran out of compute units → `skill/compute-budget.md`.
   - Dropped / `BlockhashNotFound` / expired → `skill/sending.md`.
   - Anchor/SPL custom error → decode the code and name the likely cause.
