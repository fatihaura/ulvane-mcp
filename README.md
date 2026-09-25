# ulvane-mcp

An MCP server that lets AI agents (Claude Desktop, Cursor, any MCP client) call [Ulvane](https://www.ulvane.xyz)'s onchain intelligence for Base as tools. Each paid call is settled per-request in USDC on Base via [x402](https://x402.org) — no API keys, no accounts.

| Tool | What it does | Price |
|---|---|---|
| `token_risk` | Verified / impersonator / unvetted check for a token | $0.01 |
| `wallet_pnl` | Realized/unrealized PnL from swap history | $0.02 |
| `wallet_risk` | Has this wallet traded flagged impersonator tokens? | $0.02 |
| `token_top_traders` | Biggest recent traders of a token, with PnL | $0.03 |
| `base_leaderboard` | Top Aerodrome wallets by realized PnL (1h/8h/12h/1d) | free |

## Setup

```bash
git clone https://github.com/fatihaura/ulvane-mcp
cd ulvane-mcp && npm install
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ulvane": {
      "command": "node",
      "args": ["/absolute/path/to/ulvane-mcp/index.mjs"],
      "env": { "EVM_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Restart Claude Desktop fully, then use it from a regular chat.

**Use a dedicated wallet** holding only a few dollars of USDC on Base. The key is read locally and only used to sign x402 payment authorizations; it is never sent to Ulvane. Without `EVM_PRIVATE_KEY`, only the free `base_leaderboard` tool works.

Optional env: `ULVANE_MAX_PRICE_USD` (per-call spend cap, default `0.05`), `ULVANE_BASE_URL`.

Every paid response is EIP-191 signed by Ulvane — see the [docs](https://www.ulvane.xyz/docs) for offline verification.

## License

MIT
