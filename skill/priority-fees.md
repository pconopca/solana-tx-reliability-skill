# Priority fees — setting the compute-unit *price*

Goal: pay the **smallest** priority fee that still lands your transaction. A
priority fee is the compute-unit *price*; the total you pay is:

```
priority_fee_lamports = ceil(compute_unit_limit × compute_unit_price_microlamports / 1_000_000)
```

100% of it goes to the validator, on top of the base `5000 lamports ×
num_signatures`. Two levers therefore set your fee: the **limit** (see
`compute-budget.md`) and the **price** (this file). You must control both — a
high price on a 1.4M-CU limit is how people accidentally pay $20 for a transfer.

## When priority fees matter (and when they don't)

Solana has **local fee markets**: during congestion you compete only with other
transactions that need a **write lock on the same accounts** you do. So:

- Touching a hot account (trending token pool, popular mint, oracle) → you need
  a competitive price.
- A plain SOL or token transfer to a cold account during normal load → a tiny
  price (or none) lands fine. Don't overpay out of superstition.

This is why you must estimate from the **writable accounts your tx touches**,
not from a global "network is busy" number.

## How to estimate (pick one source)

### 1. Native: `getRecentPrioritizationFees` (no extra provider)

Returns the prioritization fee paid per slot over ~150 recent slots, optionally
filtered to transactions that locked your accounts.

```ts
// @solana/web3.js v1
const recent = await connection.getRecentPrioritizationFees({
  lockedWritableAccounts: [poolPubkey, userTokenAccount], // WRITABLE accounts only
});
const fees = recent.map(r => r.prioritizationFee).filter(f => f > 0).sort((a, b) => a - b);
const p75 = fees.length ? fees[Math.floor(fees.length * 0.75)] : 0; // micro-lamports/CU
```

Caveats that bite people:
- **Pass writable accounts, never program IDs.** Programs are read-only in user
  txs, so they don't appear in the per-account fee map; passing a program ID
  returns near-empty data and a misleadingly low fee.
- It's a floor/snapshot, not a prediction. Take a **percentile** (50th for
  routine, 75th for time-sensitive, higher for contested mints), not the max.

### 2. Helius `getPriorityFeeEstimate` (smarter, recommended when available)

Considers global *and* local fee markets and returns percentile levels
(`min, low, medium, high, veryHigh, unsafeMax`); `medium` is the default.

```ts
const res = await fetch(HELIUS_RPC_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: "1", method: "getPriorityFeeEstimate",
    params: [{
      transaction: base64SerializedTx,        // OR accountKeys: [...writable...]
      options: { recommended: true },          // or priorityLevel: "High"
    }],
  }),
});
const { result } = await res.json();
const microLamports = Math.ceil(result.priorityFeeEstimate); // micro-lamports/CU
```

Prefer passing the **serialized transaction** (Helius reads the real account
list) or an explicit list of **writable** accounts.

## Apply it to the transaction

The price instruction must be a `ComputeBudgetProgram` instruction; order
relative to other instructions doesn't matter, but include it exactly once.

```ts
// @solana/web3.js v1
import { ComputeBudgetProgram } from "@solana/web3.js";
instructions.unshift(
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
);
```

```ts
// @solana/kit (2026) — from @solana-program/compute-budget
import { getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
const priceIx = getSetComputeUnitPriceInstruction({ microLamports });
```

## Always cap the fee

Estimates spike during chaos. Convert your *max acceptable total fee* into a
price ceiling so a bad estimate can't drain a wallet:

```ts
// Cap total priority fee at, say, 0.0005 SOL = 500_000 lamports
const MAX_PRIORITY_LAMPORTS = 500_000;
const cap = Math.floor(MAX_PRIORITY_LAMPORTS * 1_000_000 / computeUnitLimit);
const finalPrice = Math.min(estimatedMicroLamports, cap);
```

## Decision recipe (the default an agent should follow)

1. Determine the **writable** accounts the tx will touch.
2. Get an estimate for *those accounts* (Helius `getPriorityFeeEstimate` if you
   have a Helius RPC, else native `getRecentPrioritizationFees` p75).
3. Compute a **price cap** from a max-total-fee budget and the CU limit.
4. Use `min(estimate, cap)`. If `estimate` is 0, you may send with no priority
   fee at all.
5. Pair this with a **tight CU limit from simulation** (`compute-budget.md`) —
   never leave the 200k default or set 1.4M.
6. For swaps / contested mints where landing is critical, consider a **Jito
   tip** instead of (or in addition to) a raw priority fee (`jito.md`).

## Common mistakes

- Hardcoding `microLamports: 1_000_000` "to be safe" → paying 100–1000× too
  much. Always derive + cap.
- Estimating against the program ID → near-zero fee → tx never lands.
- Bumping the price while leaving a 1.4M CU limit → huge fee, still may not land
  because the *real* bottleneck was CU exhaustion or a stale blockhash.
- Treating the estimate as a guarantee — it isn't; pair with self-rebroadcast
  (`sending.md`).
