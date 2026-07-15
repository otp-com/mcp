import type { Config } from './config.js'

// Thin client for the public OTP API (Bearer auth). Mirrors the four public endpoints; shapes match
// the API's response DTOs. `fetch` is injectable so the tools can be tested without a network.

export interface OtpResult {
  otp_id: string
  status: string
  channel: string | null
  masked_recipient: string
}

export interface VerifyResult {
  otp_id: string
  status: string
  matched: boolean
}

export interface StatusResult {
  otp_id: string
  status: string
  masked_recipient: string
}

// The API rejected the request; carries the HTTP status and the error envelope's type when present.
export class OtpApiError extends Error {
  readonly status: number
  readonly type?: string
  constructor(status: number, message: string, type?: string) {
    super(message)
    this.name = 'OtpApiError'
    this.status = status
    this.type = type
  }
}

type FetchLike = typeof fetch

export class OtpApiClient {
  private readonly config: Config
  private readonly fetchImpl: FetchLike

  constructor(config: Config, fetchImpl: FetchLike = fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  send(input: { recipient: string; locale?: string }): Promise<OtpResult> {
    return this.post<OtpResult>('/otp/send', { recipient: input.recipient, locale: input.locale })
  }

  verify(input: { otp_id: string; code: string }): Promise<VerifyResult> {
    return this.post<VerifyResult>('/otp/verify', { otp_id: input.otp_id, code: input.code })
  }

  resend(input: { otp_id: string }): Promise<OtpResult> {
    return this.post<OtpResult>('/otp/resend', { otp_id: input.otp_id })
  }

  status(otpId: string): Promise<StatusResult> {
    return this.request<StatusResult>('GET', `/otp/${encodeURIComponent(otpId)}`)
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw new OtpApiError(response.status, errorMessage(data, response.status), errorType(data))
    }
    return data as T
  }
}

// The API's error envelope is { error: { type, message } }; fall back to a generic message.
function errorMessage(data: unknown, status: number): string {
  const envelope = (data as { error?: { message?: unknown } } | null)?.error
  return typeof envelope?.message === 'string' ? envelope.message : `Request failed (${status})`
}

function errorType(data: unknown): string | undefined {
  const envelope = (data as { error?: { type?: unknown } } | null)?.error
  return typeof envelope?.type === 'string' ? envelope.type : undefined
}
