import { z } from 'zod'
import { DocError, fetchDoc, LOCALES, toMarkdownUrl, type Locale } from '../docs/fetch.js'
import {
  bestExcerpt,
  frontmatter,
  loadIndex,
  rankEntries,
  slug,
  splitSections,
} from '../docs/index.js'
import { text } from './result.js'

const localeSchema = z
  .enum(Object.keys(LOCALES) as [Locale, ...Locale[]])
  .optional()
  .describe('Docs language: en-US (default), pt-BR (Nuvemshop) or es (Tiendanube)')

export const searchDocsSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      'Keywords to look for in the official Tiendanube / Nuvemshop developer docs (e.g. "webhook signature", "fulfillment order tracking", "NubeSDK checkout slot", "sectionable theme schema")'
    ),
  locale: localeSchema,
  limit: z.number().int().min(1).max(15).optional().describe('Max results (default 5, max 15)'),
  excerpts: z
    .boolean()
    .optional()
    .describe('Also fetch the top 3 pages and quote the best matching section (default true)'),
}

export async function searchDocsTool({
  query,
  locale = 'en-US',
  limit = 5,
  excerpts = true,
}: {
  query: string
  locale?: Locale
  limit?: number
  excerpts?: boolean
}) {
  try {
    const hits = rankEntries(await loadIndex(locale), query).slice(0, limit)
    if (!hits.length)
      return text(
        `No pages match "${query}" in the ${locale} index. Try other keywords or another locale.`
      )
    const lines = [`# Docs matching "${query}" (${locale}, live from ${LOCALES[locale]})`, '']
    for (const [i, h] of hits.entries()) {
      lines.push(`## ${h.title}`, `- URL: ${h.url}`)
      if (h.section) lines.push(`- Section: ${h.section}`)
      if (h.description) lines.push(`- ${h.description}`)
      if (excerpts && i < 3) {
        try {
          const { section, excerpt } = bestExcerpt(await fetchDoc(h.url), query)
          if (excerpt) {
            lines.push(
              '',
              `Best match${section.heading ? ` in "${section.heading}"` : ''}:`,
              '',
              excerpt
            )
            if (section.anchor)
              lines.push('', `Read it: \`read-doc\` with \`${h.url}#${section.anchor}\``)
          }
        } catch {
          // the index entry is still useful without the excerpt
        }
      }
      lines.push('')
    }
    lines.push('> Content fetched live from the official docs. Cite the URL when you use it.')
    return text(lines.join('\n'))
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), true)
  }
}

export const readDocSchema = {
  url: z
    .string()
    .min(1)
    .describe(
      'Page URL on nuvemshop.dev or tiendanube.dev (with or without .md, an #anchor selects a section), or a site path such as "api/resources/2025-03/order"'
    ),
  section: z
    .string()
    .optional()
    .describe('Heading or anchor of one section to return instead of the whole page'),
  locale: localeSchema,
  maxChars: z
    .number()
    .int()
    .min(500)
    .max(60000)
    .optional()
    .describe('Truncate the answer to this many characters (default 20000)'),
}

export async function readDocTool({
  url,
  section,
  locale = 'en-US',
  maxChars = 20000,
}: {
  url: string
  section?: string
  locale?: Locale
  maxChars?: number
}) {
  try {
    const anchor = section ?? (url.includes('#') ? url.slice(url.indexOf('#') + 1) : undefined)
    const mdUrl = toMarkdownUrl(url, locale)
    const md = await fetchDoc(mdUrl)
    const meta = frontmatter(md)
    let body: string
    if (anchor) {
      const want = slug(anchor)
      const sections = splitSections(md)
      const i = sections.findIndex((s) => s.anchor === want || slug(s.heading).includes(want))
      if (i < 0) {
        const list = sections
          .filter((s) => s.level >= 2 && s.level <= 3)
          .map((s) => `- ${s.heading}`)
          .join('\n')
        return text(`No section "${anchor}" in ${mdUrl}. Sections:\n${list}`, true)
      }
      const start = sections[i]
      const parts = [`${'#'.repeat(start.level)} ${start.heading}`, start.body]
      for (const s of sections.slice(i + 1)) {
        if (s.level <= start.level) break
        parts.push(`${'#'.repeat(s.level)} ${s.heading}`, s.body)
      }
      body = parts.join('\n')
    } else {
      body = md.replace(/^---\n[\s\S]*?\n---\n/, '')
    }
    const truncated = body.length > maxChars
    const lines = [
      `> ${meta.title ? `${meta.title} · ` : ''}${mdUrl}${meta.last_updated ? ` · updated ${meta.last_updated}` : ''}`,
      '',
      truncated
        ? body.slice(0, maxChars) + '\n\n[truncated: ask for a section or raise maxChars]'
        : body,
    ]
    return text(lines.join('\n'))
  } catch (e) {
    return text(e instanceof DocError || e instanceof Error ? e.message : String(e), true)
  }
}
