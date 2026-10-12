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
2. Add the server to your MCP client. Most CLIs take a one-liner:

```sh
# Claude Code
claude mcp add otp -s user -e OTP_API_KEY=otp_live_your_key_here -- npx -y @otp.com/mcp

# Codex
codex mcp add otp --env OTP_API_KEY=otp_live_your_key_here -- npx -y @otp.com/mcp

# VS Code
code --add-mcp '{"name":"otp","command":"npx","args":["-y","@otp.com/mcp"],"env":{"OTP_API_KEY":"otp_live_your_key_here"}}'
```

`-s user` registers it for every project; drop it to add it to the current one only. All three write
the key into a config file in plain text, and it lands in your shell history too, so on a shared
machine edit the config by hand instead.

Clients configured by file (Claude Desktop, Cursor, your own agent) take the same server as JSON:

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
| `send_otp` | Send a code; the channel comes from your account routing | `recipient`, `locale?`, `client_ip?` |
| `verify_otp` | Verify the code the user entered | `otp_id`, `code` |
| `resend_otp` | Resend on the next channel, or one you name | `otp_id`, `channel?` |
| `get_otp_status` | Check an OTP's status and how it completes | `otp_id` |

`recipient` is a phone number in E.164 (`+14155552671`) or an email address. `client_ip` is the
IP of the **end user** being verified, when the calling application has it from its own request
context: pass it whenever you can (requests without it share a much tighter rate limit and skip
IP-based abuse protection), but never invent one and never send the machine's own address. The code
is never returned by the API: you verify against the `otp_id` from `send_otp`. The input bounds
mirror the API's own validation (`recipient` 320 chars, `locale` 10, `code` 16, `otp_id` a UUID,
`client_ip` a valid IPv4/IPv6), so a bad value is refused here instead of costing a round trip that
comes back `422`.

Each tool returns the API payload as JSON text. A wrong code is a normal result
(`matched: false`), not an error; a rejected request comes back with `isError` set and the API's
message plus its error class and HTTP status, e.g.
`No enabled channel configured [NoEnabledChannelError, HTTP 409]`. That is what tells the calling
model whether to fix the input (`422`), wait (`429`), pick another channel (`409`) or stop (`401`).

### WhatsApp: how the OTP completes

Every `send_otp`, `resend_otp` and `get_otp_status` result carries `completion`, which tells the
model how this OTP finishes. SMS, email and Telegram always complete with `code`. Which WhatsApp
mode applies is configured per account:

| `completion` | `action_url` | What happens |
| --- | --- | --- |
| `code` | `null` | The code was delivered (any channel, or WhatsApp in template mode). The user enters it; call `verify_otp`. |
| `code` | set | WhatsApp code-back. Show the user the `wa.me` link; they open it and send us the prefilled message, we reply with the code. Then `verify_otp` as on SMS. |
| `inbound` | set | WhatsApp inbound approval. Show the user the link; the prefilled message itself approves the OTP, there is no code. Poll `get_otp_status` every 3 to 5 seconds until `status` leaves `pending`. |

Calling `verify_otp` on an `inbound` OTP never matches while it is pending and spends an attempt;
once approved it simply reports the approved OTP. Sandbox OTPs always complete with `code`; on
WhatsApp they still return a sample `action_url`. If the user has no WhatsApp, call `resend_otp`
with `channel: "sms"`: leaving WhatsApp for a code channel sets `completion` back to `code`.

## Development

```sh
pnpm install --ignore-workspace
pnpm run typecheck
pnpm run test
pnpm run build   # -> dist/ (the published artifact)
```

The protocol owns stdout: logs and diagnostics must go to stderr, or the client's connection breaks.

## License

MIT
