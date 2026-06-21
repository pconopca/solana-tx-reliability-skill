/**
 * send-robust — reference implementation of the "golden path" from SKILL.md.
 *
 * Demonstrates, end to end:
 *   build → simulate to size the CU limit → price the priority fee from live
 *   data (capped) → simulate the final tx → send with maxRetries:0 and
 *   self-rebroadcast every ~2s → confirm by polling, stopping on blockhash
 *   expiry. The demo payload is a harmless 1-lamport self-transfer.
 *
 * Safe by default (devnet):
 *   SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx scripts/send-robust.ts
 *
 * Options:
 *   SOLANA_KEYPAIR=/path/to/id.json   use an existing key (else ephemeral + airdrop)
 *   SOLANA_ALLOW_MAINNET=1            required to run against a non-devnet RPC
 */
import {
  Connection, Keypair, SystemProgram, ComputeBudgetProgram,
  TransactionMessage, VersionedTransaction, PublicKey, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";

const url = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const isDevnet = url.includes("devnet");

if (!isDevnet && process.env.SOLANA_ALLOW_MAINNET !== "1") {
  console.error("Refusing to run against a non-devnet RPC without SOLANA_ALLOW_MAINNET=1.");
  console.error("Demo safely on devnet: SOLANA_RPC_URL=https://api.devnet.solana.com");
  process.exit(1);
}

function loadKeypair(): Keypair {
  const p = process.env.SOLANA_KEYPAIR;
  if (p) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
  return Keypair.generate();
}

// Estimate the compute-unit PRICE from recent fees on the WRITABLE accounts the
// tx touches (never program IDs), take the 75th percentile, and cap the total.
async function estimatePriorityMicroLamports(
  connection: Connection, writable: PublicKey[], cuLimit: number,
): Promise<number> {
  try {
    const recent = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: writable });
    const fees = recent.map(r => r.prioritizationFee).filter(f => f > 0).sort((a, b) => a - b);
    const p75 = fees.length ? fees[Math.floor(fees.length * 0.75)] : 0;
    const MAX_PRIORITY_LAMPORTS = 500_000;                       // cap total priority fee at 0.0005 SOL
    const cap = Math.floor((MAX_PRIORITY_LAMPORTS * 1_000_000) / cuLimit);
    return Math.min(p75, cap);
  } catch {
    return 0; // no data → send with no priority fee
  }
}

async function main() {
  const connection = new Connection(url, "confirmed");
  const payer = loadKeypair();
  console.log(`RPC     : ${url}`);
  console.log(`Payer   : ${payer.publicKey.toBase58()}`);

  // Fund on devnet if needed.
  let bal = await connection.getBalance(payer.publicKey);
  if (bal < 0.001 * LAMPORTS_PER_SOL && isDevnet) {
    console.log("Low balance — requesting a devnet airdrop…");
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    } catch {
      console.warn("Airdrop failed (faucet may be rate-limited). Fund the address above and retry.");
    }
    bal = await connection.getBalance(payer.publicKey);
  }
  console.log(`Balance : ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal < 6000) { console.error("Not enough SOL to pay fees. Fund the payer and retry."); process.exit(1); }

  // Payload: a harmless 1-lamport self-transfer.
  const transferIx = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 });
  const writable = [payer.publicKey];

  // 1) Fresh blockhash + the expiry clock.
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  // 2) Simulate with a high CU limit to read REAL usage. The probe MUST contain
  //    the same instruction set as the final tx — including BOTH compute-budget
  //    instructions — because they consume CU too. Measuring the bare payload
  //    under-counts and makes the final (tighter) tx fail with
  //    "Computational budget exceeded". The price value doesn't affect CU, so a
  //    0 placeholder is fine here.
  const probe = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
      transferIx,
    ],
  }).compileToV0Message());
  probe.sign([payer]);
  const sim = await connection.simulateTransaction(probe, { replaceRecentBlockhash: true, sigVerify: false });
  if (sim.value.err) { console.error("Simulation failed:", sim.value.err, sim.value.logs); process.exit(1); }
  const consumed = sim.value.unitsConsumed ?? 1000;
  const cuLimit = Math.min(Math.ceil(consumed * 1.1), 1_400_000);
  console.log(`Sim CU  : used ${consumed} → limit ${cuLimit} (×1.1 margin)`);

  // 3) Price the priority fee from live data on the writable accounts.
  const micro = await estimatePriorityMicroLamports(connection, writable, cuLimit);
  const estFee = Math.ceil((cuLimit * micro) / 1_000_000);
  console.log(`Priority: ${micro} µlamports/CU (≈ ${estFee} lamports priority fee)`);

  // 4) Build the FINAL tx with both compute-budget instructions, then re-simulate.
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: micro }),
      transferIx,
    ],
  }).compileToV0Message());
  tx.sign([payer]);

  const sim2 = await connection.simulateTransaction(tx, { replaceRecentBlockhash: true, sigVerify: false });
  if (sim2.value.err) { console.error("Final simulation failed:", sim2.value.err, sim2.value.logs); process.exit(1); }

  // 5) Send with maxRetries:0 and rebroadcast the SAME bytes until confirmed or expired.
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
  console.log(`Sent    : ${sig}\nConfirming (self-rebroadcasting every 2s)…`);

  while (true) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      if (st.err) { console.error("Landed but FAILED:", st.err); process.exit(1); }
      console.log(`Confirmed ✅  https://explorer.solana.com/tx/${sig}${isDevnet ? "?cluster=devnet" : ""}`);
      return;
    }
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      console.error("Blockhash expired before confirmation — rebuild with a fresh blockhash and retry (skill/sending.md).");
      process.exit(1);
    }
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error("send-robust error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
