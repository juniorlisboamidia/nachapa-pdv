// TV Indoor › telemetria do player — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvTelemetria.test.js
//
// O que estes testes defendem:
//   1. existe UM dono do estado — o heartbeat só lê, e o snapshot nunca se contradiz;
//   2. as três razões para a tela mostrar a marca da loja não se confundem;
//   3. o que viaja são DURAÇÕES, nunca a hora da TV;
//   4. telemetria não agenda nada, não pede nada e não produz imagem de tela nenhuma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FALHAS, _reiniciar, atualizando, falhou, itemNoAr, programacaoRecebida, snapshot, videoNoEstado,
} from './tvTelemetria.js'

const respostaBoa = (extra) => ({
  agoraServidor: '2026-09-15T20:00:00.000Z',
  playlist: { id: 12, nome: 'Jantar' },
  programacaoTela: { playlistEfetivaId: 12, origem: 'REGRA', regraId: 8, caiuNoPadrao: false, proximaTrocaEm: '2026-09-15T23:00:00.000Z' },
  ...extra,
})

test('antes de qualquer programação o estado é ATUALIZANDO', () => {
  _reiniciar()
  atualizando()
  const s = snapshot()
  assert.equal(s.estado, 'ATUALIZANDO')
  assert.equal(s.programacao.sincronizadoEm, null)
  assert.equal(s.itemAtual, null)
})

test('a programação válida grava o `agoraServidor` — a única hora absoluta que aceitamos', () => {
  _reiniciar()
  programacaoRecebida(respostaBoa())
  const s = snapshot()
  assert.equal(s.programacao.sincronizadoEm, '2026-09-15T20:00:00.000Z')
  assert.equal(s.programacao.playlistId, 12)
  assert.equal(s.programacao.origem, 'REGRA')
  assert.equal(s.programacao.regraId, 8)
  assert.equal(s.programacao.proximaTrocaEm, '2026-09-15T23:00:00.000Z')
})

test('🔴 refresh que FALHA não mexe na sincronização — é a ausência que denuncia', () => {
  _reiniciar()
  programacaoRecebida(respostaBoa())
  const antes = snapshot().programacao.sincronizadoEm
  // O player chama `falhou`, e NUNCA `programacaoRecebida`, quando a busca dá errado.
  falhou(FALHAS.PROGRAMACAO)
  const s = snapshot()
  assert.equal(s.programacao.sincronizadoEm, antes, 'a última sincronização boa permanece')
  assert.equal(s.falhas.totalSessao, 1)
  assert.equal(s.falhas.ultima.codigo, 'PROGRAMACAO_REFRESH_ERROR')
})

test('🔴 último estado bom: o item continua reportado mesmo com o refresh falhando', () => {
  // É a informação mais útil do sistema: "refresh falhou" ≠ "player parou".
  _reiniciar()
  programacaoRecebida(respostaBoa())
  itemNoAr({ tipo: 'video', id: 44, arquivoVersao: 3 }, { total: 2, temProgramacao: true })
  falhou(FALHAS.PROGRAMACAO)
  const s = snapshot()
  assert.equal(s.estado, 'REPRODUZINDO')
  assert.deepEqual(s.itemAtual, { tipo: 'VIDEO', id: 44, versao: 3 })
})

test('o item muda com o rodízio, e a versão só existe onde significa algo', () => {
  _reiniciar()
  programacaoRecebida(respostaBoa())

  itemNoAr({ tipo: 'imagem', id: 7, imagemVersao: 2 }, { total: 3, temProgramacao: true })
  assert.deepEqual(snapshot().itemAtual, { tipo: 'IMAGEM', id: 7, versao: 2 })

  itemNoAr({ tipo: 'menu_board', id: 3 }, { total: 3, temProgramacao: true })
  assert.deepEqual(snapshot().itemAtual, { tipo: 'MENU_BOARD', id: 3, versao: null })

  itemNoAr({ tipo: 'video', id: 44, arquivoVersao: 5 }, { total: 3, temProgramacao: true })
  assert.deepEqual(snapshot().itemAtual, { tipo: 'VIDEO', id: 44, versao: 5 })
})

test('🔴 as três razões para mostrar a marca da loja NÃO se confundem', () => {
  // Sem playlist é CONFIGURAÇÃO; playlist sem nada tocável é operacional; tudo falhando é
  // defeito. Depois deste ponto ninguém mais consegue distingui-las.
  _reiniciar()
  itemNoAr(null, { total: 0, temProgramacao: false })
  assert.equal(snapshot().estado, 'SEM_CONTEUDO')

  _reiniciar()
  programacaoRecebida(respostaBoa())
  itemNoAr(null, { total: 0, temProgramacao: true })
  assert.equal(snapshot().estado, 'INSTITUCIONAL')

  _reiniciar()
  programacaoRecebida(respostaBoa())
  falhou(FALHAS.VIDEO_TRAVOU, { tipo: 'VIDEO', id: 44, versao: 3 })
  itemNoAr(null, { total: 0, temProgramacao: true })
  assert.equal(snapshot().estado, 'FALHA_TOTAL')
})

test('o subestado do vídeo some ao sair do vídeo', () => {
  _reiniciar()
  programacaoRecebida(respostaBoa())
  itemNoAr({ tipo: 'video', id: 44, arquivoVersao: 1 }, { total: 2, temProgramacao: true })
  videoNoEstado('PLAYING')
  assert.deepEqual(snapshot().video, { estado: 'PLAYING' })
  videoNoEstado('BUFFERING')
  assert.deepEqual(snapshot().video, { estado: 'BUFFERING' })
  videoNoEstado('SEEKING')
  assert.equal(snapshot().video, null, 'subestado desconhecido não viaja')

  videoNoEstado('PLAYING')
  itemNoAr({ tipo: 'imagem', id: 7, imagemVersao: 1 }, { total: 2, temProgramacao: true })
  assert.equal(snapshot().video, null, 'uma arte não tem estado de vídeo')
})

test('🔴 a falha viaja como DURAÇÃO — nunca a hora da TV', () => {
  _reiniciar()
  falhou(FALHAS.VIDEO_TRAVOU, { tipo: 'VIDEO', id: 31, versao: 2 })
  const u = snapshot().falhas.ultima
  assert.equal(u.codigo, 'VIDEO_STALL')
  assert.equal(u.id, 31)
  assert.equal(typeof u.haSegundos, 'number')
  assert.ok(u.haSegundos >= 0)
  assert.equal('em' in u, false)
  assert.equal('timestamp' in u, false)
})

test('código de falha inventado é ignorado, e o contador não sobe', () => {
  _reiniciar()
  falhou('QUALQUER_COISA')
  falhou('')
  falhou(undefined)
  const s = snapshot()
  assert.equal(s.falhas.totalSessao, 0)
  assert.equal(s.falhas.ultima, null)
})

test('o contador conta a SESSÃO, e a última falha é a mais recente', () => {
  _reiniciar()
  falhou(FALHAS.IMAGEM, { tipo: 'IMAGEM', id: 1 })
  falhou(FALHAS.VIDEO_AUTOPLAY, { tipo: 'VIDEO', id: 2 })
  const s = snapshot()
  assert.equal(s.falhas.totalSessao, 2)
  assert.equal(s.falhas.ultima.codigo, 'VIDEO_PLAY_REJECTED')
})

test('uptime é monotônico e não depende do relógio absoluto', () => {
  _reiniciar()
  const s = snapshot()
  assert.equal(typeof s.uptimeSegundos, 'number')
  assert.ok(s.uptimeSegundos >= 0)
  // O módulo não lê `Date.now()` em lugar nenhum: um acerto de relógio na TV produziria
  // uptime negativo ou uma falha "do futuro".
})

test('🔴 o módulo não agenda, não pede e não fotografa nada', async () => {
  const fs = await import('node:fs')
  const fonte = fs.readFileSync(new URL('./tvTelemetria.js', import.meta.url), 'utf8')
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')
  for (const proibido of ['setInterval', 'setTimeout', 'fetch(', 'axios', 'canvas', 'toDataURL', 'captureStream', 'Date.now']) {
    assert.equal(codigo.includes(proibido), false, `telemetria não pode usar ${proibido}`)
  }
})

test('🔴 o snapshot é pequeno o bastante para viajar a cada 60 s, em centenas de TVs', () => {
  _reiniciar()
  programacaoRecebida(respostaBoa())
  itemNoAr({ tipo: 'video', id: 44, arquivoVersao: 3 }, { total: 4, temProgramacao: true })
  videoNoEstado('PLAYING')
  falhou(FALHAS.VIDEO_TRAVOU, { tipo: 'VIDEO', id: 31, versao: 2 })
  assert.ok(JSON.stringify(snapshot()).length < 700, 'o snapshot precisa continuar pequeno')
})
