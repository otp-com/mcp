import { describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OtpApiClient } from './client'
import { registerOtpTools } from './tools'

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>

function fakeServer() {
  const tools = new Map<string, Handler>()
  const server = { registerTool: (name: string, _config: unknown, cb: Handler) => tools.set(name, cb) }
  return { server: server as unknown as McpServer, tools }
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
    const res = await tools.get('send_otp')!({ recipient: '+90', locale: 'en' })
    expect(send).toHaveBeenCalledWith({ recipient: '+90', locale: 'en' })
    expect(res.isError).toBeUndefined()
    expect(JSON.parse(res.content[0].text)).toEqual({ otp_id: 'o1', status: 'pending' })
  })

  it('marks a failed call as isError with the error message', async () => {
    const { server, tools } = fakeServer()
    const send = vi.fn().mockRejectedValue(new Error('Invalid API key'))
    registerOtpTools(server, { send } as unknown as OtpApiClient)
    const res = await tools.get('send_otp')!({ recipient: '+90' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('Invalid API key')
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
    expect(client.resend).toHaveBeenCalledWith({ otp_id: 'o1' })
    await tools.get('get_otp_status')!({ otp_id: 'o1' })
    expect(client.status).toHaveBeenCalledWith('o1')
  })
})
