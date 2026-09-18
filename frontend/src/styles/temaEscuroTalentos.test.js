// Tema escuro do Banco de Talentos, da Indicação e dos toasts — guarda estática (node --test).
// Rodar: node --test frontend/src/styles/temaEscuroTalentos.test.js
//
// Estas telas nasceram só com cores de tema claro, e no escuro a ficha do candidato era um
// painel branco inteiro. A guarda não guarda uma LISTA de classes — ela varre as famílias no
// CSS, descobre quais classes estão vivas nos componentes e exige ajuste escuro de cada uma
// que tenha cor fixa. Uma classe nova sem tratamento escuro quebra o teste no dia em que nasce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.join(aqui, '..')
const css = fs.readFileSync(path.join(aqui, 'global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const FAMILIAS = ['drawer', 'proc-', 'bt-vaga', 'ind-stat', 'ind-note', 'q-', 'perm-', 'insc-', 'fb-', 'toast']

/* Cor fixa que funciona NOS DOIS temas, e por isso não precisa de ajuste. Cada entrada diz
   por quê — uma exceção sem motivo escrito é só um buraco com nome. */
const FUNCIONA_NOS_DOIS = {
  'fb-pergunta-num': 'laranja sólido com número branco: é a cor da marca, lê igual nos dois fundos',
}

function codigoDosComponentes() {
  const partes = []
  const andar = (dir) => {
    for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, nome.name)
      if (nome.isDirectory()) andar(p)
      else if (/\.(jsx?|mjs)$/.test(nome.name) && !nome.name.endsWith('.test.js')) partes.push(fs.readFileSync(p, 'utf8'))
    }
  }
  andar(raiz)
  return partes.join('\n')
}

const codigo = codigoDosComponentes()
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* Viva = aparece como palavra inteira num componente, ou é montada por template
   (`toast-${type}` torna vivas toast-success, toast-error e toast-info). */
function viva(classe) {
  if (new RegExp(`(?<![\\w-])${escapar(classe)}(?![\\w-])`).test(codigo)) return true
  const prefixo = classe.slice(0, classe.lastIndexOf('-') + 1)
  return prefixo.length > 1 && codigo.includes(prefixo + '${')
}

const COR_FIXA = /(?:^|;)\s*(?:color|background(?:-color)?|border(?:-(?:top|bottom|left|right))?(?:-color)?)\s*:[^;]*#[0-9a-fA-F]{3,6}/

test('🔴 toda classe viva dessas telas com cor fixa de tema claro tem ajuste escuro', () => {
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const escuros = regras.map((r) => r[1]).filter((sel) => sel.includes('theme-dark')).join('\n')

  const precisam = new Set()
  for (const [, seletor, corpo] of regras) {
    if (seletor.includes('theme-dark') || seletor.includes('@') || !COR_FIXA.test(corpo)) continue
    for (const [, classe] of seletor.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      if (FAMILIAS.some((f) => classe.startsWith(f)) && viva(classe) && !FUNCIONA_NOS_DOIS[classe]) precisam.add(classe)
    }
  }

  assert.ok(precisam.size > 50, `a varredura achou só ${precisam.size} classes — o filtro quebrou, não o tema`)
  const faltando = [...precisam].filter((c) => !new RegExp(`\\.${escapar(c)}(?![\\w-])`).test(escuros))
  assert.deepEqual(faltando, [], `sem ajuste escuro: ${faltando.join(', ')}`)
})

test('🔴 no escuro, sucesso, erro e aviso continuam distintos — e com fundo sólido', () => {
  /* O `.toast` escuro usa `!important`. Sem `!important` também nos tipos, os três saíam
     iguais, cinza sobre cinza. E o fundo é SÓLIDO: o toast flutua sobre a página, e um fundo
     translúcido deixaria o texto de trás aparecer através da mensagem. */
  for (const tipo of ['success', 'error', 'info']) {
    const m = css.match(new RegExp(`body\\.theme-dark \\.toast-${tipo} \\{([^}]*)\\}`))
    assert.ok(m, `falta o toast-${tipo} escuro`)
    assert.match(m[1], /background: #[0-9a-fA-F]{6} !important/, `toast-${tipo}: fundo sólido e com !important`)
    assert.match(m[1], /color: #[0-9a-fA-F]{6} !important/)
  }
})

test('🔴 no escuro, a faixa de status das vagas continua colorida', () => {
  /* A borda esquerda de .bt-vaga é o status (aberta verde, pausada âmbar). Um `border-color`
     na regra escura a apagaria, porque tem especificidade maior que `.bt-vaga.vs-ABERTA`. */
  const bloco = css.match(/body\.theme-dark \.bt-vaga \{([^}]*)\}/)
  assert.ok(bloco, 'falta o ajuste escuro das bordas da vaga')
  assert.equal(/border-color|border-left/.test(bloco[1]), false, 'a regra escura não pode tocar na borda esquerda')
  const agrupadas = [...css.matchAll(/([^{}]+)\{([^{}]*border-color[^{}]*)\}/g)]
    .filter(([, sel]) => sel.includes('theme-dark') && /\.bt-vaga(?![\w-])/.test(sel))
  assert.deepEqual(agrupadas.map(([sel]) => sel.trim()), [], 'nenhum grupo escuro com border-color pode incluir .bt-vaga')
})
