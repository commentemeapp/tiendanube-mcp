import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The official docs have Markdown versions meant for agents (llms.txt, `.md` pages).
 * They are not under an open license, so this package never bundles them: pages are
 * fetched live, only from these hosts, and kept in memory for the life of the process.
 */
export const DOC_HOSTS = ['nuvemshop.dev', 'tiendanube.dev'] as const

export const LOCALES = {
  'en-US': 'https://nuvemshop.dev/en-US/',
  'pt-BR': 'https://nuvemshop.dev/',
  es: 'https://tiendanube.dev/',
} as const
export type Locale = keyof typeof LOCALES

const USER_AGENT = 'tiendanube-mcp (+https://github.com/commentemeapp/tiendanube-mcp)'
const TIMEOUT_MS = 15000
const cache = new Map<string, string>()

export class DocError extends Error {}

/** Turns a URL or a site path into the URL of the Markdown version of that page. */
export function toMarkdownUrl(ref: string, locale: Locale = 'en-US'): string {
  let url: URL
  try {
    url = new URL(ref)
  } catch {
    url = new URL(ref.replace(/^\/+/, ''), LOCALES[locale])
  }
  if (url.protocol !== 'https:' || !DOC_HOSTS.includes(url.hostname as (typeof DOC_HOSTS)[number]))
    throw new DocError(`Only ${DOC_HOSTS.join(' and ')} pages can be read, not ${url.hostname}.`)
  url.hash = ''
  url.search = ''
  if (!url.pathname.endsWith('.md') && !url.pathname.endsWith('.txt'))
    url.pathname = url.pathname.replace(/\/$/, '') + '.md'
  return url.toString()
}

/**
 * In tests, TIENDANUBE_MCP_FIXTURES points to a folder with synthetic pages: the URL
 * `https://nuvemshop.dev/en-US/api/x.md` is read from `<folder>/nuvemshop.dev/en-US/api/x.md`.
 */
function fromFixtures(url: string): string | undefined {
  const dir = process.env.TIENDANUBE_MCP_FIXTURES
  if (!dir) return undefined
  const u = new URL(url)
  try {
    return readFileSync(join(dir, u.hostname, u.pathname), 'utf-8')
  } catch {
    throw new DocError(`Page not found (404): ${url}`)
  }
}

export async function fetchDoc(url: string): Promise<string> {
  const hit = cache.get(url)
  if (hit !== undefined) return hit
  const fixture = fromFixtures(url)
  if (fixture !== undefined) {
    cache.set(url, fixture)
    return fixture
  }
  let lastStatus = 0
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        // With a .md URL, Accept: text/markdown answers 404: ask for plain text.
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, */*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) {
        const body = await res.text()
        cache.set(url, body)
        return body
      }
      lastStatus = res.status
      if (res.status === 404) throw new DocError(`Page not found (404): ${url}`)
    } catch (e) {
      if (e instanceof DocError) throw e
    }
    await new Promise((ok) => setTimeout(ok, 800 * attempt))
  }
  throw new DocError(
    `Could not reach ${url}${lastStatus ? ` (last status ${lastStatus})` : ''}. The docs site may be down; try again later or open the page in a browser.`
  )
}
