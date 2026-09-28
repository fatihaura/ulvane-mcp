#!/usr/bin/env node
// Ulvane MCP server (stdio). Exposes Ulvane's x402-priced Base onchain
// intelligence as tools an AI agent (Claude Desktop, Cursor, ...) can call.
//
// The agent's own wallet pays per call in USDC on Base via x402 — the key is
// read from EVM_PRIVATE_KEY on the user's machine and never leaves it. Use a
// dedicated wallet funded with a few dollars, never a main wallet.
//
// Env:
//   EVM_PRIVATE_KEY      required for paid tools
//   ULVANE_BASE_URL      default https://www.ulvane.xyz
//   ULVANE_MAX_PRICE_USD hard per-call spend cap, default 0.05

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { isAddress } from "viem";

const BASE_URL = (process.env.ULVANE_BASE_URL ?? "https://www.ulvane.xyz").replace(/\/$/, "");
const MAX_PRICE_USD = Number(process.env.ULVANE_MAX_PRICE_USD ?? "0.05");
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

const fetchWithPayment = PRIVATE_KEY
  ? wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(privateKeyToAccount(PRIVATE_KEY)) }],
    })
  : null;

function textResult(payload, isError = false) {
  return { content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }], isError };
}

async function callPaid(path, priceUsd) {
  if (!fetchWithPayment) {
    return textResult(
      "EVM_PRIVATE_KEY is not set. Paid Ulvane tools need a dedicated Base wallet holding a few dollars of USDC — set EVM_PRIVATE_KEY in this MCP server's env.",
      true,
    );
  }
  if (priceUsd > MAX_PRICE_USD) {
    return textResult(`Refusing: this call costs $${priceUsd}, above the ULVANE_MAX_PRICE_USD cap of $${MAX_PRICE_USD}.`, true);
  }
  try {
    const res = await fetchWithPayment(`${BASE_URL}${path}`, { method: "GET" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return textResult({ status: res.status, error: body?.error ?? "Request failed" }, true);
    }
    const header = res.headers.get("PAYMENT-RESPONSE");
    const settlement = header ? decodePaymentResponseHeader(header) : undefined;
    return textResult({ ...body, _payment: { priceUsd, settlement } });
  } catch (err) {
    return textResult(`Payment or request failed: ${err instanceof Error ? err.message : "unknown error"}`, true);
  }
}

const address = (what) =>
  z.string().refine((v) => isAddress(v), { message: `Must be a 0x-prefixed 40-character hex ${what} address` });

const server = new McpServer({ name: "ulvane", version: "0.2.0" });

server.registerTool(
  "token_risk",
  {
    description:
      "Check whether a Base token is a hand-verified real token, a symbol impersonator (scam clone), or simply unvetted. Call before buying an unfamiliar token. Costs $0.01 USDC via x402.",
    inputSchema: { address: address("token") },
  },
  ({ address }) => callPaid(`/api/token/${address}/risk`, 0.01),
);

server.registerTool(
  "wallet_pnl",
  {
    description:
      "Realized/unrealized PnL for a Base wallet from its swap history, using a running-average cost basis (not balance x price). Costs $0.02 USDC via x402.",
    inputSchema: { wallet: address("wallet") },
  },
  ({ wallet }) => callPaid(`/api/pnl/${wallet}`, 0.02),
);

server.registerTool(
  "wallet_risk",
  {
    description:
      "Check whether a Base wallet has recently traded tokens flagged as impersonators. Returns flagged / clean / insufficient_data. Costs $0.02 USDC via x402.",
    inputSchema: { wallet: address("wallet") },
  },
  ({ wallet }) => callPaid(`/api/wallet/${wallet}/risk`, 0.02),
);

server.registerTool(
  "token_top_traders",
  {
    description:
      "Largest recent traders of a Base token ranked by volume moved, with their realized/unrealized PnL. Costs $0.03 USDC via x402.",
    inputSchema: { address: address("token") },
  },
  ({ address }) => callPaid(`/api/token/${address}/top-traders`, 0.03),
);

server.registerTool(
  "pre_trade_gate",
  {
    description:
      "Combined pre-trade check: token risk + top 3 traders by volume, plus an optional wallet risk check, in one call. Returns a clear/caution/avoid verdict. Cheaper than calling token_risk + token_top_traders + wallet_risk separately ($0.06). Costs $0.05 USDC via x402.",
    inputSchema: { address: address("token"), wallet: address("wallet").optional() },
  },
  ({ address, wallet }) => callPaid(`/api/token/${address}/pre-trade-gate${wallet ? `?wallet=${wallet}` : ""}`, 0.05),
);

server.registerTool(
  "base_leaderboard",
  {
    description: "Free. Top realized-PnL wallets on Aerodrome (Base) over the last 1h, 8h, 12h or 1d.",
    inputSchema: { range: z.enum(["1h", "8h", "12h", "1d"]).default("1h") },
  },
  async ({ range }) => {
    try {
      const res = await fetch(`${BASE_URL}/api/leaderboard?range=${range}`);
      const body = await res.json().catch(() => null);
      return res.ok ? textResult(body) : textResult({ status: res.status, error: body?.error ?? "Request failed" }, true);
    } catch {
      return textResult("Could not reach Ulvane right now.", true);
    }
  },
);

await server.connect(new StdioServerTransport());
