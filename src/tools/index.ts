import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readDocSchema, readDocTool, searchDocsSchema, searchDocsTool } from './docs.js'
import {
  lookupEndpoint,
  lookupEndpointSchema,
  lookupScope,
  lookupScopeSchema,
  lookupWebhookEvent,
  lookupWebhookEventSchema,
} from './lookup.js'
import {
  outputSchema,
  scaffoldOauthCallback,
  scaffoldOauthCallbackSchema,
  scaffoldWebhookHandler,
  scaffoldWebhookHandlerSchema,
} from './scaffold.js'

/** Reads the official docs over the network (nuvemshop.dev and tiendanube.dev only). */
const liveDocs = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}

/** Reads only the bundled indexes: nothing is written to disk and nothing goes to the network. */
const offline = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export function registerTools(server: McpServer) {
  server.registerTool(
    'search-docs',
    {
      title: 'Search Tiendanube / Nuvemshop docs',
      description:
        'Search the official Tiendanube / Nuvemshop developer docs (Admin API, apps, NubeSDK, themes, Storefront API, AI and agents), fetched live from nuvemshop.dev. Returns matching pages with URL and, for the top three, the best matching section. Use it first for any "how do I" question; follow up with read-doc.',
      inputSchema: searchDocsSchema,
      annotations: liveDocs,
    },
    searchDocsTool
  )

  server.registerTool(
    'read-doc',
    {
      title: 'Read a Tiendanube / Nuvemshop doc page',
      description:
        'Read a page of the official docs, or one section of it, by URL or site path. Fetched live as Markdown from nuvemshop.dev or tiendanube.dev; other hosts are refused. Use it after search-docs, lookup-endpoint or when the user pastes a docs link.',
      inputSchema: readDocSchema,
      annotations: liveDocs,
    },
    readDocTool
  )

  server.registerTool(
    'lookup-endpoint',
    {
      title: 'Look up an Admin API endpoint',
      description:
        'Look up Tiendanube / Nuvemshop Admin API endpoints by path, resource or keywords: method, path, full URL with version and store_id, the OAuth scope it needs and the reference page. Works offline from an index of the 2025-03 reference. Use it when writing or reviewing API calls.',
      inputSchema: lookupEndpointSchema,
      annotations: offline,
    },
    lookupEndpoint
  )

  server.registerTool(
    'lookup-scope',
    {
      title: 'Look up OAuth scopes',
      description:
        'List the OAuth scopes of Tiendanube / Nuvemshop apps and the resources each one opens, or find the scope for a resource, endpoint path or scope name. Use it when choosing the scopes of an app in the Partners Portal or debugging a 401/403.',
      inputSchema: lookupScopeSchema,
      annotations: offline,
    },
    lookupScope
  )

  server.registerTool(
    'lookup-webhook-event',
    {
      title: 'Look up webhook events',
      description:
        'List the webhook events of Tiendanube / Nuvemshop (orders, products, customers, fulfillment orders, locations, billing, app lifecycle and the required privacy webhooks), or find one, with how to register and verify them. Use it before registering webhooks or writing a receiver.',
      inputSchema: lookupWebhookEventSchema,
      annotations: offline,
    },
    lookupWebhookEvent
  )

  server.registerTool(
    'scaffold-webhook-handler',
    {
      title: 'Scaffold a webhook receiver',
      description:
        'Generate an Express (TypeScript) webhook receiver for Tiendanube / Nuvemshop: x-linkedstore-hmac-sha256 verification over the raw body, immediate 200, one case per event and a node:test for the signature. Returns the files for the caller to write; the server never writes to disk.',
      inputSchema: scaffoldWebhookHandlerSchema,
      outputSchema,
      annotations: offline,
    },
    scaffoldWebhookHandler
  )

  server.registerTool(
    'scaffold-oauth-callback',
    {
      title: 'Scaffold the OAuth install flow',
      description:
        'Generate the Express (TypeScript) OAuth 2 authorization code flow of a Tiendanube / Nuvemshop app: install redirect with state, callback that exchanges the code with a JSON body and stores the token per app and store. Returns the files for the caller to write. For a full app, it points to the official templates.',
      inputSchema: scaffoldOauthCallbackSchema,
      outputSchema,
      annotations: offline,
    },
    scaffoldOauthCallback
  )
}
