# Jito — bundles and tips

By 2026 the Jito-Solana client runs under the large majority of stake, and Jito
**tips** carry most priority-fee volume. For two jobs, Jito is the best tool:

1. **Atomicity** — run up to 5 transactions that must all succeed together or
   not at all (e.g., create account → swap → close, or multi-leg arbitrage).
2. **Landing + protection** — pay a **tip** to get included by the current
   leader, and route through Jito's private path so a swap isn't exposed to
   opportunistic insertion (see also `slippage-mev.md`).

## Bundles in one paragraph

A **bundle** is an ordered list of up to **5 signed transactions** executed
**sequentially and atomically within one slot**: every tx lands or none do.
There's no partial execution, which makes bundles *safe* — a failed bundle
simply doesn't happen.

## The tip (get this exactly right)

- The tip is a plain **SOL transfer to one of Jito's tip accounts** — there are
  8 of them. **Fetch them at runtime** via the Block Engine `getTipAccounts`
  method; don't hardcode addresses that may rotate.
- Minimum tip is **1000 lamports**, but the minimum rarely lands under load.
- Put the tip in the **last transaction of the bundle**, ideally combined with
  your main instructions or as a final tip-only tx. Order: `[main tx, tip tx]`.
- **Do not reference tip accounts via an Address Lookup Table** — they must be
  full keys in the transaction.
- Size the tip from the live floor, not a guess:

```ts
// Tip floor API → pick a percentile and apply a multiplier with a floor
const floor = await (await fetch("https://bundles.jito.wtf/api/v1/bundles/tip_floor")).json();
const base = floor[0].landed_tips_50th_percentile; // SOL
const tipLamports = Math.max(10_000, Math.floor(base * 1e9 * 1.5)); // 1.5× p50, ≥10k lamports
```

## Sending a bundle

```ts
// Jito Block Engine JSON-RPC (regional endpoint, e.g. mainnet.block-engine.jito.wtf)
// 1) get tip accounts
const tipAccounts = (await rpc("getTipAccounts", [])).result; // pick one at random
// 2) build [mainTx, tipTx] — BOTH signed, base58 or base64 encoded
const res = await rpc("sendBundle", [[mainTxB64, tipTxB64], { encoding: "base64" }]);
const bundleId = res.result;
// 3) poll getBundleStatuses / getInflightBundleStatuses until landed or expired
```

Notes:
- Use a **fresh `processed` blockhash** for the main tx; the tip tx reuses the
  same blockhash.
- A bundle that doesn't land just expires (with the blockhash). Rebuild and
  resend, same as a normal tx — but you never get partial state.
- Endpoints are **regional**; send to the one nearest the leader schedule (the
  docs list them). Some providers (Helius, Triton) expose Jito sending for you.

## Tip vs. priority fee — which to use

| Situation | Use |
|---|---|
| Plain transfer / non-contested call | Priority fee only (often tiny) — no Jito |
| Contested mint, hot pool, must-land swap | **Jito tip** (frequently lands better than raw fee in 2026) |
| Multiple txs that must be atomic | **Bundle** (only way to get atomicity) |
| Swap you want shielded from sandwiching | Bundle via Jito's private path + tight slippage |

You can include **both** a small priority fee and a Jito tip; they're not
mutually exclusive.

## Pitfalls

- Tip too low → bundle never lands. Derive it from the tip-floor API.
- Tip account inside an ALT → rejected.
- Assuming a bundle "partially" executed — it can't; it's all-or-nothing.
- Forgetting the tip is **last** in the bundle.

See `resources.md` for Block Engine endpoints and the official Jito docs.
