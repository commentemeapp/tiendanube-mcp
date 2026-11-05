import { z } from 'zod'
import { loadWebhooks } from '../data.js'

export interface GeneratedFile {
  path: string
  content: string
  /** documentation page the code follows */
  source: string
}

export const outputSchema = {
  files: z
    .array(
      z.object({
        path: z.string().describe('Path relative to the project root'),
        content: z.string(),
        source: z.string().describe('Documentation page the code follows'),
      })
    )
    .describe('Files to write. The server never writes to disk.'),
  notes: z.array(z.string()).describe('Next steps and caveats'),
}

const DOCS = {
  webhook: 'https://nuvemshop.dev/en-US/api/resources/2025-03/webhook.md',
  auth: 'https://nuvemshop.dev/en-US/api/authentication.md',
  templates: 'https://nuvemshop.dev/en-US/apps/admin/app-templates.md',
}

function result(files: GeneratedFile[], notes: string[]) {
  const body = [
    ...files.map((f) => `## ${f.path}\n\nFollows: ${f.source}\n\n\`\`\`ts\n${f.content}\`\`\``),
    '## Notes',
    '',
    ...notes.map((n) => `- ${n}`),
  ].join('\n\n')
  return { content: [{ type: 'text' as const, text: body }], structuredContent: { files, notes } }
}

function error(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

const dirSchema = z
  .string()
  .optional()
  .describe('Folder for the generated files, relative to the project root (default "src")')

function cleanDir(dir = 'src'): string | undefined {
  const d = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  return d.includes('..') || d.startsWith('/') ? undefined : d
}

export const scaffoldWebhookHandlerSchema = {
  events: z
    .array(z.string())
    .min(1)
    .describe(
      'Events to handle, as in lookup-webhook-event (e.g. ["order/paid", "app/uninstalled"])'
    ),
  dir: dirSchema,
}

export async function scaffoldWebhookHandler({ events, dir }: { events: string[]; dir?: string }) {
  const known = new Set(loadWebhooks().events.map((e) => e.event))
  const unknown = events.filter((e) => !known.has(e))
  if (unknown.length)
    return error(
      `Unknown webhook event(s): ${unknown.join(', ')}. Call lookup-webhook-event for the list.`
    )
  const d = cleanDir(dir)
  if (!d) return error('dir must be relative to the project root and cannot contain "..".')

  const cases = events
    .map(
      (e) => `    case '${e}':
      // TODO: handle ${e}. The body is thin: fetch the resource by id with the store token.
      break`
    )
    .join('\n')

  const handler = `import crypto from 'node:crypto'
import express, { type Request, type Response } from 'express'

/**
 * Receives Tiendanube / Nuvemshop webhooks.
 * - The signature is checked over the raw body, before any JSON parsing.
 * - The answer is 200 right away; the work runs after it, so a slow job does not
 *   trigger retries.
 * - Deliveries can repeat and arrive out of order: process each one idempotently.
 */
export const webhookRouter = express.Router()

const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET ?? ''

export function isValidSignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !CLIENT_SECRET) return false
  const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

interface WebhookBody {
  store_id: number
  event: string
  id?: number | string
}

webhookRouter.post(
  '/webhooks/tiendanube',
  express.raw({ type: '*/*' }),
  (req: Request, res: Response) => {
    const raw = req.body as Buffer
    if (!isValidSignature(raw, req.get('x-linkedstore-hmac-sha256'))) {
      res.sendStatus(401)
      return
    }
    const body = JSON.parse(raw.toString('utf-8')) as WebhookBody
    res.sendStatus(200)
    setImmediate(() => {
      handleEvent(body).catch((err) => console.error('webhook', body.event, err))
    })
  }
)

async function handleEvent(body: WebhookBody): Promise<void> {
  // TODO: skip deliveries already processed (for example, keyed by store_id + event + id).
  switch (body.event) {
${cases}
    default:
      break
  }
}
`

  const test = `import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { test } from 'node:test'

process.env.TIENDANUBE_CLIENT_SECRET = 'test-secret'
const { isValidSignature } = await import('./webhooks.js')

test('accepts the signature of the raw body and rejects a changed body', () => {
  const raw = Buffer.from('{"store_id":1,"event":"${events[0]}","id":10}')
  const sig = crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex')
  assert.equal(isValidSignature(raw, sig), true)
  assert.equal(isValidSignature(Buffer.from('{"store_id":1}'), sig), false)
  assert.equal(isValidSignature(raw, undefined), false)
})
`

  const privacy = loadWebhooks()
    .events.filter((e) => e.required)
    .map((e) => e.event)
  return result(
    [
      { path: `${d}/webhooks.ts`, content: handler, source: DOCS.webhook },
      { path: `${d}/webhooks.test.ts`, content: test, source: DOCS.webhook },
    ],
    [
      'Mount the router before any global express.json(): the signature needs the raw body.',
      'Set TIENDANUBE_CLIENT_SECRET to the app client secret (Partners Portal). The store access token is not the signing key.',
      'Register each event with POST /webhooks (event and url) for every store that installs the app; the app needs the scope of the resource.',
      `Every app must also answer the privacy webhooks (${privacy.join(', ')}), configured in the Partners Portal.`,
      'Dependencies: express and @types/express.',
    ]
  )
}

export const scaffoldOauthCallbackSchema = {
  appId: z
    .string()
    .regex(/^\d+$/, 'the app id is numeric')
    .describe('App ID (client_id) from the Partners Portal'),
  brand: z
    .enum(['tiendanube', 'nuvemshop'])
    .optional()
    .describe(
      'Which domain the merchant sees (default tiendanube); the two token URLs are equivalent'
    ),
  dir: dirSchema,
}

export async function scaffoldOauthCallback({
  appId,
  brand = 'tiendanube',
  dir,
}: {
  appId: string
  brand?: 'tiendanube' | 'nuvemshop'
  dir?: string
}) {
  const d = cleanDir(dir)
  if (!d) return error('dir must be relative to the project root and cannot contain "..".')
  const host = brand === 'nuvemshop' ? 'https://www.nuvemshop.com.br' : 'https://www.tiendanube.com'

  const oauth = `import crypto from 'node:crypto'
import express, { type Request, type Response } from 'express'

/**
 * OAuth 2 authorization code flow of a Tiendanube / Nuvemshop app.
 * 1. /oauth/install sends the merchant to the authorization page with a state value.
 * 2. The platform redirects to the Redirect URL set in the Partners Portal with ?code&state.
 * 3. /oauth/callback checks the state and exchanges the code (valid for 5 minutes).
 * The token does not expire; it stops working when a new one is issued for the same app and
 * store, or when the merchant uninstalls the app.
 */
export const oauthRouter = express.Router()

const APP_ID = '${appId}'
const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET ?? ''
const AUTHORIZE_URL = '${host}/apps/' + APP_ID + '/authorize'
const TOKEN_URL = '${host}/apps/authorize/token'

export interface Installation {
  appId: string
  storeId: string
  accessToken: string
  scope: string
}

/** Replace with your database: one record per app and store pair. */
export async function saveInstallation(_installation: Installation): Promise<void> {
  throw new Error('TODO: persist the installation keyed by appId + storeId')
}

const pendingStates = new Map<string, number>()

oauthRouter.get('/oauth/install', (_req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex')
  pendingStates.set(state, Date.now())
  res.redirect(AUTHORIZE_URL + '?state=' + state)
})

oauthRouter.get('/oauth/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string }
  const issued = state ? pendingStates.get(state) : undefined
  if (!code || !state || !issued || Date.now() - issued > 10 * 60_000) {
    res.status(400).send('Invalid or expired state')
    return
  }
  pendingStates.delete(state)

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: APP_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  })
  const data = (await r.json()) as {
    access_token?: string
    scope?: string
    user_id?: number
    error_description?: string
  }
  if (!r.ok || !data.access_token || !data.user_id) {
    res.status(502).send('Token exchange failed: ' + (data.error_description ?? r.status))
    return
  }
  await saveInstallation({
    appId: APP_ID,
    storeId: String(data.user_id),
    accessToken: data.access_token,
    scope: data.scope ?? '',
  })
  res.redirect('/')
})
`

  return result(
    [{ path: `${d}/oauth.ts`, content: oauth, source: DOCS.auth }],
    [
      'The Redirect URL in the Partners Portal must point to /oauth/callback on your server.',
      'Keep TIENDANUBE_CLIENT_SECRET on the server only. user_id in the token response is the store ID.',
      'The in-memory state map is for a single process; use your session store in production.',
      'After changing scopes in the Partners Portal, reinstall the app in each store to get a token with them.',
      `For a whole app (Admin panel, Nexo, Nimbus), start from the official templates: ${DOCS.templates}`,
      'Dependencies: express and @types/express.',
    ]
  )
}
