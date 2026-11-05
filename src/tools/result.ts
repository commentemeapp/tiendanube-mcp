export interface TextResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function text(body: string, isError = false): TextResult {
  return { content: [{ type: 'text', text: body }], ...(isError ? { isError: true } : {}) }
}
