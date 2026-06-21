# Slippage & MEV — protecting swaps

Solana has no public mempool like Ethereum, but **sandwich attacks are real**:
searchers and leaders can observe inbound transactions and insert a buy before
and a sell after yours, pocketing the difference. Your loss is bounded by **how
much slippage you allowed** — which is exactly the lever attackers exploit.

The whole game: **allow the smallest slippage that still executes, and route so
your swap isn't a sitting duck.**

## Slippage is the sandwich's profit ceiling

If you set 50% slippage "so it doesn't fail", you've told the network it can
move the price up to 50% against you — and a sandwich will take as much of that
as it can. Instead:

- Use a **tight, realistic** tolerance: ~0.1–0.5% for liquid pairs, a bit more
  for thin liquidity. Quote first and base it on the **price impact** the quote
  reports, not a round number.
- Prefer **`minimum_amount_out`** (an absolute floor you computed) over a raw
  percentage when the SDK supports it — it's unambiguous.
- For large orders, **split** into smaller clips or use RFQ/limit orders; a
  single large market swap maximizes both price impact and sandwich profit.

## Route so you're not exposed

1. **Send via Jito** (bundle or Jito tx path, `jito.md`). Landing in a single
   slot through a private path removes the easy public insertion window and lets
   you bundle a pre/post check.
2. **Land in one slot** with an adequate tip/priority fee — a tx that lingers
   across slots is easier to surround.
3. **Use a fresh quote** and a recent `minContextSlot`; executing on a stale
   quote is its own (self-inflicted) loss.

## Use Jupiter's protections (don't reinvent them)

For swaps, the Jupiter API already implements the hard parts — use them rather
than hand-rolling:

- **Dynamic slippage**: Jupiter estimates a tight, pair-aware slippage instead
  of a fixed percentage.
- **Jito/priority integration**: it can attach priority fees and route through
  Jito for landing.
- **RFQ / Metis routing**: for size, request-for-quote fills can beat AMM market
  orders and reduce MEV surface.

Defer swap *construction* to the Jupiter skill (`jup-ag/agent-skills`); this
skill's job is to make sure the swap is **sent** with tight slippage, a fresh
quote, and a private/landing-optimized path.

## A safe-swap checklist

- [ ] Quote fresh; read the **price impact** and set slippage from it (tight).
- [ ] Use `minimum_amount_out` / a computed floor, not a generous percentage.
- [ ] For size: split the order or use RFQ/limit, don't one-shot a market swap.
- [ ] Send via **Jito** (bundle or tip path) to shrink the insertion window.
- [ ] Adequate tip/priority so it lands in **one slot** (`jito.md`,
      `priority-fees.md`).
- [ ] Simulate; verify the expected out amount before sending value.

## What this skill does NOT claim

No client-side setup makes a swap *unsandwichable* — only *unprofitable to
sandwich*. Tight slippage + private routing + one-slot landing reduces the
attack's payoff to near zero, which is the real goal.
