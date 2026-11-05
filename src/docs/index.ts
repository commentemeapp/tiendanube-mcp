import { fetchDoc, LOCALES, type Locale } from './fetch.js'

export interface DocEntry {
  title: string
  url: string
  description: string
  /** Breadcrumb of the llms.txt headings above the entry (e.g. "Admin API"). */
  section: string
}

/** Parses an llms.txt index: `- [Title](url): description` lines under `## Section` headings. */
export function parseIndex(body: string): DocEntry[] {
  const entries: DocEntry[] = []
  let section = ''
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) {
      section = h[1]
      continue
    }
    const m = /^\s*-\s+\[(.+?)\]\((https?:\/\/[^)\s]+)\)(?::\s*(.*))?$/.exec(line)
    if (m && /\.(md|txt)$/.test(m[2]))
      entries.push({ title: m[1], url: m[2], description: m[3] ?? '', section })
  }
  return entries
}

export async function loadIndex(locale: Locale): Promise<DocEntry[]> {
  return parseIndex(await fetchDoc(`${LOCALES[locale]}llms.txt`))
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1)

export function rankEntries(entries: DocEntry[], query: string): DocEntry[] {
  const q = words(query)
  const scored = entries
    .map((e) => {
      const title = words(e.title)
      const rest = words(`${e.description} ${e.section} ${e.url}`)
      const s = q.reduce(
        (acc, w) =>
          acc +
          (title.includes(w) ? 4 : title.some((t) => t.startsWith(w)) ? 2 : 0) +
          (rest.includes(w) ? 1 : 0),
        0
      )
      return { e, s }
    })
    .filter((x) => x.s > 0)
  scored.sort((a, b) => b.s - a.s)
  return scored.map((x) => x.e)
}

export interface Section {
  heading: string
  level: number
  anchor: string
  body: string
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

/** Splits a Markdown page into sections by heading, ignoring headings inside code fences. */
export function splitSections(md: string): Section[] {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '')
  const sections: Section[] = [{ heading: '', level: 0, anchor: '', body: '' }]
  let fence = false
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) fence = !fence
    const h = !fence && /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (h) sections.push({ heading: h[2], level: h[1].length, anchor: slug(h[2]), body: '' })
    else sections[sections.length - 1].body += line + '\n'
  }
  return sections.filter((s) => s.heading || s.body.trim())
}

/** The best excerpt of a page for a query: the section with most query words. */
export function bestExcerpt(
  md: string,
  query: string,
  max = 700
): { section: Section; excerpt: string } {
  const q = words(query)
  const sections = splitSections(md)
  let best = sections[0]
  let bestScore = -1
  for (const s of sections) {
    const w = words(`${s.heading} ${s.heading} ${s.body}`)
    const score = q.reduce((acc, x) => acc + w.filter((y) => y === x).length, 0)
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  const text = best.body.replace(/\n{3,}/g, '\n\n').trim()
  return {
    section: best,
    excerpt: text.length > max ? text.slice(0, max).trimEnd() + ' ...' : text,
  }
}

export function frontmatter(md: string): Record<string, string> {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(md)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const line of fm.split('\n')) {
    const m = /^([a-z_]+):\s*["']?(.*?)["']?\s*$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}
