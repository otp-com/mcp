// Runtime configuration, read from the environment the MCP client passes in. The API key is the
// customer's own (created in the OTP panel); it is the only credential and never leaves this process
// except as a Bearer header to the OTP API.
export interface Config {
  apiKey: string
  baseUrl: string
}

const DEFAULT_BASE_URL = 'https://api.otp.com/api/v1'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.OTP_API_KEY?.trim()
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OTP_API_KEY is required. Create an API key in the OTP panel (API Keys) and set it in the MCP server env.')
  }
  const baseUrl = (env.OTP_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return { apiKey, baseUrl }
}
