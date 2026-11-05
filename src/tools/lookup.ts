import { z } from 'zod'
import {
  loadEndpoints,
  loadScopes,
  loadWebhooks,
  scopesForResource,
  type Endpoint,
} from '../data.js'
import { text } from './result.js'

const BASE = 'https://api.tiendanube.com'

const norm = (p: string) =>
  (
    '/' +
    p
      .trim()
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/+/, '')
  )
    .replace(/^\/(v1|\d{4}-\d{2}|unstable)(?=\/)/, '')
    .replace(/^\/\{?store_id\}?(?=\/)|^\/\d+(?=\/)/, '')
    .replace(/\?.*$/, '')
    .replace(/\{[^}]+\}|:[A-Za-z_]+|\/\d+(?=\/|$)/g, '/{}')
    .replace(/\/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase()

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1)

function describe(list: Endpoint[], version: string): string {
  const lines: string[] = []
  for (const e of list) {
    const group = scopesForResource(e.resource)
    lines.push(`## ${e.method} ${e.path}`, '')
    lines.push(`- Resource: ${e.resource}`)
    lines.push(`- Full URL: \`${BASE}/${version}/{store_id}${e.path}\``)
    if (group) {
      const read = group.scopes.find((s) => s.startsWith('read_'))
      const write = group.scopes.find((s) => s.startsWith('write_'))
      const needed = e.method === 'GET' ? (read ?? write) : (write ?? read)
      lines.push(
        `- Scope: \`${needed}\` (group: ${group.scopes.map((s) => `\`${s}\``).join(', ')})`
      )
    }
    lines.push(`- Reference: ${e.url}`, '')
  }
  lines.push(
    'Every call needs `Authorization: Bearer <access_token>`, a `User-Agent` with the app name and a contact, and `Content-Type: application/json` on writes. Read the reference page (read-doc) for fields and examples.'
  )
  return lines.join('\n')
}

export const lookupEndpointSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      'A path ("/orders/{id}/fulfill", "/products/123/variants"), a resource name ("Fulfillment Order") or keywords ("tracking event", "custom fields product")'
    ),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .describe('Max results for keyword search (default 15)'),
}

export async function lookupEndpoint({
  query,
  method,
  limit = 15,
}: {
  query: string
  method?: string
  limit?: number
}) {
  const data = loadEndpoints()
  const byMethod = (e: Endpoint) => !method || e.method === method
  const q = query.trim()

  if (q.includes('/')) {
    const target = norm(q)
    const exact = data.endpoints.filter((e) => norm(e.path) === target && byMethod(e))
    if (exact.length) return text(`# Admin API ${data.version}\n\n${describe(exact, data.version)}`)
    const under = data.endpoints.filter((e) => norm(e.path).startsWith(target) && byMethod(e))
    if (under.length)
      return text(
        [
          `# Endpoints under ${q}`,
          '',
          ...under.map((e) => `- \`${e.method} ${e.path}\` (${e.resource})`),
        ].join('\n')
      )
  }

  const resource = data.endpoints.filter(
    (e) => e.resource.toLowerCase() === q.toLowerCase() && byMethod(e)
  )
  if (resource.length)
    return text(`# ${resource[0].resource}\n\n${describe(resource, data.version)}`)

  const qw = words(q)
  const scored = data.endpoints
    .filter(byMethod)
    .map((e) => {
      const name = words(e.resource)
      const path = words(e.path.replace(/\{[^}]+\}/g, ''))
      const s = qw.reduce(
        (acc, w) =>
          acc +
          (name.includes(w) || name.some((n) => n.startsWith(w)) ? 3 : 0) +
          (path.some((p) => p.includes(w)) ? 2 : 0),
        0
      )
      return { e, s }
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  if (!scored.length)
    return text(
      `Nothing matches "${query}" among the ${data.endpoints.length} endpoints of Admin API ${data.version} (index from ${data.consulted}). Try search-docs.`,
      true
    )
  const lines = [
    `# Admin API ${data.version} endpoints matching "${query}"`,
    '',
    ...scored.slice(0, limit).map((x) => `- \`${x.e.method} ${x.e.path}\` (${x.e.resource})`),
    '',
    'Call lookup-endpoint again with the exact path for scope and reference.',
  ]
  return text(lines.join('\n'))
}

export const lookupScopeSchema = {
  query: z
    .string()
    .optional()
    .describe(
      'A scope ("write_fulfillment_orders"), a resource ("Draft Order") or a path ("/orders/{id}"). Empty lists every scope.'
    ),
}

export async function lookupScope({ query }: { query?: string }) {
  const data = loadScopes()
  const fmt = (g: (typeof data.scopes)[number]) =>
    `- ${g.scopes.map((s) => `\`${s}\``).join(' / ')}: ${g.resources.map((r) => (r.url ? `[${r.name}](${r.url})` : r.name)).join(', ')}`
  const notes = [
    '',
    'A write scope implies its read scope. Scopes are set for the app in the Partners Portal, not per installation; after changing them, the app must be reinstalled in each store to get a token with the new scopes.',
    `> Source: ${data.source} (index from ${data.consulted})`,
  ]
  const q = query?.trim().toLowerCase()
  if (!q) return text(['# OAuth scopes', '', ...data.scopes.map(fmt), ...notes].join('\n'))

  let groups = data.scopes.filter(
    (g) => g.scopes.includes(q) || g.resources.some((r) => r.name.toLowerCase() === q)
  )
  if (!groups.length && q.includes('/')) {
    const r = await lookupEndpointResource(q)
    if (r) {
      const g = scopesForResource(r)
      if (g) groups = [g]
    }
  }
  if (!groups.length)
    groups = data.scopes.filter(
      (g) =>
        g.scopes.some((s) => s.includes(q)) ||
        g.resources.some((r) => r.name.toLowerCase().includes(q))
    )
  if (!groups.length)
    return text(
      `No scope covers "${query}". Call lookup-scope without a query for the full list.`,
      true
    )
  return text([`# Scopes for "${query}"`, '', ...groups.map(fmt), ...notes].join('\n'))
}

async function lookupEndpointResource(path: string): Promise<string | undefined> {
  const target = norm(path)
  const data = loadEndpoints()
  return (
    data.endpoints.find((e) => norm(e.path) === target) ??
    data.endpoints.find((e) => target.startsWith(norm(e.path)) && norm(e.path) !== '')
  )?.resource
}

export const lookupWebhookEventSchema = {
  query: z
    .string()
    .optional()
    .describe('An event ("order/paid"), a group ("fulfillment_order") or empty for the full list'),
}

export async function lookupWebhookEvent({ query }: { query?: string }) {
  const data = loadWebhooks()
  const q = query?.trim().toLowerCase()
  const list = q
    ? data.events.filter((e) => e.event === q || e.group === q || e.event.includes(q))
    : data.events
  if (!list.length)
    return text(
      `No webhook event matches "${query}". Call lookup-webhook-event without a query for the ${data.events.length} events.`,
      true
    )
  const groups = new Map<string, string[]>()
  for (const e of list) {
    const key = e.required ? 'privacy (required for every app)' : e.group
    groups.set(key, [...(groups.get(key) ?? []), `\`${e.event}\``])
  }
  const lines = [`# Webhook events${q ? ` matching "${query}"` : ''}`, '']
  for (const [g, evs] of groups) lines.push(`- **${g}**: ${evs.join(', ')}`)
  lines.push(
    '',
    'Register with `POST /webhooks` (`event`, `url`), with the scope of the resource. Each delivery carries `x-linkedstore-hmac-sha256`: an HMAC-SHA256 of the raw body keyed with the app client secret. Answer 2xx fast and expect retries, duplicates and out-of-order deliveries. The three privacy webhooks are configured in the Partners Portal, not through the API.',
    `> Source: ${data.source} (index from ${data.consulted}). Read the event details with read-doc.`
  )
  return text(lines.join('\n'))
}
