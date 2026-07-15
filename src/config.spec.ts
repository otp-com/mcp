import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('reads the API key and defaults the base URL', () => {
    expect(loadConfig({ OTP_API_KEY: 'k' })).toEqual({ apiKey: 'k', baseUrl: 'https://api.otp.com/api/v1' })
  })

  it('trims the key and strips a trailing slash from a custom base URL', () => {
    expect(loadConfig({ OTP_API_KEY: '  k  ', OTP_API_BASE_URL: 'https://x/api/v1/' })).toEqual({ apiKey: 'k', baseUrl: 'https://x/api/v1' })
  })

  it('throws when the API key is missing or blank', () => {
    expect(() => loadConfig({})).toThrow(/OTP_API_KEY/)
    expect(() => loadConfig({ OTP_API_KEY: '   ' })).toThrow(/OTP_API_KEY/)
  })
})
