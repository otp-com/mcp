import { describe, expect, it, vi } from 'vitest'
import { OtpApiClient, OtpApiError } from './client'

const config = { apiKey: 'k', baseUrl: 'https://api.otp.com/api/v1' }
const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) })
const client = (fetchImpl: unknown) => new OtpApiClient(config, fetchImpl as typeof fetch)

describe('OtpApiClient', () => {
  it('sends with Bearer auth + JSON body and returns the payload', async () => {
    const f = ok({ otp_id: 'o1', status: 'pending', channel: 'sms', masked_recipient: '+14****71' })
    const res = await client(f).send({ recipient: '+14155552671', locale: 'en' })
    expect(res.otp_id).toBe('o1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.otp.com/api/v1/otp/send')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ recipient: '+14155552671', locale: 'en' })
  })

  it('includes client_ip in the send body when given, and drops it when absent', async () => {
    const f = ok({ otp_id: 'o1', status: 'pending', channel: 'sms', masked_recipient: '+14****71' })
    await client(f).send({ recipient: '+14155552671', client_ip: '81.2.69.142' })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ recipient: '+14155552671', client_ip: '81.2.69.142' })
    const f2 = ok({ otp_id: 'o2', status: 'pending', channel: 'sms', masked_recipient: '+14****71' })
    await client(f2).send({ recipient: '+14155552671' })
    expect(JSON.parse(f2.mock.calls[0][1].body)).toEqual({ recipient: '+14155552671' })
  })

  it('posts verify and resend to their endpoints', async () => {
    const f1 = ok({ otp_id: 'o1', status: 'approved', matched: true })
    await client(f1).verify({ otp_id: 'o1', code: '123456' })
    expect(f1.mock.calls[0][0]).toBe('https://api.otp.com/api/v1/otp/verify')

    const f2 = ok({ otp_id: 'o1', status: 'pending', channel: 'whatsapp', masked_recipient: 'x', action_url: 'https://wa.me/1?text=x' })
    const resent = await client(f2).resend({ otp_id: 'o1' })
    expect(f2.mock.calls[0][0]).toBe('https://api.otp.com/api/v1/otp/resend')
    expect(resent.action_url).toBe('https://wa.me/1?text=x')
  })

  it('resends onto an explicit channel when one is given', async () => {
    const f = ok({ otp_id: 'o1', status: 'pending', channel: 'sms', masked_recipient: 'x', action_url: null })
    await client(f).resend({ otp_id: 'o1', channel: 'sms' })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ otp_id: 'o1', channel: 'sms' })
  })

  it('gets status with no body (no Content-Type), URL-encoding the id', async () => {
    const f = ok({ otp_id: 'o1', status: 'pending', masked_recipient: 'x' })
    await client(f).status('o1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.otp.com/api/v1/otp/o1')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('throws OtpApiError with the envelope message + type on a failure', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: { type: 'ApiKeyError', message: 'Invalid API key' } }) })
    await expect(client(f).send({ recipient: 'x' })).rejects.toBeInstanceOf(OtpApiError)
    await expect(client(f).send({ recipient: 'x' })).rejects.toMatchObject({ status: 401, message: 'Invalid API key', type: 'ApiKeyError' })
  })

  it('falls back to a generic message when there is no error envelope', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve(null) })
    await expect(client(f).send({ recipient: 'x' })).rejects.toThrow(/Request failed \(500\)/)
  })
})
