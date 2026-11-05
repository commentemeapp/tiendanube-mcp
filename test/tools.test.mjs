import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

// The doc tools read synthetic pages from test/fixtures instead of the network.
process.env.TIENDANUBE_MCP_FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const { call, closeClient, getClient } = await import('./helpers.mjs')

after(closeClient)

test('every tool answers without error', async () => {
  const calls = {
    'search-docs': { query: 'webhook signature' },
    'read-doc': { url: 'api/resources/2025-03/webhook' },
    'lookup-endpoint': { query: '/webhooks' },
    'lookup-scope': {},
    'lookup-webhook-event': {},
    'scaffold-webhook-handler': { events: ['order/paid'] },
    'scaffold-oauth-callback': { appId: '1234' },
  }
  const { tools } = await (await getClient()).listTools()
  assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(calls).sort())
  for (const [name, args] of Object.entries(calls)) {
    const res = await call(name, args)
    assert.ok(!res.isError, `${name} returned an error: ${res.text}`)
    assert.ok(res.text.length > 100, `${name} returned too little`)
  }
})

test('search-docs ranks by title and quotes the best section', async () => {
  const res = await call('search-docs', { query: 'webhook signature', limit: 2 })
  assert.match(
    res.text,
    /## Webhook\n- URL: https:\/\/nuvemshop\.dev\/en-US\/api\/resources\/2025-03\/webhook\.md/
  )
  assert.match(res.text, /Best match in "Verifying a webhook"/)
  assert.match(res.text, /webhook\.md#verifying-a-webhook/)
})

test('read-doc returns one section with its subsections, ignoring fenced headings', async () => {
  const res = await call('read-doc', {
    url: 'https://nuvemshop.dev/en-US/api/resources/2025-03/webhook#verifying-a-webhook',
  })
  assert.match(
    res.text,
    /^> Webhook · https:\/\/nuvemshop\.dev\/en-US\/api\/resources\/2025-03\/webhook\.md · updated 2026-01-01/
  )
  assert.match(res.text, /### Nested detail/)
  assert.match(res.text, /## not a heading inside a fence/)
  assert.doesNotMatch(res.text, /## Endpoints/)
})

test('read-doc refuses other hosts and lists sections when one is missing', async () => {
  const other = await call('read-doc', { url: 'https://example.com/page' })
  assert.ok(other.isError)
  assert.match(other.text, /Only nuvemshop\.dev and tiendanube\.dev/)
  const missing = await call('read-doc', { url: 'api/resources/2025-03/webhook', section: 'nope' })
  assert.ok(missing.isError)
  assert.match(missing.text, /- Verifying a webhook/)
})

test('lookup-endpoint normalizes real ids, versions and store ids in paths', async () => {
  const res = await call('lookup-endpoint', {
    query: 'https://api.tiendanube.com/2025-03/987654/orders/123/fulfillment-orders',
  })
  assert.ok(!res.isError, res.text)
  assert.match(res.text, /GET \/orders\/\{order_id\}\/fulfillment-orders/)
  assert.match(res.text, /Scope: `read_fulfillment_orders`/)
})

test('lookup-endpoint asks for the write scope on writes', async () => {
  const res = await call('lookup-endpoint', { query: '/products', method: 'POST' })
  assert.match(res.text, /Scope: `write_products`/)
})

test('lookup-scope finds the scope of a resource and of a path', async () => {
  const byName = await call('lookup-scope', { query: 'Draft Order' })
  assert.match(byName.text, /`read_draft_orders` \/ `write_draft_orders`/)
  const byPath = await call('lookup-scope', { query: '/locations' })
  assert.match(byPath.text, /`read_locations` \/ `write_locations`/)
})

test('lookup-webhook-event lists the required privacy webhooks apart', async () => {
  const res = await call('lookup-webhook-event', {})
  assert.match(
    res.text,
    /\*\*privacy \(required for every app\)\*\*: `app\/store_redact`, `customer\/redact`, `customers\/data_request`/
  )
  assert.match(res.text, /`order\/paid`/)
})

test('scaffold-webhook-handler rejects unknown events and returns files', async () => {
  const bad = await call('scaffold-webhook-handler', { events: ['order/teleported'] })
  assert.ok(bad.isError)
  const ok = await call('scaffold-webhook-handler', {
    events: ['order/paid', 'app/uninstalled'],
    dir: 'server',
  })
  const files = ok.structuredContent.files
  assert.deepEqual(
    files.map((f) => f.path),
    ['server/webhooks.ts', 'server/webhooks.test.ts']
  )
  assert.match(files[0].content, /x-linkedstore-hmac-sha256/)
  assert.match(files[0].content, /timingSafeEqual/)
  assert.match(files[0].content, /case 'app\/uninstalled':/)
})

test('scaffolds refuse paths outside the project', async () => {
  const res = await call('scaffold-oauth-callback', { appId: '1234', dir: '../x' })
  assert.ok(res.isError)
})

test('scaffold-oauth-callback exchanges the code with a JSON body', async () => {
  const res = await call('scaffold-oauth-callback', { appId: '1234', brand: 'nuvemshop' })
  const [file] = res.structuredContent.files
  assert.match(file.content, /https:\/\/www\.nuvemshop\.com\.br\/apps\/authorize\/token/)
  assert.match(file.content, /grant_type: 'authorization_code'/)
  assert.doesNotMatch(file.content, /authorize\/token\?/)
})
