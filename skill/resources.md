# Resources

Curated, current-to-2026 references for transaction reliability. Load this only
when you need a provider, endpoint, or deeper doc.

## SDKs & libraries

- **`@solana/kit`** — the maintained Solana JS SDK (formerly web3.js v2).
  Tree-shakeable; ~200ms faster confirms vs v1 in tests. Default for new code.
- **`@solana-program/compute-budget`** — `getSetComputeUnitLimitInstruction`,
  `getSetComputeUnitPriceInstruction` for kit.
- **`@solana/web3.js`** (v1) — maintenance mode, still widely used. Most
  ecosystem examples are still v1.
- **`@solana/web3-compat`** — bridge to migrate v1 code to kit incrementally.
- **`gill`** — ergonomic wrapper over kit if you want fewer moving parts.

## RPC & transaction-sending providers

- **Helius** — `getPriorityFeeEstimate` (percentile fee API), Sender (staked
  low-latency send), Enhanced Transactions API (decoded txs), Jito routing.
- **Triton One** — staked sending, fee estimation.
- **QuickNode / Chainstack / GetBlock** — RPC + priority-fee guides + sending.
- Public `https://api.mainnet-beta.solana.com` / `https://api.devnet.solana.com`
  — fine for dev and reads; **not** for reliable mainnet landing under load.

## Fee & compute references

- Solana docs — Fees / Fee structure: https://solana.com/docs/core/fees
- Cookbook — Add priority fees:
  https://solana.com/developers/cookbook/transactions/add-priority-fees
- Helius — Priority Fee API & "Solana Fees in Theory and Practice".
- Anza — "Why Solana Transaction Costs and Compute Units Matter".

## Jito

- Docs: https://docs.jito.wtf — bundles, tips, Block Engine, low-latency send.
- Tip floor API: https://bundles.jito.wtf/api/v1/bundles/tip_floor
- Block Engine: regional `*.block-engine.jito.wtf` endpoints (see docs);
  methods `getTipAccounts`, `sendBundle`, `getBundleStatuses`,
  `getInflightBundleStatuses`.

## Explorers (for `debugging.md`)

- Solana Explorer — https://explorer.solana.com
- Solscan — https://solscan.io
- SolanaFM — https://solana.fm

## Related skills (don't duplicate them)

- **`solana-dev-skill`** — writing programs (Anchor/Pinocchio), testing,
  on-chain security. This skill delegates all program work there.
- **`jup-ag/agent-skills`** — building Jupiter swaps. This skill covers how to
  **send** swaps safely (`slippage-mev.md`), not how to construct routes.
- **`helius-labs/core-ai`** — deeper Helius infra (RPC, webhooks, DAS).

## Key numbers to remember

- Base fee: **5000 lamports / signature**.
- Priority fee: `ceil(cu_limit × cu_price_µlamports / 1_000_000)` lamports.
- Max CU / tx: **1_400_000**. Default: `min(200k × num_ix, 1.4M)`.
- Tx size limit: **1232 bytes**. Account ref: 32 bytes (1 byte via ALT).
- Blockhash validity: **~150 slots (~60–90s)**.
- Jito: bundle ≤ **5 txs**, atomic, 1 slot; min tip **1000 lamports**, tip in
  the **last** tx, **never** via ALT.
