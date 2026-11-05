// Procura rastros que não podem ir para o repositório nem para o pacote: caminhos locais,
// correios pessoais e nomes de clientes. Varre tudo fora de node_modules e .git.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ESTE = fileURLToPath(import.meta.url)
const PULAR = new Set(['node_modules', '.git'])

const REGRAS = [
  { nome: 'caminho local /Users/', re: /\/Users\/[A-Za-z0-9._-]+/ },
  { nome: 'caminho local /Volumes/', re: /\/Volumes\/[A-Za-z0-9._-]+/ },
  { nome: 'caminho temporário /private/tmp', re: /\/private\/tmp\b/ },
  {
    nome: 'correio pessoal',
    re: /[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook|icloud|me|live|yahoo)\.com\b/i,
  },
  { nome: 'nome de cliente', re: /construplaza|drsimi|rutpay|casaideas|magriffe|manchile/i },
]

function* arquivos(dir) {
  for (const nome of readdirSync(dir)) {
    if (PULAR.has(nome)) continue
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) yield* arquivos(p)
    else if (p !== ESTE) yield p
  }
}

let achados = 0
for (const arq of arquivos(RAIZ)) {
  const texto = readFileSync(arq, 'utf-8')
  for (const { nome, re } of REGRAS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    for (const m of texto.matchAll(g)) {
      const linha = texto.slice(0, m.index).split('\n').length
      console.error(`${relative(RAIZ, arq)}:${linha}: ${nome}: ${m[0]}`)
      achados++
    }
  }
}
if (achados) {
  console.error(`rastros: ${achados} ocorrência(s)`)
  process.exit(1)
}
console.log('rastros: nada encontrado')
