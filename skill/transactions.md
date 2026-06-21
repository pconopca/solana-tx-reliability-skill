# Transactions — v0, size limits, and Address Lookup Tables

Reliability starts with a well-formed transaction. Two hard facts drive
everything here:

- A serialized transaction must be **≤ 1232 bytes**. Exceed it →
  `Transaction too large`. This is the real constraint, not a "number of
  instructions" limit.
- Every account a tx references costs **32 bytes** in that budget. A legacy tx
  can fit ~35 accounts before it's full; complex DeFi routes blow past that.

**Address Lookup Tables (ALTs)** are how you fit more: store addresses in an
on-chain table once, then reference each with a **1-byte index** instead of 32
bytes. ALTs require **versioned (v0)** transactions.

## Always build v0 (versioned) transactions

There's no downside to v0 for new code, and you need it for ALTs and for most
DeFi SDKs (Jupiter, etc.) in 2026. Use legacy only if a tool forces it.

```ts
// @solana/web3.js v1
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const { blockhash } = await connection.getLatestBlockhash("confirmed");
const message = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions,                 // [computeLimitIx, computePriceIx, ...yourIxs]
}).compileToV0Message(lookupTables); // pass [] if you have no ALTs
const vtx = new VersionedTransaction(message);
vtx.sign([payer]);
```

```ts
// @solana/kit (2026) — messages are built functionally and signed at the end
import {
  createTransactionMessage, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  pipe, signTransactionMessageWithSigners,
} from "@solana/kit";

const message = pipe(
  createTransactionMessage({ version: 0 }),
  m => setTransactionMessageFeePayer(payer.address, m),
  m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  m => appendTransactionMessageInstructions(instructions, m),
);
const signedTx = await signTransactionMessageWithSigners(message);
```

## When you need an Address Lookup Table

Use an ALT if either is true:
- The transaction is **> 1232 bytes** (you'll get `Transaction too large`), or
- It references **more than ~25–30 accounts** (multi-hop swaps, batch ops).

Most single transfers and simple program calls do **not** need one — don't add
complexity you don't need.

### Create and use an ALT (once, then reuse)

```ts
// @solana/web3.js v1 — create + extend, then WAIT one slot before using it
import { AddressLookupTableProgram } from "@solana/web3.js";

const slot = await connection.getSlot();
const [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
  authority: payer.publicKey, payer: payer.publicKey, recentSlot: slot,
});
const extendIx = AddressLookupTableProgram.extendLookupTable({
  lookupTable: lookupTableAddress, authority: payer.publicKey, payer: payer.publicKey,
  addresses: [/* the accounts you'll reuse */],
});
// send [createIx, extendIx]; an ALT is only usable from the NEXT slot onward.

// later, fetch and pass it when compiling:
const lut = (await connection.getAddressLookupTable(lookupTableAddress)).value!;
const message = new TransactionMessage({ payerKey, recentBlockhash, instructions })
  .compileToV0Message([lut]);
```

ALT gotchas:
- **Warm-up:** a freshly created/extended table is not usable in the same slot.
  Create/extend in one tx, use it in a later one.
- **Rent:** creating an ALT costs rent; deactivate + close to reclaim it when
  done. Reuse one table across many txs — that's the whole point.
- **Don't put Jito tip accounts in an ALT** — Jito requires the tip account to
  be a full key in the tx (see `jito.md`).

## Keeping under 1232 bytes

In order of impact: use ALTs for repeated accounts → remove redundant signers →
split into multiple transactions (or a Jito bundle, `jito.md`, for atomicity) →
drop optional memo/log instructions.

## Checklist

- [ ] Versioned (v0) message.
- [ ] Compute-budget instructions included (`compute-budget.md`,
      `priority-fees.md`).
- [ ] If `> 1232 bytes` or many accounts → ALT, created in an earlier slot.
- [ ] Fee payer set; blockhash from `getLatestBlockhash("confirmed")` (track
      `lastValidBlockHeight` for the send loop in `sending.md`).
