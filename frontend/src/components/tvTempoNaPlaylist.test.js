// TV Indoor › o tempo na tela é do ITEM da playlist — guardas estáticas.
// Rodar: node --test frontend/src/components/tvTempoNaPlaylist.test.js
//
// A régua em si (faixas por tipo, vídeo sem duração, o zero do `Number(null)`) tem teste de
// verdade no backend, em tvMenuBoard.test.js e tvIndoor.test.js. Aqui ficam as duas coisas
// que só existem na tela — e que quebram caladas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')
const playlists = semComentarios(ler('../pages/TvIndoorPlaylists.jsx'))
const conteudos = semComentarios(ler('../pages/TvIndoorConteudos.jsx'))

test('🔴 subir, descer ou adicionar NÃO zera os tempos que o gestor definiu', () => {
  /* O servidor apaga e recria as linhas da playlist a cada gravação — é o que torna a troca
     atômica para a TV. A consequência é que o que a tela não mandar deixa de existir.

     `itensAtuais()` é a função que remonta o corpo em TODA ação (mover, remover, adicionar).
     Se ela não levar a duração de cada item, mexer na ordem de qualquer coisa devolve a
     playlist inteira ao padrão — sem erro, sem aviso, e só perceptível na parede dias
     depois, quando alguém reparar que o cartaz voltou a passar rápido. */
  const i = playlists.indexOf('const itensAtuais = ()')
  assert.ok(i > 0, 'sumiu o itensAtuais')
  const corpo = playlists.slice(i, playlists.indexOf('const PREFIXO', i))
  assert.match(corpo, /typeof i\.duracaoSegundos === 'number'/)
  assert.match(corpo, /duracaoSegundos: i\.duracaoSegundos/)
  // E vídeo nunca leva: o servidor RECUSA duração em vídeo, e a gravação inteira falharia.
  assert.match(corpo, /i\.tipo !== 'VIDEO'/)
})

test('🔴 o campo grava ao SAIR, nunca a cada tecla', () => {
  // Cada gravação regrava a playlist inteira. Digitar "25" a cada tecla seriam duas idas ao
  // servidor — e a primeira ("2") com um valor que a régua recusa, estourando um erro na
  // cara de quem ainda está digitando.
  const i = playlists.indexOf('function TempoDoItem(')
  const corpo = playlists.slice(i, playlists.indexOf('function duracaoDoVideo', i))
  assert.match(corpo, /onBlur=\{confirmar\}/)
  assert.match(corpo, /onChange=\{\(e\) => setRascunho\(e\.target\.value\)\}/, 'digitar só mexe no rascunho')
  // Vazio é "voltar ao padrão", conferido ANTES do Number(): Number('') é 0.
  const vazio = corpo.indexOf("texto === ''")
  const numero = corpo.indexOf('Number(texto)')
  assert.ok(vazio > 0 && vazio < numero, 'o vazio tem de ser tratado antes da conversão')
})

test('🔴 editar uma arte NÃO mexe no tempo — o cadastro nem conhece mais o campo', () => {
  /* O tempo saiu do cadastro do conteúdo: é decisão da programação. Se o formulário
     voltasse a mandar `duracaoSegundos` (um default escondido, por exemplo), cada edição
     de NOME de uma arte regravaria o padrão dela — e mudaria o ritmo de toda playlist que
     usa essa arte sem tempo próprio. */
  assert.equal(/duracaoSegundos/.test(conteudos), false, 'o cadastro de conteúdo não pode conhecer a duração')
  assert.equal(/Tempo na tela/.test(conteudos), false)
})
