// Monta os índices factuais de data/ a partir das páginas Markdown de nuvemshop.dev:
// endpoints da Admin API (método, caminho, recurso, página), scopes OAuth e eventos de
// webhook. Só fatos e links: nenhum texto da documentação entra no pacote, que não tem
// licença aberta. O texto em si o servidor busca ao vivo (search-docs e read-doc).
//
//   npm run ingerir
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const VERSAO = '2025-03'
const BASE = 'https://nuvemshop.dev/en-US/'
const DATA = fileURLToPath(new URL('../data/', import.meta.url))
const UA = 'tiendanube-mcp-ingerir (+https://github.com/commentemeapp/tiendanube-mcp)'

async function baixar(url: string): Promise<string> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (r.ok) return r.text()
    if (r.status === 404) throw new Error(`404 em ${url}`)
    await new Promise((ok) => setTimeout(ok, 1500 * tentativa))
  }
  throw new Error(`sem resposta de ${url}`)
}

const titulo = (md: string) => /^title:\s*"?(.*?)"?\s*$/m.exec(md)?.[1] ?? ''

// ── Páginas de recurso ────────────────────────────────────────────────────────────
const indice = await baixar(`${BASE}llms.txt`)
const paginas = [
  ...new Set(
    [...indice.matchAll(/https:\/\/nuvemshop\.dev\/en-US\/api\/resources\/[A-Za-z0-9_\-/.]+\.md/g)]
      .map((m) => m[0])
      .filter((u) => u.includes(`/${VERSAO}/`))
  ),
].sort()

interface Endpoint {
  method: string
  path: string
  resource: string
  url: string
}
const endpoints: Endpoint[] = []
const recursos: { resource: string; url: string }[] = []
for (const url of paginas) {
  const md = await baixar(url)
  const resource = titulo(md)
  recursos.push({ resource, url })
  let emCodigo = false
  for (const linha of md.split('\n')) {
    if (linha.startsWith('```')) emCodigo = !emCodigo
    if (emCodigo) continue
    // O nível do título muda de página para página (### a ######) e às vezes o método vem
    // em negrito. Os exemplos repetem o endpoint com ids reais: um segmento só de números
    // ou um valor na query denuncia o exemplo, e esse fica de fora.
    const m = /^#{3,6}\s+(?:\*\*)?(GET|POST|PUT|PATCH|DELETE)(?:\*\*)?\s+(.+?)\s*$/.exec(linha)
    if (!m) continue
    const bruto = m[2].replace(/[`*\\]/g, '').trim()
    if (/\/\d+(\/|$|\?)|=\d/.test(bruto)) continue
    const path = bruto
      .replace(/\?.*$/, '')
      .replace(/\$\{/g, '{')
      .replace(/:([A-Za-z_]+)/g, '{$1}')
      .replace(/^\{store_id\}/, '')
      .replace(/^(?!\/)/, '/')
    if (!/^\/[A-Za-z0-9_{}\/.-]*$/.test(path)) continue
    if (!endpoints.some((e) => e.method === m[1] && e.path === path))
      endpoints.push({ method: m[1], path, resource, url })
  }
}

// ── Scopes ────────────────────────────────────────────────────────────────────────
const urlAuth = `${BASE}api/authentication.md`
const auth = await baixar(urlAuth)
const blocoScopes = auth.split(/^## Scopes$/m)[1]?.split(/^## /m)[0] ?? ''
interface Scope {
  scopes: string[]
  resources: { name: string; url?: string }[]
}
const scopes: Scope[] = []
for (const linha of blocoScopes.split('\n')) {
  const s = /^- (`[a-z_]+`(?:\s*\/\s*`[a-z_]+`)*)\s*$/.exec(linha)
  if (s) {
    scopes.push({ scopes: [...s[1].matchAll(/`([a-z_]+)`/g)].map((x) => x[1]), resources: [] })
    continue
  }
  const r = /^\s+- (?:\[(.+?)\]\((.+?)\)|(.+?))\s*$/.exec(linha)
  if (r && scopes.length) {
    const name = r[1] ?? r[3]
    const url = r[2] ?? recursos.find((x) => x.resource.toLowerCase() === name.toLowerCase())?.url
    scopes.at(-1)!.resources.push(url ? { name, url } : { name })
  }
}

// ── Eventos de webhook ────────────────────────────────────────────────────────────
const urlWebhook = `${BASE}api/resources/${VERSAO}/webhook.md`
const webhook = await baixar(urlWebhook)
interface Evento {
  event: string
  group: string
  required?: boolean
}
const eventos: Evento[] = []
const parametros =
  webhook.split(/^### Parameters$/m)[1]?.split(/^#### Example webhook content$/m)[0] ?? ''
for (const linha of parametros.split('\n')) {
  const h = /^####\s+(.+?)\s*$/.exec(linha)
  if (!h) continue
  for (const e of h[1].split(/\s+-\s+/)) {
    const ev = e.replace(/`/g, '').trim()
    if (/^[a-z_]+\/[a-z_]+$/.test(ev) && !eventos.some((x) => x.event === ev))
      eventos.push({ event: ev, group: ev.split('/')[0] })
  }
}
const obrigatorios = webhook.split(/^## Required Webhooks$/m)[1]?.split(/^## (?!#)/m)[0] ?? ''
for (const m of obrigatorios.matchAll(/^###\s+([a-z_]+\/[a-z_]+)\s*$/gm))
  eventos.push({ event: m[1], group: 'privacy', required: true })

// ── Gravação ──────────────────────────────────────────────────────────────────────
const consultado = new Date().toISOString().slice(0, 10)
const grava = (nome: string, dados: unknown) =>
  writeFileSync(`${DATA}${nome}`, JSON.stringify(dados, null, 2) + '\n')

grava('endpoints.json', { version: VERSAO, consulted: consultado, resources: recursos, endpoints })
grava('scopes.json', { consulted: consultado, source: urlAuth, scopes })
grava('webhooks.json', { consulted: consultado, source: urlWebhook, events: eventos })

console.log(
  `${recursos.length} recursos, ${endpoints.length} endpoints, ${scopes.length} grupos de scopes, ${eventos.length} eventos de webhook`
)
