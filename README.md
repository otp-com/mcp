# otp-mcp

An [MCP](https://modelcontextprotocol.io) server for the **otp OTP API**. Point your own AI system at
it and it can send, verify, resend, and check one-time passwords, using your API key.

It's a thin, self-contained client of the public OTP API (`/otp/*`, Bearer auth). No backend code,
no secrets in the source: you supply your own API key at runtime via an environment variable.

## Setup

1. Create an API key in the OTP panel (**API Keys**). A `otp_live_…` key sends for real; a
   `otp_test_…` key runs in sandbox.
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

### Configuration

| Env var | Required | Default | Notes |
| --- | --- | --- | --- |
| `OTP_API_KEY` | yes | (none) | Your API key (Bearer). The only credential. |
| `OTP_API_BASE_URL` | no | `https://api.otp.com/api/v1` | Override for self-hosted / staging. |

## Tools

| Tool | Does | Input |
| --- | --- | --- |
| `send_otp` | Send a code (channel chosen by your account routing) | `recipient`, `locale?` |
| `verify_otp` | Verify the code the user entered | `otp_id`, `code` |
| `resend_otp` | Resend on the next (or a given) channel | `otp_id`, `channel?` |
| `get_otp_status` | Check an OTP's status | `otp_id` |

The code is never returned by the API; you verify against the `otp_id` from `send_otp`.

### WhatsApp: the code comes back to the user

Verification is identical on every channel, but WhatsApp delivery has one extra step. When
`send_otp` (or `resend_otp`) returns `channel: "whatsapp"`, the response also carries an
`action_url` and the code has not been sent yet:

1. Show the user `action_url` (a `wa.me` link).
2. They open it and send us the prefilled message from their own WhatsApp.
3. We reply over WhatsApp with the code. The OTP stays `pending` until they enter it.
4. Call `verify_otp` with the code they entered.

`action_url` is `null` on every other channel. Don't poll `get_otp_status` waiting for a WhatsApp
OTP to approve itself; nothing approves without `verify_otp`. If the user has no WhatsApp, call
`resend_otp` with `channel: "sms"`.

## Development

```sh
pnpm install --ignore-workspace
pnpm run typecheck
pnpm run test
pnpm run build   # -> dist/ (published artifact)
```
