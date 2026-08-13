import { describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { OtpApiError, type OtpApiClient } from './client'
import { registerOtpTools } from './tools'

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
type ToolConfig = { inputSchema: Record<string, { safeParse: (value: unknown) => { success: boolean } }> }

function fakeServer() {
  const tools = new Map<string, Handler>()
  const configs = new Map<string, ToolConfig>()
  const server = {
    registerTool: (name: string, config: ToolConfig, cb: Handler) => {
      tools.set(name, cb)
      configs.set(name, config)
    },
  }
  return { server: server as unknown as McpServer, tools, configs }
}

describe('registerOtpTools', () => {
  it('registers the four OTP tools', () => {
    const { server, tools } = fakeServer()
    registerOtpTools(server, {} as OtpApiClient)
    expect([...tools.keys()]).toEqual(['send_otp', 'verify_otp', 'resend_otp', 'get_otp_status'])
  })

  it('send_otp calls the client and returns the payload as JSON text', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockResolvedValue({ otp_id: 'o1', status: 'pending' })
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    const res = await tools.get('send_otp')!({ recipient: '+1', locale: 'en' })
    expect(send).toHaveBeenCalledWith({ recipient: '+1', locale: 'en', client_ip: undefined })
    expect(res.isError).toBeUndefined()
    expect(JSON.parse(res.content[0].text)).toEqual({ otp_id: 'o1', status: 'pending' })
  })

  it('send_otp forwards the end-user client_ip when the caller has one', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockResolvedValue({ otp_id: 'o1', status: 'pending' })
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    await tools.get('send_otp')!({ recipient: '+1', client_ip: '81.2.69.142' })
    expect(send).toHaveBeenCalledWith({ recipient: '+1', locale: undefined, client_ip: '81.2.69.142' })
  })

  it('send_otp validates client_ip as an IP (v4 or v6), keeping it optional', () => {
    const { server, configs } = fakeServer()
    registerOtpTools(server, {} as OtpApiClient)
    const schema = configs.get('send_otp')!.inputSchema.client_ip
    expect(schema.safeParse('81.2.69.142').success).toBe(true)
    expect(schema.safeParse('2a02:6ea0::1').success).toBe(true)
    expect(schema.safeParse('not-an-ip').success).toBe(false)
    expect(schema.safeParse(undefined).success).toBe(true)
  })

  it('marks a failed call as isError with the error message', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockRejectedValue(new Error('Invalid API key'))
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    const res = await tools.get('send_otp')!({ recipient: '+1' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('Invalid API key')
  })

  it('carries the API error class and status alongside the message', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockRejectedValue(new OtpApiError(409, 'No enabled channel configured', 'NoEnabledChannelError'))
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    const res = await tools.get('send_otp')!({ recipient: '+1' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('No enabled channel configured [NoEnabledChannelError, HTTP 409]')
  })

  it('bounds the inputs the API bounds, so an oversized value never leaves the process', () => {
    const { server, configs } = fakeServer()
    registerOtpTools(server, {} as OtpApiClient)
    const send = configs.get('send_otp')!.inputSchema
    expect(send.recipient.safeParse('a'.repeat(321)).success).toBe(false)
    expect(send.locale.safeParse('x'.repeat(11)).success).toBe(false)
    expect(configs.get('verify_otp')!.inputSchema.code.safeParse('1'.repeat(17)).success).toBe(false)
    expect(configs.get('get_otp_status')!.inputSchema.otp_id.safeParse('not-a-uuid').success).toBe(false)
  })

  it('handles a non-Error rejection', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockRejectedValue('weird')
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    const res = await tools.get('send_otp')!({ recipient: 'x' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('weird')
  })

  it('verify/resend/status wire to the matching client methods', async () => {
    const { server, tools } = fakeServer()
    const client = {
      verify: vi.fn().mockResolvedValue({ matched: true }),
      resend: vi.fn().mockResolvedValue({ status: 'pending' }),
      status: vi.fn().mockResolvedValue({ status: 'approved' }),
    }
    registerOtpTools(server, client as unknown as OtpApiClient)
    await tools.get('verify_otp')!({ otp_id: 'o1', code: '123456' })
    expect(client.verify).toHaveBeenCalledWith({ otp_id: 'o1', code: '123456' })
    await tools.get('resend_otp')!({ otp_id: 'o1' })
    expect(client.resend).toHaveBeenCalledWith({ otp_id: 'o1', channel: undefined })
    await tools.get('resend_otp')!({ otp_id: 'o1', channel: 'sms' })
    expect(client.resend).toHaveBeenCalledWith({ otp_id: 'o1', channel: 'sms' })
    await tools.get('get_otp_status')!({ otp_id: 'o1' })
    expect(client.status).toHaveBeenCalledWith('o1')
  })
})
