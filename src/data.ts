import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * Factual indexes built by `npm run ingerir` from the official docs: method, path, names
 * and links only. No text of the docs is bundled.
 */
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const load = <T>(file: string): T => JSON.parse(readFileSync(join(DATA, file), 'utf-8')) as T

export interface Endpoint {
  method: string
  path: string
  resource: string
  url: string
}
export interface EndpointData {
  version: string
  consulted: string
  resources: { resource: string; url: string }[]
  endpoints: Endpoint[]
}
export interface ScopeGroup {
  scopes: string[]
  resources: { name: string; url?: string }[]
}
export interface ScopeData {
  consulted: string
  source: string
  scopes: ScopeGroup[]
}
export interface WebhookEvent {
  event: string
  group: string
  required?: boolean
}
export interface WebhookData {
  consulted: string
  source: string
  events: WebhookEvent[]
}

let endpoints: EndpointData | undefined
let scopes: ScopeData | undefined
let webhooks: WebhookData | undefined

export const loadEndpoints = () => (endpoints ??= load<EndpointData>('endpoints.json'))
export const loadScopes = () => (scopes ??= load<ScopeData>('scopes.json'))
export const loadWebhooks = () => (webhooks ??= load<WebhookData>('webhooks.json'))

/** The scope group that covers a resource name, matched loosely ("Product Variant" -> products). */
export function scopesForResource(resource: string): ScopeGroup | undefined {
  const r = resource.toLowerCase()
  const groups = loadScopes().scopes
  return (
    groups.find((g) => g.resources.some((x) => x.name.toLowerCase() === r)) ??
    groups.find((g) => g.resources.some((x) => r.startsWith(x.name.toLowerCase())))
  )
}
