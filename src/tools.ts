import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { OtpApiError, type OtpApiClient } from './client.js'

// A tool result: the API payload as pretty JSON, or the error message with isError set so the calling
// model can react (e.g. wrong code → matched:false is a normal result; a declined/invalid request is
// an error). Kept tiny so it's easy to test.
async function call<T>(fn: () => Promise<T>): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const data = await fn()
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: errorText(err) }], isError: true }
  }
}

// The API's error class and status ride along with the message: they are what tells a model whether to
// change the input (422), wait (429), pick another channel (409) or stop (401).
function errorText(err: unknown): string {
  if (err instanceof OtpApiError) {
    return `${err.message} [${err.type ?? 'error'}, HTTP ${err.status}]`
  }
  return err instanceof Error ? err.message : String(err)
}

// Bounds mirror the API's own validation, so an oversized value is refused here instead of costing a
// round trip that comes back 422.
const otpId = z.string().uuid().describe('The otp_id returned by send_otp')

// Registers the OTP tools on the given server. Mirrors the public API 1:1 (send/verify/resend/status).
export function registerOtpTools(server: McpServer, client: OtpApiClient): void {
  server.registerTool(
    'send_otp',
    {
      title: 'Send OTP',
      description:
        'Send a one-time password to a phone number or email. The delivery channel is chosen by your account routing; you only pass the recipient. Pass client_ip when the calling application knows the END USER\'s IP address (the person being verified): requests without it share a much tighter rate limit. Never guess or fabricate an IP, and never send the server\'s own address; omit the field when the real value is not available. The code itself is never returned; you get an otp_id to verify against. The response\'s completion field says how this OTP finishes. completion:"code": the code was delivered (SMS, email, Telegram, or WhatsApp in template mode), the user enters it and you call verify_otp. If action_url (a wa.me link) is also set, the code is not sent yet: show the user that link, they open it and send us the prefilled message, we reply with the code, then verify_otp. completion:"inbound": show the user action_url; their prefilled message itself approves the OTP, there is no code, so do not call verify_otp. Poll get_otp_status every 3 to 5 seconds until status leaves pending. Which WhatsApp mode applies is configured per account; action_url is null whenever no link is involved.',
      inputSchema: {
        recipient: z.string().min(1).max(320).describe('Phone number in E.164 (e.g. +14155552671) or an email address'),
        locale: z.string().max(10).optional().describe('Message language as a BCP-47 tag, e.g. "en" or "tr" (optional)'),
        client_ip: z
          .union([z.ipv4(), z.ipv6()])
          .optional()
          .describe(
            "IP address of the END USER being verified, taken from the application's request context (optional). Only pass a real value; never invent one and never use the server's own IP.",
          ),
      },
    },
    async ({ recipient, locale, client_ip }) => call(() => client.send({ recipient, locale, client_ip })),
  )

  server.registerTool(
    'verify_otp',
    {
      title: 'Verify OTP',
      description:
        'Verify the code the user entered for a previously sent OTP. matched:true means the code was correct. Only for OTPs with completion:"code": an "inbound" OTP has no code, a verify call while it is pending never matches and spends an attempt, and once approved it simply reports the approved OTP. Wait for the approval via get_otp_status instead.',
      inputSchema: {
        otp_id: otpId,
        code: z.string().min(1).max(16).describe('The code the user entered'),
      },
    },
    async ({ otp_id, code }) => call(() => client.verify({ otp_id, code })),
  )

  server.registerTool(
    'resend_otp',
    {
      title: 'Resend OTP',
      description:
        'Resend a pending OTP, advancing to the next configured channel (e.g. SMS to WhatsApp). The response has the same shape as send_otp: completion follows the channel, a resend that lands on WhatsApp in a link mode returns action_url for the user to open, and leaving WhatsApp for a code channel sets completion back to "code". Pass channel to pick one explicitly, e.g. "sms" when the user has no WhatsApp.',
      inputSchema: {
        otp_id: otpId,
        channel: z
          .enum(['sms', 'whatsapp', 'email', 'telegram'])
          .optional()
          .describe('Move the OTP onto this channel instead of the next one in your routing order (optional)'),
      },
    },
    async ({ otp_id, channel }) => call(() => client.resend({ otp_id, channel })),
  )

  server.registerTool(
    'get_otp_status',
    {
      title: 'Get OTP status',
      description:
        'Check the current status of an OTP (pending, approved, failed, or expired) and its completion. For completion:"code" an OTP only leaves pending once you call verify_otp with the code the user entered, so do not poll this instead of verifying. For completion:"inbound" this is how you learn the approval: poll every 3 to 5 seconds until status leaves pending.',
      inputSchema: {
        otp_id: otpId,
      },
    },
    async ({ otp_id }) => call(() => client.status(otp_id)),
  )
}
