/**
 * tx-doctor — explain why a Solana transaction failed, dropped, or succeeded.
 *
 * Usage:
 *   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com npx tsx scripts/tx-doctor.ts <SIGNATURE>
 *   (defaults to mainnet-beta; for a devnet signature, set a devnet RPC URL)
 *
 * Read-only: it never sends anything. See skill/debugging.md for the method.
 */
import { Connection } from "@solana/web3.js";

// A few high-frequency SPL Token error codes (program error space, hex).
const SPL_TOKEN_ERRORS: Record<number, string> = {
  0x0: "NotRentExempt",
  0x1: "InsufficientFunds",
  0x2: "InvalidMint",
  0x3: "MintMismatch",
  0x4: "OwnerMismatch",
  0xa: "MintDecimalsMismatch",
};

function decodeCustom(code: number): string {
  if (code >= 6000) {
    return `Anchor program error. IDL error index = ${code - 6000} (0x${code.toString(16)}). ` +
      `Look up index ${code - 6000} in the program's IDL "errors" array.`;
  }
  if (code >= 2000 && code < 4000) {
    return `Anchor framework constraint error ${code} (e.g. 2003 ConstraintRaw, 2006 ConstraintSeeds, 3012 AccountNotInitialized).`;
  }
  if (SPL_TOKEN_ERRORS[code]) {
    return `Likely SPL Token error 0x${code.toString(16)}: ${SPL_TOKEN_ERRORS[code]}.`;
  }
  return `Custom program error ${code} (0x${code.toString(16)}). Check the failing program's error definitions.`;
}

async function main() {
  const sig = process.argv[2];
  if (!sig) {
    console.error("Usage: npx tsx scripts/tx-doctor.ts <SIGNATURE>");
    process.exit(1);
  }
  const url = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const isDevnet = url.includes("devnet");
  const connection = new Connection(url, "confirmed");

  const tx = await connection.getTransaction(sig, {
    maxSupportedTransactionVersion: 0, // required, or v0 transactions throw
    commitment: "confirmed",
  });

  if (!tx) {
    console.log(`No on-chain record for:\n  ${sig}\n`);
    console.log("→ The transaction was DROPPED (never included) or is not confirmed yet.");
    console.log("  Likely causes & fixes (see skill/sending.md):");
    console.log("   • You didn't rebroadcast until confirmed.");
    console.log("   • The blockhash expired before it landed.");
    console.log("   • A weak/unstaked RPC — use a staked/sender endpoint or fan out.");
    console.log("   • Priority too low for a contested account (skill/priority-fees.md) — or use Jito (skill/jito.md).");
    return;
  }

  const meta = tx.meta;
  const ok = !meta?.err;
  console.log(`Signature : ${sig}`);
  console.log(`Slot      : ${tx.slot}`);
  console.log(`Status    : ${ok ? "SUCCESS ✅" : "FAILED ❌"}`);
  console.log(`Fee       : ${meta?.fee ?? "?"} lamports`);
  if (meta?.computeUnitsConsumed != null) console.log(`CU used   : ${meta.computeUnitsConsumed}`);

  if (!ok) {
    const errStr = JSON.stringify(meta?.err ?? {});
    console.log(`\nError     : ${errStr}`);
    const m = errStr.match(/"Custom":\s*(\d+)/);
    if (m) console.log(`Decoded   : ${decodeCustom(Number(m[1]))}`);
    const logs = meta?.logMessages ?? [];
    if (errStr.includes("ComputeBudgetExceeded") || logs.some(l => l.includes("exceeded CUs") || l.includes("exceeded the maximum"))) {
      console.log("Decoded   : Ran out of compute units — raise the CU limit from a fresh simulation (skill/compute-budget.md).");
    }
  }

  const logs = meta?.logMessages ?? [];
  if (logs.length) {
    console.log("\nProgram logs:");
    for (const l of logs) console.log(`  ${l}`);
  }

  console.log(`\nExplorer  : https://explorer.solana.com/tx/${sig}${isDevnet ? "?cluster=devnet" : ""}`);
}

main().catch((e) => {
  console.error("tx-doctor error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
