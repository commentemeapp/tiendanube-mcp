import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../build/server.js'

let clientPromise

/** One MCP client per test file, connected in memory to the compiled server. */
export function getClient() {
  clientPromise ??= (async () => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    const server = createServer()
    await server.connect(a)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(b)
    return client
  })()
  return clientPromise
}

export async function call(name, args) {
  const client = await getClient()
  const res = await client.callTool({ name, arguments: args })
  const text = res.content.map((c) => c.text ?? '').join('\n')
  return { ...res, text }
}

export async function closeClient() {
  if (clientPromise) await (await clientPromise).close()
}
