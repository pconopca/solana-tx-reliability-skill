# Debugging — why a transaction failed, dropped, or expired

Every failure is one of three kinds. Identify the kind first; the fix follows.

| Kind | Tell-tale | Where to look |
|---|---|---|
| **Landed but failed** | You have a signature; explorer shows it with a red error | `getTransaction` → `meta.err` + logs |
| **Dropped (never landed)** | Signature exists locally but no on-chain record | blockhash validity + rebroadcast (`sending.md`) |
| **Expired** | `BlockhashNotFound` / "block height exceeded" | rebuild with fresh blockhash (`sending.md`) |

## Landed-but-failed: pull the receipt

```ts
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,   // REQUIRED or v0 txs throw
  commitment: "confirmed",
});
console.log("err:", tx?.meta?.err);
console.log("CU used:", tx?.meta?.computeUnitsConsumed);
console.log("fee:", tx?.meta?.fee);
console.log((tx?.meta?.logMessages ?? []).join("\n"));
```

The **logs** almost always name the failing program and reason
(`Program <id> failed: custom program error: 0x...`). `scripts/tx-doctor.ts`
does all of this from a signature and prints a plain-English summary.

## Decoding common errors

| Error | Meaning | Fix |
|---|---|---|
| `Computational budget exceeded` / `exceeded CUs meter` | CU limit too low | Raise limit from a fresh simulation (`compute-budget.md`) |
| `custom program error: 0x1` (SPL Token) | Insufficient funds | Check token balance / decimals |
| `custom program error: 0x1771` etc. | Anchor program error | Decode (below) |
| `Transaction too large` | > 1232 bytes | Use ALTs / split (`transactions.md`) |
| `BlockhashNotFound` | Blockhash expired or RPC behind | Fresh blockhash; healthier RPC (`sending.md`) |
| `Attempt to debit an account but found no record of a prior credit` | Fee payer / account has 0 lamports, or wrong account | Fund the payer; check account is correct |
| `insufficient lamports` / `insufficient funds for rent` | Not enough SOL for transfer or rent-exempt minimum | Add SOL; meet rent-exempt minimum |
| `AccountNotFound` / `ProgramAccountNotFound` | Account/ATA doesn't exist | Create the ATA / account first |
| `Provided seeds do not result in a valid address` | Wrong PDA seeds/bump | Recompute the PDA |

### Anchor error codes

Anchor encodes errors as hex. Convert to decimal:

- **≥ 6000**: a program's **own** `#[error_code]` error. Index = `code − 6000`
  (so `0x1771` = 6001 = the 2nd custom error). Map it via the program's IDL.
- **2000–3999**: an Anchor **framework** constraint error (e.g., 2003
  `ConstraintRaw`, 2006 `ConstraintSeeds`, 3012 `AccountNotInitialized`).

`0x1771` → `parseInt("1771", 16)` = `6001`. Look up index 1 in the IDL's
`errors` array.

## Dropped: it never reached a block

If `getTransaction` returns `null` and no explorer has it, the tx was **dropped**
before inclusion. Causes and fixes:

- Didn't rebroadcast → implement the loop in `sending.md`.
- Blockhash already near expiry when sent → fetch blockhash right before sending.
- Weak RPC → use a staked/sender endpoint, or fan out to several RPCs.
- Priority too low for a contested account → raise it (`priority-fees.md`) or use
  Jito (`jito.md`).

## Reproduce safely with simulation

Before resending, reproduce the failure for free:

```ts
const sim = await connection.simulateTransaction(vtx, { replaceRecentBlockhash: true, sigVerify: false });
console.log(sim.value.err, sim.value.logs, sim.value.unitsConsumed);
```

A simulation reproduces logic/CU/account errors without spending fees. It will
**not** reproduce landing problems (those are network-side, not logic).

## Tools

- `solana confirm -v <signature>` — CLI, full logs.
- Explorers: Solana Explorer, Solscan, SolanaFM — paste the signature for
  decoded instructions and logs.
- Helius Enhanced Transactions API — human-readable, decoded transaction view.
- `scripts/tx-doctor.ts` (this repo) — one command, plain-English diagnosis.
