# otp.com MCP server

An [MCP](https://modelcontextprotocol.io) server for the [otp.com](https://otp.com) OTP API. Point
your own AI system at it and it can send, verify, resend, and check one-time passwords using your
API key.

It is a thin, self-contained client of the public OTP API (`/otp/*`, Bearer auth). No backend code
and no secrets in the source: you supply your own API key at runtime through an environment
variable, and it never leaves the process except as an `Authorization` header.

- **API contract:** [otp-com/sdk](https://github.com/otp-com/sdk) (`openapi.yaml`)
- **SDKs:** [Node.js](https://github.com/otp-com/sdk-node) ·
  [PHP](https://github.com/otp-com/sdk-php) · [Go](https://github.com/otp-com/sdk-go) ·
  [Python](https://github.com/otp-com/sdk-python)

## Setup

1. Create an API key in the otp.com panel under **API Keys**. `otp_live_…` sends for real,
   `otp_test_…` runs in sandbox.
2. Add the server to your MCP client (Claude Desktop, Claude Code, Cursor, or your own agent):

```json
{
  "mcpServers": {
    "otp": {
      "command": "npx",
      "args": ["-y", "@otp.com/mcp"],
      "env": {
        "OTP_API_KEY": "otp_live_your_key_here"
      }
    }
  }
}
```

Requires Node 18+. It speaks stdio, so the client spawns it; there is no port to open.

### Configuration

| Env var | Required | Default | Notes |
| --- | --- | --- | --- |
| `OTP_API_KEY` | yes | (none) | Your API key (Bearer). The only credential. |
| `OTP_API_BASE_URL` | no | `https://api.otp.com/api/v1` | Override for self-hosted or staging. |

A missing `OTP_API_KEY` fails at startup with an explicit message rather than at the first tool call.

## Tools

| Tool | Does | Input |
| --- | --- | --- |
| `send_otp` | Send a code; the channel comes from your account routing | `recipient`, `locale?` |
| `verify_otp` | Verify the code the user entered | `otp_id`, `code` |
| `resend_otp` | Resend on the next channel, or one you name | `otp_id`, `channel?` |
| `get_otp_status` | Check an OTP's status | `otp_id` |

`recipient` is a phone number in E.164 (`+14155552671`) or an email address. The code is never
returned by the API: you verify against the `otp_id` from `send_otp`.

Each tool returns the API payload as JSON text. A wrong code is a normal result
(`matched: false`), not an error; a rejected request comes back with `isError` set and the API's
message, so the calling model can react instead of guessing.

### WhatsApp: the code comes back to the user

Verification is identical on every channel, but WhatsApp delivery has one extra step. When
`send_otp` (or `resend_otp`) returns `channel: "whatsapp"`, the response also carries an
`action_url` and the code has **not** been sent yet:

1. Show the user `action_url` (a `wa.me` link).
2. They open it and send us the prefilled message from their own WhatsApp.
3. We reply over WhatsApp with the code. The OTP stays `pending` until they enter it.
4. Call `verify_otp` with the code they entered.

`action_url` is `null` on every other channel. Don't poll `get_otp_status` waiting for a WhatsApp
OTP to approve itself; nothing leaves `pending` without `verify_otp`. If the user has no WhatsApp,
call `resend_otp` with `channel: "sms"`.

## Development

```sh
pnpm install --ignore-workspace
pnpm run typecheck
pnpm run test
pnpm run build   # -> dist/ (the published artifact)
```

The protocol owns stdout: logs and diagnostics must go to stderr, or the client's connection breaks.

Unlike the language SDKs, this repo is hand-written rather than generated from `openapi.yaml`. When
the contract changes, update [`src/client.ts`](./src/client.ts) and
[`src/tools.ts`](./src/tools.ts) to match; the tool descriptions are what the model reads, so they
are part of the interface, not comments.

## License

MIT
