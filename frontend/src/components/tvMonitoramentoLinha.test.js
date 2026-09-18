// TV Indoor › Monitoramento — composição da linha e duração relativa (node --test, ESM).
// Rodar: node --test frontend/src/components/tvMonitoramentoLinha.test.js
//
// O que estes testes defendem:
//   1. cada saúde diz o que precisa ser dito, e só;
//   2. nenhum termo interno (`origem=REGRA`, `VIDEO #14`) chega à tela;
//   3. a frase da sincronização segue o DIAGNÓSTICO do servidor, não um limiar recalculado;
//   4. dado ausente não vira placeholder feio;
//   5. o formato da duração é compacto e único.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compacta, duracao, haQuanto, haQuantoNaLista } from '../lib/duracaoRelativa.js'
import { composicao, textoDaProgramacao, textoDaSincronizacao, textoDoItem } from './tvMonitoramentoLinha.js'

const AGORA = '2026-09-15T20:00:00.000Z'
const atras = (segundos) => new Date(Date.parse(AGORA) - segundos * 1000).toISOString()

const tela = (extra) => ({
  id: 1,
  nome: 'TV Salão',
  saude: 'SAUDAVEL',
  motivo: null,
  mensagem: null,
  online: true,
  temTelemetria: true,
  ultimoSinalEm: atras(18),
  tela: { w: 1920, h: 1080 },
  estado: 'REPRODUZINDO',
  itemAtual: { tipo: 'VIDEO', id: 44, versao: 3, nome: 'Billy Tasty Setembro' },
  programacao: { playlistId: 12, playlistNome: 'Jantar', origem: 'REGRA', regraId: 8, regraDescricao: '1/2/3 · 18:00 — 23:00', caiuNoPadrao: false, sincronizadoEm: atras(18), proximaTrocaEm: null },
  falhas: { totalSessao: 0, ultima: null },
  uptimeSegundos: 13320,
  ...extra,
})

// ── Duração ──────────────────────────────────────────────────────────────────
test('🔴 a duração é compacta, com uma unidade abaixo do minuto e duas acima', () => {
  assert.equal(compacta(18), '18s')
  assert.equal(compacta(59), '59s')
  assert.equal(compacta(60), '1min')
  assert.equal(compacta(4 * 60 + 30), '4min')
  assert.equal(compacta(3600), '1h')
  assert.equal(compacta(3600 + 12 * 60), '1h 12min')
  assert.equal(compacta(4 * 3600 + 2 * 60), '4h 2min')
  assert.equal(compacta(2 * 86400 + 3 * 3600), '2d 3h')
  assert.equal(compacta(2 * 86400), '2d')
  // Nada de `4 h 2 min`: espaço entre número e unidade lê como frase, não como medida.
  for (const s of [30, 90, 5000, 100000, 200000]) assert.equal(/\d\s(h|min|s|d)/.test(compacta(s)), false)
})

test('a âncora é o relógio do SERVIDOR, não o do navegador', () => {
  // Um computador com a hora adiantada mostraria "há 2 horas" numa TV que bateu agora.
  assert.equal(haQuanto(atras(18), AGORA), 'há 18s')
  assert.equal(haQuanto(atras(4 * 3600 + 2 * 60), AGORA), 'há 4h 2min')
  assert.equal(haQuanto(null, AGORA), null)
  assert.equal(haQuanto('ontem', AGORA), null)
  assert.equal(duracao(13320), '3h 42min')
  assert.equal(duracao(null), null)
  assert.equal(duracao(-1), null)
})

// ── Peças ────────────────────────────────────────────────────────────────────
test('🔴 o item aparece por NOME, nunca por id', () => {
  assert.equal(textoDoItem({ tipo: 'VIDEO', id: 44, nome: 'Billy Tasty Setembro' }), 'Vídeo — Billy Tasty Setembro')
  assert.equal(textoDoItem({ tipo: 'IMAGEM', id: 12, nome: 'Campanha Setembro' }), 'Imagem — Campanha Setembro')
  assert.equal(textoDoItem({ tipo: 'MENU_BOARD', id: 3, nome: 'Hambúrgueres' }), 'Menu Board — Hambúrgueres')
  // Apagado entre o heartbeat e agora: a linha não quebra e o gestor entende o que houve.
  assert.equal(textoDoItem({ tipo: 'VIDEO', id: 44, nome: null }), 'Vídeo — Item removido')
  assert.equal(textoDoItem(null), null)
  // E nenhum id vaza para a UI principal.
  for (const t of ['VIDEO', 'IMAGEM', 'MENU_BOARD']) {
    assert.equal(/#|\d/.test(textoDoItem({ tipo: t, id: 44, nome: 'Arte' })), false)
  }
})

test('a programação diz a playlist e o porquê, sem termo interno', () => {
  assert.equal(textoDaProgramacao({ playlistId: 12, playlistNome: 'Jantar', origem: 'REGRA' }), 'Playlist Jantar · Regra semanal')
  assert.equal(textoDaProgramacao({ playlistId: 4, playlistNome: 'Institucional', origem: 'PADRAO' }), 'Playlist Institucional · Playlist padrão')
  // O fallback é uma palavra na lista, não um parágrafo.
  assert.equal(textoDaProgramacao({ playlistId: 4, playlistNome: 'Institucional', origem: 'PADRAO', caiuNoPadrao: true }), 'Playlist Institucional · Fallback para padrão')
  assert.equal(textoDaProgramacao({ playlistId: 9, playlistNome: null }), 'Playlist removida')
  assert.equal(textoDaProgramacao({ playlistId: null }), null)
  assert.equal(textoDaProgramacao(null), null)
  assert.equal(/origem|REGRA|PADRAO/.test(textoDaProgramacao({ playlistId: 1, playlistNome: 'X', origem: 'REGRA' })), false)
})

test('🔴 a frase da sincronização segue o DIAGNÓSTICO do servidor', () => {
  // O limiar é do backend. Recalcular 4 minutos aqui criaria uma segunda régua que um dia
  // discordaria da primeira — as duas na mesma tela.
  assert.equal(textoDaSincronizacao(tela(), AGORA), 'Sincronizado há 18s')
  const atrasada = tela({ saude: 'ATENCAO', motivo: 'SINCRONIZACAO_ANTIGA', programacao: { ...tela().programacao, sincronizadoEm: atras(8 * 60) } })
  assert.equal(textoDaSincronizacao(atrasada, AGORA), 'Sem sincronizar há 8min')
  // Mesma idade, motivo diferente: a frase acompanha o diagnóstico, não o relógio.
  const outraFalha = tela({ saude: 'ATENCAO', motivo: 'FALHA_RECENTE', programacao: { ...tela().programacao, sincronizadoEm: atras(30) } })
  assert.equal(textoDaSincronizacao(outraFalha, AGORA), 'Sincronizado há 30s')
})

// ── Composição por estado ────────────────────────────────────────────────────
test('🔴 TUDO CERTO mostra o que está no ar, sem aviso nenhum', () => {
  const c = composicao(tela(), AGORA)
  assert.equal(c.aviso, null, 'quem está bem não precisa de aviso')
  assert.equal(c.item, 'Vídeo — Billy Tasty Setembro')
  assert.equal(c.programacao, 'Playlist Jantar · Regra semanal')
  assert.deepEqual(c.apoio, ['Sincronizado há 18s', '1920 × 1080'])
})

test('ATENÇÃO abre com o problema, mas continua dizendo o que está no ar', () => {
  const c = composicao(tela({
    saude: 'ATENCAO', motivo: 'FALHA_RECENTE', mensagem: 'Houve uma falha de reprodução há poucos minutos.',
  }), AGORA)
  assert.equal(c.aviso, 'Houve uma falha de reprodução há poucos minutos.')
  assert.equal(c.item, 'Vídeo — Billy Tasty Setembro', 'a TV não parou de tocar por causa do aviso')
})

test('🔴 OFFLINE não finge que o último item é o item ATUAL', () => {
  const c = composicao(tela({
    saude: 'OFFLINE', motivo: 'SEM_SINAL', mensagem: 'Sem comunicação com o sistema.', online: false,
    ultimoSinalEm: atras(4 * 3600 + 2 * 60),
  }), AGORA)
  assert.equal(c.aviso, 'Sem comunicação com o sistema.')
  assert.equal(c.item, null, 'o que ela estava fazendo não é o que ela está fazendo')
  assert.equal(c.programacao, null)
  assert.deepEqual(c.apoio, ['Último sinal há 4h 2min', '1920 × 1080'])
})

test('SEM PROGRAMAÇÃO e SEM TELEMETRIA não inventam dados de reprodução', () => {
  const semProg = composicao(tela({ saude: 'SEM_PROGRAMACAO', motivo: 'SEM_PLAYLIST', mensagem: 'Nenhuma playlist configurada para esta tela.', itemAtual: null, programacao: null }), AGORA)
  assert.equal(semProg.aviso, 'Nenhuma playlist configurada para esta tela.')
  assert.equal(semProg.item, null)
  assert.deepEqual(semProg.apoio, ['Último sinal há 18s', '1920 × 1080'])

  const semTel = composicao(tela({ saude: 'SEM_TELEMETRIA', motivo: 'SEM_SNAPSHOT', mensagem: 'A TV está online, mas o player ainda não informa o que está reproduzindo.', temTelemetria: false, itemAtual: null, programacao: null, estado: null }), AGORA)
  assert.equal(semTel.item, null)
  assert.deepEqual(semTel.apoio, ['Último sinal há 18s', '1920 × 1080'])
})

test('🔴 dado ausente some da linha em vez de virar placeholder feio', () => {
  // `sincronizadoEm` continua presente: o que falta neste caso é a RESOLUÇÃO e o item.
  const c = composicao(tela({ tela: null, itemAtual: null, programacao: { playlistId: null, playlistNome: null, sincronizadoEm: atras(18) } }), AGORA)
  assert.deepEqual(c.apoio, ['Sincronizado há 18s'], 'sem resolução, a linha não a menciona')
  assert.equal(c.item, null)
  assert.equal(c.programacao, null)
  // Nada de "—", "null" ou "undefined" escapando para a tela.
  const tudo = JSON.stringify(c)
  for (const feio of ['null', 'undefined', '—', 'NaN']) assert.equal(tudo.includes(`"${feio}`), false)
})

test('TV que nunca se comunicou diz isso, e não "há NaN"', () => {
  const c = composicao(tela({ saude: 'OFFLINE', mensagem: 'Sem comunicação com o sistema.', ultimoSinalEm: null, tela: null }), AGORA)
  assert.deepEqual(c.apoio, ['Nunca se comunicou'])
})

test('os três tipos de item compõem a linha saudável igualmente bem', () => {
  for (const [item, esperado] of [
    [{ tipo: 'IMAGEM', id: 12, versao: 2, nome: 'Campanha Setembro' }, 'Imagem — Campanha Setembro'],
    [{ tipo: 'MENU_BOARD', id: 3, versao: null, nome: 'Hambúrgueres' }, 'Menu Board — Hambúrgueres'],
    [{ tipo: 'VIDEO', id: 44, versao: 3, nome: 'Billy Tasty Setembro' }, 'Vídeo — Billy Tasty Setembro'],
  ]) {
    assert.equal(composicao(tela({ itemAtual: item }), AGORA).item, esperado)
  }
})

// ── Guardas estáticas: o monitoramento mora em Telas ─────────────────────────────────
import fs from 'node:fs'
const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('🔴 o monitoramento é camada por cima da lista de Telas — nunca condição', () => {
  /* A página própria saiu; o diagnóstico virou o botão "Monitorar" na linha da TV. Três
     coisas não podem regredir: a leitura de saúde é SEPARADA e silenciosa (um 500 dela não
     apaga a lista nem gera toast a cada 30 s); o selo de ATENÇÃO sobe para a linha (é o que
     online/offline não diz); e o modal desenha a TV da leitura MAIS RECENTE, pelo id —
     aberto por dois minutos, ele não pode envelhecer. */
  const telas = ler('../pages/TvIndoorTelas.jsx')
  assert.match(telas, /api\.get\('\/tv-indoor\/monitoramento'\)[\s\S]{0,400}\.catch\(\(\) => \{\}\)/, 'leitura silenciosa')
  assert.match(telas, /m\?\.saude === 'ATENCAO'/)
  assert.match(telas, /monitor\?\.porId\[monitorando\]/, 'o modal lê a TV da leitura mais recente')
  assert.match(telas, />\s*Monitorar\s*</)
  assert.equal(fs.existsSync(new URL('../pages/TvIndoorMonitoramento.jsx', import.meta.url)), false, 'a página própria não volta')
  assert.match(ler('../App.jsx'), /path="tv-indoor\/monitoramento" element=\{<Navigate to="\/tv-indoor\/telas" replace \/>\}/)
})

// ── O "último sinal" nas listas de aparelhos ─────────────────────────────────────────

test('🔴 na lista, abaixo de um minuto é "agora" — no detalhe, são os segundos', () => {
  /* A lista se redesenha todo segundo (a contagem do código anda). "há 3s, há 4s, há 5s"
     numa linha que o olho varre só pisca, e para um aparelho que bate a cada 60s tudo abaixo
     disso quer dizer a mesma coisa: está vivo. O modal de diagnóstico não passa o limite. */
  const sinal = '2026-09-18T12:00:00.000Z'
  const depois = (s) => new Date(Date.parse(sinal) + s * 1000).toISOString()

  assert.equal(haQuanto(sinal, depois(30)), 'há 30s', 'sem limite: o detalhe mostra os segundos')
  assert.equal(haQuanto(sinal, depois(30), { agoraAbaixoDe: 60 }), 'agora')
  assert.equal(haQuanto(sinal, depois(60), { agoraAbaixoDe: 60 }), 'há 1min', 'o limite é exclusivo')

  const ms = (s) => Date.parse(sinal) + s * 1000
  assert.equal(haQuantoNaLista(sinal, ms(59)), 'agora')
  // As cópias antigas arredondavam 90s para "2 min" — mais tempo do que passou.
  assert.equal(haQuantoNaLista(sinal, ms(90)), 'há 1min')
  assert.equal(haQuantoNaLista(sinal, ms(4 * 3600 + 2 * 60)), 'há 4h 2min')
  assert.equal(haQuantoNaLista(null, ms(10)), null, 'sem instante, quem chama escreve "nunca deu sinal"')
})

test('🔴 as listas de aparelhos não têm formatador próprio', () => {
  /* Eram duas cópias fora da lib, com espaço ("5 min") e arredondando para cima. Quando o
     monitoramento passou a abrir dentro da lista de Telas, a linha e o modal escreviam o
     mesmo sinal de dois jeitos, na mesma tela. */
  for (const pagina of ['../pages/TvIndoorTelas.jsx', '../pages/Aparelhos.jsx']) {
    const codigo = ler(pagina)
    assert.equal(/function haQuanto\b|const haQuanto\b/.test(codigo), false, `${pagina} voltou a ter um formatador próprio`)
    assert.match(codigo, /import \{ haQuantoNaLista \} from '\.\.\/lib\/duracaoRelativa'/)
    assert.match(codigo, /haQuantoNaLista\((t|ap)\.ultimoSinalEm, agora\)/)
  }
})
