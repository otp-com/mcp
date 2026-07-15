import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { OtpApiClient } from './client.js'

// A tool result: the API payload as pretty JSON, or the error message with isError set so the calling
// model can react (e.g. wrong code → matched:false is a normal result; a declined/invalid request is
// an error). Kept tiny so it's easy to test.
async function call<T>(fn: () => Promise<T>): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const data = await fn()
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
  }
}

// Registers the OTP tools on the given server. Mirrors the public API 1:1 (send/verify/resend/status).
export function registerOtpTools(server: McpServer, client: OtpApiClient): void {
  server.registerTool(
    'send_otp',
    {
      title: 'Send OTP',
      description:
        'Send a one-time password to a phone number or email. The delivery channel is chosen by your account routing; you only pass the recipient. The code itself is never returned; you get an otp_id to verify against.',
      inputSchema: {
        recipient: z.string().min(1).describe('Phone number in E.164 (e.g. +905551234567) or an email address'),
        locale: z.string().optional().describe('Message language, e.g. "en" or "tr" (optional)'),
      },
    },
    async ({ recipient, locale }) => call(() => client.send({ recipient, locale })),
  )

  server.registerTool(
    'verify_otp',
    {
      title: 'Verify OTP',
      description: 'Verify the code the user entered for a previously sent OTP. matched:true means the code was correct.',
      inputSchema: {
        otp_id: z.string().min(1).describe('The otp_id returned by send_otp'),
        code: z.string().min(1).describe('The code the user entered'),
      },
    },
    async ({ otp_id, code }) => call(() => client.verify({ otp_id, code })),
  )

  server.registerTool(
    'resend_otp',
    {
      title: 'Resend OTP',
      description: 'Resend a pending OTP, advancing to the next configured channel (e.g. SMS → WhatsApp).',
      inputSchema: {
        otp_id: z.string().min(1).describe('The otp_id returned by send_otp'),
      },
    },
    async ({ otp_id }) => call(() => client.resend({ otp_id })),
  )

  server.registerTool(
    'get_otp_status',
    {
      title: 'Get OTP status',
      description: 'Check the current status of an OTP (pending, approved, failed, or expired).',
      inputSchema: {
        otp_id: z.string().min(1).describe('The otp_id returned by send_otp'),
      },
    },
    async ({ otp_id }) => call(() => client.status(otp_id)),
  )
}
