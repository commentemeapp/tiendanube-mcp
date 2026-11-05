import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools } from './tools/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'tiendanube-mcp',
    version,
  })

  registerTools(server)

  return server
}
