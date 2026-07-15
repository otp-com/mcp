#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { OtpApiClient } from './client.js'
import { loadConfig } from './config.js'
import { registerOtpTools } from './tools.js'

// stdio MCP server: the customer's AI system (the MCP client) spawns this and calls the OTP tools
// with the customer's own API key. Protocol travels over stdout; logs must go to stderr only.
async function main(): Promise<void> {
  const config = loadConfig()
  const server = new McpServer({ name: 'otp-mcp', version: '0.1.0' })
  registerOtpTools(server, new OtpApiClient(config))
  await server.connect(new StdioServerTransport())
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
