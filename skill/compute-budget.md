# Compute budget — sizing the compute-unit *limit*

The compute-unit (CU) **limit** is how much compute your transaction reserves.
It does two things at once:

1. **Correctness** — if the tx uses more CUs than the limit, it **fails** with
   `Computational budget exceeded`.
2. **Cost** — your priority fee is `cu_limit × cu_price / 1e6`, so an oversized
   limit makes you overpay even if you set a sane price.

So the rule is simple: **set the limit to what the tx actually uses, plus a
small margin.** Never ship the default, never ship 1.4M.

## The defaults you're fighting

- If you set **no** limit, the runtime gives the tx
  `min(200_000 × num_instructions, 1_400_000)` CU. For a one-instruction tx
  that's 200k — often too much (overpay) or, for a heavy instruction, too
  little (fail).
- The **max** any transaction can request is **1_400_000** CU.
- The `SetComputeUnitLimit` instruction itself costs ~150 CU — negligible.

## Right-size from a simulation (the correct way)

Simulate the transaction, read the CUs it actually consumed, then set the limit
to `consumed × 1.1`.

```ts
// @solana/web3.js v1
// 1) Simulate (replaceRecentBlockhash so you don't need a fresh one just to sim)
const sim = await connection.simulateTransaction(vtx, {
  replaceRecentBlockhash: true,
  sigVerify: false,
});
if (sim.value.err) throw new Error(`sim failed: ${JSON.stringify(sim.value.err)}\n${sim.value.logs?.join("\n")}`);
const consumed = sim.value.unitsConsumed ?? 200_000;

// 2) Set the real limit with a 10% margin, capped at the 1.4M max
const limit = Math.min(Math.ceil(consumed * 1.1), 1_400_000);
import { ComputeBudgetProgram } from "@solana/web3.js";
const limitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
```

```ts
// @solana/kit (2026) — there's a purpose-built estimator
import { getComputeUnitEstimateForTransactionMessageFactory } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";

const estimate = getComputeUnitEstimateForTransactionMessageFactory({ rpc });
const consumed = await estimate(txMessage);              // simulates for you
const limitIx = getSetComputeUnitLimitInstruction({
  units: Math.min(Math.ceil(consumed * 1.1), 1_400_000),
});
```

Add the limit instruction (and the price instruction from `priority-fees.md`)
to the transaction, then **re-simulate the final tx** before sending
(`sending.md`).

### Gotcha: simulate the *full* instruction set, including the budget instructions

The `SetComputeUnitLimit` and `SetComputeUnitPrice` instructions **consume CU
themselves** (~150 each). If you simulate the *bare* payload and then add the
two budget instructions to the final transaction, the final tx uses ~300 CU
**more** than you measured — and a tight limit derived from the bare
measurement fails with `Computational budget exceeded`.

So the probe you simulate must contain the same instructions as the final tx:
put a high placeholder `SetComputeUnitLimit` (e.g. 1.4M) **and** a
`SetComputeUnitPrice` (value `0` — the price doesn't change CU usage) alongside
your payload, read `unitsConsumed`, then rebuild the final tx with the real
limit and real price. This single mistake is the most common cause of
"my transaction simulated fine but fails on the tighter limit".

## Why the 10% margin

On-chain state moves between your simulation and execution (an account grows, a
branch flips), nudging CU usage up a little. Too tight → intermittent
`Computational budget exceeded` failures that are maddening to debug. 10% is a
good default; use 15–20% for txs whose cost depends heavily on live state (large
CPMM swaps, account resizing, loops over variable-length data).

## Heap and stack (rarely needed)

Programs default to a 32 KB heap. If a program documents that it needs more, add:

```ts
ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }); // multiple of 1024, ≤ 256KB
```

Stack frames are fixed by the runtime — you can't raise them; a stack error
means the *program* needs fixing (that's `solana-dev-skill` territory).

## Symptoms → fixes

| Symptom | Cause | Fix |
|---|---|---|
| `Computational budget exceeded` / `exceeded CUs meter` | Limit too low | Raise limit from a fresh simulation; add margin |
| Tx lands but priority fee is huge | Limit too high (e.g., 1.4M) on a contested account | Right-size limit from simulation |
| Intermittent CU failures only under load | Margin too tight | 15–20% margin, or simulate against `processed` state |

## Checklist

- [ ] Simulated and read `unitsConsumed` (didn't guess).
- [ ] Limit = `consumed × 1.1`, capped at 1.4M.
- [ ] Exactly one `SetComputeUnitLimit` and one `SetComputeUnitPrice` in the tx.
- [ ] Re-simulated the final tx (with both budget instructions) before sending.
