// Arranca o servidor compilado por stdio, como um cliente MCP faria, e falha se faltar
// alguma tool esperada. Os agentes do tiendanube-agents declaram estes nomes.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'

export const ESPERADAS = [
  'search-docs',
  'read-doc',
  'lookup-endpoint',
  'lookup-scope',
  'lookup-webhook-event',
  'scaffold-webhook-handler',
  'scaffold-oauth-callback',
]

const servidor = fileURLToPath(new URL('../build/index.js', import.meta.url))
const transport = new StdioClientTransport({ command: process.execPath, args: [servidor] })
const client = new Client({ name: 'probar-mcp', version: '0.0.0' })

try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  const nomes = tools.map((t) => t.name)
  const faltam = ESPERADAS.filter((n) => !nomes.includes(n))
  const sobram = nomes.filter((n) => !ESPERADAS.includes(n))
  console.log(`Tools (${nomes.length}): ${nomes.join(', ')}`)
  if (sobram.length) console.log(`Tools fora da lista esperada: ${sobram.join(', ')}`)
  const semDescricao = tools.filter((t) => !t.description || t.description.length < 40)
  // Sem rede: só as tools que leem o índice empacotado.
  const busca = await client.callTool({ name: 'lookup-endpoint', arguments: { query: '/orders' } })
  if (busca.isError) throw new Error('lookup-endpoint respondeu com erro')
  if (faltam.length || semDescricao.length) {
    if (faltam.length) console.error(`Faltam tools: ${faltam.join(', ')}`)
    if (semDescricao.length)
      console.error(`Tools sem descrição: ${semDescricao.map((t) => t.name).join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('probar-mcp: ok')
  }
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  await client.close()
}
