// A régua do protocolo de escrita de vídeo — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/lib/respostaDeVideo.test.js
//
// Estes testes existem por causa de um bug de PRODUÇÃO, e o caso central é o primeiro com
// 🔴: o `POST /api/tv-indoor/videos` tomou 301 do Nginx para `/videos/`, o navegador
// converteu o POST em GET, voltou 200 com a LISTA — e a tela anunciou "Vídeo criado".
//
// O Nginx foi corrigido. Estes testes garantem que, se qualquer outro proxy, redirect ou
// página de erro devolver 200 com outro corpo, a tela reconheça e recuse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arquivoConfirmado, ehErroDeProtocolo, erroDeProtocolo, idDoVideoCriado } from './respostaDeVideo.js'

test('a criação devolve o id quando a resposta é mesmo a da criação', () => {
  assert.equal(idDoVideoCriado({ ok: true, video: { id: 7, nome: 'Institucional' } }), 7)
})

test('🔴 a resposta da LISTAGEM não é lida como criação', () => {
  // Exatamente o corpo que o 301 → GET devolveu. Se isto voltar a passar, a tela volta a
  // dizer "Vídeo criado" sem vídeo e sem arquivo.
  assert.equal(idDoVideoCriado({ videos: [{ id: 1 }, { id: 2 }], limites: {} }), null)
  assert.equal(idDoVideoCriado({ videos: [] }), null)
})

test('qualquer outro corpo também é recusado', () => {
  for (const ruim of [null, undefined, '', 'ok', 0, [], {}, { ok: true }, { video: null }, { video: {} }]) {
    assert.equal(idDoVideoCriado(ruim), null, `deveria recusar ${JSON.stringify(ruim)}`)
  }
})

test('id precisa ser NÚMERO inteiro positivo', () => {
  // "7" denuncia que quem respondeu não é a nossa rota. Aceitar por conveniência apagaria
  // o sinal justamente no caso em que ele importa.
  assert.equal(idDoVideoCriado({ video: { id: '7' } }), null)
  for (const ruim of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(idDoVideoCriado({ video: { id: ruim } }), null, `deveria recusar id ${ruim}`)
  }
})

test('o arquivo só é dado por enviado quando o DOMÍNIO confirma', () => {
  // `temArquivo` só é true com versão e storageKey no banco. É o domínio dizendo que o ciclo
  // fechou — não o HTTP dizendo que a conexão terminou.
  assert.equal(arquivoConfirmado({ ok: true, video: { id: 7, temArquivo: true } }), true)
  assert.equal(arquivoConfirmado({ ok: true, video: { id: 7, temArquivo: false } }), false)
  for (const ruim of [null, undefined, {}, { videos: [] }, { video: {} }]) {
    assert.equal(arquivoConfirmado(ruim), false)
  }
})

test('o erro de protocolo se identifica — e não se confunde com erro do servidor', () => {
  const e = erroDeProtocolo('criação')
  assert.equal(ehErroDeProtocolo(e), true)
  assert.equal(e.protocolo, 'criação')
  // Um erro comum de rede/servidor NÃO pode cair no mesmo caminho: aquele se tenta de novo,
  // este não adianta repetir do mesmo jeito.
  assert.equal(ehErroDeProtocolo(new Error('Network Error')), false)
  assert.equal(ehErroDeProtocolo(undefined), false)
})
