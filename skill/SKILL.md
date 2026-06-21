---
name: solana-tx-reliability
description: >-
  Use when a Solana transaction must LAND reliably and cheaply — setting
  priority fees and compute-unit limits correctly, simulating before sending,
  retrying/rebroadcasting dropped transactions, surviving congestion and local
  fee markets, using Jito bundles/tips, avoiding sandwich/MEV on swaps, and
  diagnosing failed, dropped, or "blockhash expired" transactions. Triggers on:
  transaction not landing, "Transaction was not confirmed", priority fee,
  compute budget, ComputeBudgetProgram, getPriorityFeeEstimate, versioned
  transaction, address lookup table, Jito bundle, sandwich, slippage,
  rebroadcast, durable nonce, send/confirm transaction.
license: MIT
---

# Solana Transaction Reliability

Get any Solana transaction to **land** — confirmed in a block — quickly,
cheaply, and safely, even during congestion. This is an **add-on** skill: it
does NOT cover writing programs (delegate that to `solana-dev-skill`). It owns
the client-side path between "I have instructions" and "it's confirmed".

## The golden path (do this every time)

A reliable send is always these six steps, in order:

1. **Build** a v0 (versioned) transaction with your instructions.
2. **Right-size compute** — simulate to get real CU usage, then set
   `SetComputeUnitLimit` to `used × 1.1` (never the 200k default, never 1.4M).
3. **Price priority** — set `SetComputeUnitPrice` from a live estimate based on
   the **writable** accounts your tx touches (not a hardcoded number).
4. **Simulate** against the current state; abort on error before spending fees.
5. **Send with `maxRetries: 0` and rebroadcast yourself** every ~2s until the
   blockhash is no longer valid.
6. **Confirm** by polling signature status (don't trust a single send).

If any builder tells you "just bump the priority fee," they're wrong — fee is
only one of the six. Skipping simulation or self-rebroadcast is the #1 cause of
"my tx disappeared".

## Routing — load only what the task needs

| If the task is about… | Read |
|---|---|
| Choosing/estimating the priority fee (compute-unit *price*) | `priority-fees.md` |
| Sizing the compute-unit *limit*, simulation, CU exhaustion | `compute-budget.md` |
| Building v0 txs, Address Lookup Tables, packing, size limits | `transactions.md` |
| The send→rebroadcast→confirm loop, blockhash expiry, durable nonces | `sending.md` |
| Jito bundles, tips, atomic multi-tx, when to use them | `jito.md` |
| Swaps: slippage, sandwich/MEV protection, private routing | `slippage-mev.md` |
| A tx that FAILED, dropped, or expired — diagnosing why | `debugging.md` |
| RPC providers, tools, libraries, further reading | `resources.md` |

## Runnable helpers

- `scripts/send-robust.ts` — a reference implementation of the full golden path
  (simulate → size CU → price → send with manual rebroadcast → confirm).
- `scripts/tx-doctor.ts` — paste a failed/landed signature; it fetches the tx,
  decodes logs, CU usage, fee, and the failing instruction, and explains it.

Run them on **devnet** first (`SOLANA_RPC_URL` env). They never touch mainnet
funds unless you explicitly point them there.

## 2026 stack notes (keep current)

- **SDK:** lead with **`@solana/kit`** (formerly web3.js v2) — it's the
  maintained, recommended SDK in 2026. `@solana/web3.js` v1 is in maintenance;
  `@solana/web3-compat` bridges old code. Reference files show both where the
  API differs.
- **Fees** go 100% to the validator and are `ceil(cu_limit × cu_price_µlamports
  / 1_000_000)` lamports, on top of the 5000-lamport/signature base.
- **Jito** carries the majority of priority-fee volume in 2026; for swaps and
  contested mints, a Jito tip often lands better than a raw priority fee.

## Safety rules

- Never hardcode a priority fee "to be safe" — that's how people overpay 1000×.
  Always derive it and **cap** it.
- Always simulate before send; treat a simulation error as a hard stop.
- For swaps, an unprotected send into a public path can be sandwiched — see
  `slippage-mev.md` before sending value-bearing swaps.
