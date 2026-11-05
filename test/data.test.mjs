import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf-8'))

test('the endpoint index covers the main resources with clean paths', () => {
  const { version, endpoints, resources } = load('endpoints.json')
  assert.equal(version, '2025-03')
  assert.ok(endpoints.length > 150, `only ${endpoints.length} endpoints`)
  for (const e of endpoints) {
    assert.match(e.path, /^\/[A-Za-z0-9_{}/.-]*$/, `bad path ${e.method} ${e.path}`)
    assert.doesNotMatch(e.path, /\/\d+(\/|$)/, `example id left in ${e.path}`)
    assert.match(e.url, /^https:\/\/nuvemshop\.dev\/en-US\/api\/resources\/2025-03\/.+\.md$/)
  }
  const names = new Set(resources.map((r) => r.resource))
  for (const r of ['Product', 'Order', 'Fulfillment Order', 'Webhook', 'Customer', 'Location'])
    assert.ok(names.has(r), `missing resource ${r}`)
})

test('the indexes carry facts and links only, no documentation prose', () => {
  for (const f of ['endpoints.json', 'scopes.json', 'webhooks.json']) {
    const longest = Math.max(
      ...JSON.stringify(load(f))
        .match(/"(?:[^"\\]|\\.)*"/g)
        .map((s) => s.length)
    )
    assert.ok(longest < 200, `${f} has a string of ${longest} characters`)
  }
})

test('scopes and webhook events were parsed', () => {
  const { scopes } = load('scopes.json')
  assert.ok(scopes.some((g) => g.scopes.includes('write_products')))
  const { events } = load('webhooks.json')
  assert.equal(events.filter((e) => e.required).length, 3)
  assert.ok(events.some((e) => e.event === 'order/paid'))
})
