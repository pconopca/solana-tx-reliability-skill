# Working in this repo

This repo is the **solana-tx-reliability** agent skill. When helping send or
debug Solana transactions, follow the skill's own guidance in `skill/SKILL.md`.

## Always-on rules

- **The golden path is non-negotiable:** build → simulate to size the CU limit →
  price the priority fee from live data (capped) → simulate the final tx → send
  with `maxRetries: 0` and self-rebroadcast → confirm by polling. Never skip
  simulation or self-rebroadcast.
- **Never hardcode a priority fee.** Derive it from the writable accounts the tx
  touches, and cap it from a max-total-fee budget.
- **Never estimate fees against a program ID** — only writable accounts.
- **Right-size compute units** from a simulation; never ship the 200k default or
  a blanket 1.4M.
- **Treat a landed-but-`err` transaction as a failure**, not a success.
- For swaps, keep slippage tight and prefer a private/Jito path
  (`skill/slippage-mev.md`).

## Scope

This skill is an **add-on**. It does **not** cover writing programs — delegate
all program/Anchor/Pinocchio work to `solana-dev-skill`, and Jupiter route
construction to `jup-ag/agent-skills`. It owns only the client-side path from
"I have instructions" to "it's confirmed".

## Helpers

- `scripts/send-robust.ts` — runnable golden-path demo (devnet by default).
- `scripts/tx-doctor.ts` — diagnose any transaction by signature.

Keep changes clean and safe: no opaque executables, no bloat, MIT-licensed.
