# solana-tx-reliability-skill

> An agent skill that gets Solana transactions to **land** — confirmed, fast,
> cheap, and un-sandwiched — even during congestion.

A progressive, token-efficient [Agent Skill](https://github.com/solanabr/solana-ai-kit)
for Claude Code / Codex and other coding agents. It owns the client-side path
between *"I have instructions"* and *"it's confirmed on-chain"* — the part that
breaks constantly in real Solana apps and that no existing kit skill covers
end-to-end.

## The problem it solves

Almost every Solana builder hits the same wall: transactions that silently
**don't land**, cost 100–1000× too much in priority fees, run out of compute
units, expire with `BlockhashNotFound`, or get **sandwiched** on a swap. The
fixes are well known to a handful of experts and scattered across blog posts —
but agents (and most devs) get them wrong. This skill encodes the current,
2026-correct playbook so an agent can do it right by default.

It is an **add-on**: it deliberately does *not* teach program development
(that's `solana-dev-skill`). It focuses on one thing and does it completely.

## What's inside

```
skill/
  SKILL.md          # entry point — routes to the file the task needs
  priority-fees.md  # compute-unit PRICE: live estimation, percentiles, capping
  compute-budget.md # compute-unit LIMIT: simulation-based sizing, CU exhaustion
  transactions.md   # v0 transactions, Address Lookup Tables, size limits
  sending.md        # the send → self-rebroadcast → confirm loop, durable nonces
  jito.md           # bundles & tips: atomic sends, tip floor, ordering
  slippage-mev.md   # sandwich/MEV protection and slippage for swaps
  debugging.md      # diagnose failed / dropped / expired transactions
  resources.md      # RPC providers, tools, libraries, references
scripts/
  send-robust.ts    # runnable reference implementation of the golden path
  tx-doctor.ts      # paste a signature → it explains why a tx failed/landed
commands/           # optional slash commands (/send-robust, /tx-doctor)
install.sh          # copy the skill into ~/.claude/skills or ./.claude/skills
install-custom.sh   # choose location / skip core overlap
```

## The golden path (what the skill enforces)

Every reliable send is the same six steps: **build → size compute (simulate) →
price priority (from live data) → simulate → send with `maxRetries: 0` and
rebroadcast yourself → confirm by polling**. Skipping simulation or
self-rebroadcast is the #1 cause of "my transaction disappeared". See
`skill/SKILL.md`.

## Install

```bash
# from the repo root
./install.sh            # installs to ./.claude/skills/solana-tx-reliability
# or
./install-custom.sh     # pick personal (~/.claude/skills) vs project, skip overlap
```

Then your agent loads it automatically when a task matches the skill's
description (sending transactions, priority fees, "tx not landing", etc.).

## Try the helpers (safe — devnet by default)

```bash
npm install
export SOLANA_RPC_URL="https://api.devnet.solana.com"
npx tsx scripts/tx-doctor.ts <SIGNATURE>     # explain any transaction
npx tsx scripts/send-robust.ts               # demo a robust self-transfer
```

The scripts never touch mainnet funds unless you explicitly set a mainnet RPC
and keypair.

## 2026 stack

Built and verified against the 2026 Solana stack: `@solana/kit` (the maintained
successor to web3.js, with `@solana/web3.js` v1 notes for existing code),
Helius `getPriorityFeeEstimate`, native `getRecentPrioritizationFees`, and Jito
bundles/tips. Fee math, CU limits, and Jito tip handling follow current
guidance.

## License

MIT — ready to be merged or submoduled into the Solana AI Kit.
