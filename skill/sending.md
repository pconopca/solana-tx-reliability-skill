# Sending — the rebroadcast + confirm loop

This is where most "my transaction disappeared" bugs live. A naive
`sendTransaction()` followed by `confirmTransaction()` is **not reliable**: the
RPC can drop your tx, the current leader can skip it, and your blockhash expires
after ~150 slots (~60–90s). The default client retry is too weak to fix this.

The fix: **you** keep rebroadcasting the same signed transaction until it's
either confirmed or its blockhash has provably expired.

## Why blockhash expiry is the clock

Every transaction carries a recent blockhash and is only valid while that
blockhash is within ~150 blocks of the tip. `getLatestBlockhash` returns
`lastValidBlockHeight`. So the rule is:

> Keep resending until confirmed, **or** until the chain's block height passes
> `lastValidBlockHeight` — at which point the tx can never land and you must
> rebuild with a fresh blockhash.

This removes all guesswork: you never wait forever, and you never give up too
early.

## The robust send loop

```ts
// @solana/web3.js v1 — works for any signed VersionedTransaction
import { VersionedTransaction } from "@solana/web3.js";

async function sendRobust(connection, signedTx: VersionedTransaction, lastValidBlockHeight: number) {
  const raw = signedTx.serialize();
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: true,   // we already simulated; preflight just adds latency
    maxRetries: 0,         // WE control retries, not the RPC
  });

  while (true) {
    // 1) Is it done?
    const { value } = await connection.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      if (st.err) throw new Error(`tx landed but failed: ${JSON.stringify(st.err)}`);
      return sig; // success
    }

    // 2) Has the blockhash expired? Then it can never land — rebuild upstream.
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      throw new Error("blockhash expired before confirmation — rebuild with a fresh blockhash and retry");
    }

    // 3) Not done, not expired → rebroadcast the SAME bytes and wait a beat.
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

Key points:
- **Resend the identical signed bytes.** Re-signing with a new blockhash makes a
  *different* transaction with a *different* signature — only do that after
  expiry, as a fresh attempt.
- **Poll `getSignatureStatuses`**, don't rely on a single `confirmTransaction`.
- **`skipPreflight: true`** is correct *because you simulated separately*
  (`compute-budget.md`). If you didn't simulate, leave preflight on.
- A landed-but-failed tx has `confirmationStatus` set **and** `err` set — treat
  that as a failure, not a success (a frequent bug).

### `@solana/kit` note

Kit ships `sendAndConfirmTransactionFactory`, which implements a solid
confirm-by-signature-subscription strategy. It's a good default; reach for the
manual loop above when you need custom rebroadcast cadence, multi-RPC fan-out,
or to drive the cadence from `lastValidBlockHeight` yourself.

## Land harder: where you send matters

Rebroadcasting from a generic public RPC is the weakest path. To land under
load, in rough order of effectiveness:

1. **Staked / "sender" endpoints** (Helius Sender, Triton, etc.) forward your tx
   to the current leader over a staked connection — far better inclusion odds.
2. **Jito bundles** when you need atomicity or are racing others — see `jito.md`.
3. **Fan out**: send the same signed bytes to 2–3 RPCs in parallel; first
   inclusion wins (duplicates are harmless — same signature).

Pair any of these with the loop above; "where you send" and "keep resending"
are independent improvements that stack.

## Durable nonces — when a blockhash window is too short

If a tx must stay valid for minutes/hours (multisig collecting signatures,
offline/cold signing, scheduled execution), a ~90s blockhash window is too
short. Use a **durable nonce**:

- Create a Nonce account (owned by the System Program, holds a stored nonce).
- Make the **first instruction** `SystemProgram.nonceAdvance({ noncePubkey,
  authorizedPubkey })`, and use the stored nonce value as the tx's
  `recentBlockhash`.
- The tx stays valid until the nonce is advanced by *any* transaction; it never
  expires by time.

Use durable nonces only when you need that long window — for normal sends, a
fresh blockhash + the rebroadcast loop is simpler and better.

## Checklist

- [ ] Built + simulated + budgeted the tx (`compute-budget.md`).
- [ ] Sent with `maxRetries: 0`, then **self-rebroadcast every ~2s**.
- [ ] Confirmed via `getSignatureStatuses`, and checked `err` on the landed tx.
- [ ] Stopped on `blockHeight > lastValidBlockHeight`, then rebuilt with a fresh
      blockhash instead of waiting forever.
- [ ] For hard-to-land sends, used a staked/sender endpoint or Jito, and/or
      multi-RPC fan-out.
