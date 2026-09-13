// Banners do Totem — testes puros (node --test, ESM).
// Rodar: node --test backend/totemBanner.test.js
//
// O que estes testes defendem: a agenda da loja acerta a hora mesmo com o relógio do
// tablet errado, arte que não é arte não entra, e nenhum byte viaja no bootstrap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACAO_PADRAO, DURACAO_MIN, DURACAO_MAX, IMAGEM_MAX_BYTES,
  MOTIVO_NOME, MOTIVO_DURACAO, MOTIVO_DATA, MOTIVO_JANELA,
  normalizarDuracao, instante, janelaValida, elegivel, elegiveis, statusDoBanner,
  validarEntrada, conferirJanela, lerImagem, tipoReal, proximaVersaoImagem,
  bannerParaAdmin, bannersPublicos,
} from './totemBanner.js';

const T = (iso) => new Date(iso).getTime();
const AGORA = T('2026-09-13T15:00:00.000Z');
const banner = (extra = {}) => ({ id: 1, nome: 'Promo', ativo: true, ordem: 0, duracaoSegundos: 6, inicioEm: null, fimEm: null, imagemVersao: 1, ...extra });

// PNG e JPEG de verdade — assinatura real, não texto.
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 7)]);
const JPEG = `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`;
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);
const WEBP = `data:image/webp;base64,${WEBP_BYTES.toString('base64')}`;

// ── duração ─────────────────────────────────────────────────────────────────
test('duração: padrão, faixa e grampeio na LEITURA', () => {
  assert.equal(DURACAO_PADRAO, 6);
  assert.equal(normalizarDuracao(undefined), 6);
  assert.equal(normalizarDuracao(10), 10);
  assert.equal(normalizarDuracao(6.4), 6);
  assert.equal(normalizarDuracao('8'), 8);
  // Piscar e parecer travado são os dois extremos que a faixa existe para impedir.
  assert.equal(normalizarDuracao(1), DURACAO_MIN);
  assert.equal(normalizarDuracao(0), DURACAO_MIN);
  assert.equal(normalizarDuracao(-5), DURACAO_MIN);
  assert.equal(normalizarDuracao(9999), DURACAO_MAX);
  for (const v of [null, '', 'abc', NaN, {}, []]) assert.equal(normalizarDuracao(v), DURACAO_PADRAO);
});

test('🔴 na ESCRITA a duração fora da faixa é RECUSADA, não grampeada', () => {
  // O gestor escolheu um número. Ele precisa saber que aquele número não vale, em vez de
  // descobrir depois que o totem está usando outro.
  assert.equal(validarEntrada({ duracaoSegundos: 1 }).ok, false);
  assert.equal(validarEntrada({ duracaoSegundos: 999 }).ok, false);
  assert.deepEqual(validarEntrada({ duracaoSegundos: 0 }).erros, [{ campo: 'duracaoSegundos', motivo: MOTIVO_DURACAO }]);
  assert.equal(validarEntrada({ duracaoSegundos: 8 }).dados.duracaoSegundos, 8);
});

// ── agenda ──────────────────────────────────────────────────────────────────
test('🔴 sem início e sem fim: elegível enquanto ativo', () => {
  assert.equal(elegivel(banner(), AGORA), true);
  assert.equal(elegivel(banner({ ativo: false }), AGORA), false);
});

test('🔴 agenda futura ainda não aparece', () => {
  const b = banner({ inicioEm: '2026-09-13T18:00:00.000Z' });
  assert.equal(elegivel(b, AGORA), false);
  assert.equal(elegivel(b, T('2026-09-13T18:00:00.000Z')), true, 'o início é inclusivo');
  assert.equal(statusDoBanner(b, AGORA), 'AGENDADO');
});

test('🔴 agenda expirada não aparece mais', () => {
  const b = banner({ fimEm: '2026-09-13T12:00:00.000Z' });
  assert.equal(elegivel(b, AGORA), false);
  assert.equal(statusDoBanner(b, AGORA), 'ENCERRADO');
  assert.equal(elegivel(b, T('2026-09-13T11:59:59.000Z')), true);
  assert.equal(elegivel(b, T('2026-09-13T12:00:00.000Z')), false, 'o fim é exclusivo');
});

test('janela dos dois lados', () => {
  const b = banner({ inicioEm: '2026-09-13T14:00:00.000Z', fimEm: '2026-09-13T16:00:00.000Z' });
  assert.equal(elegivel(b, AGORA), true);
  assert.equal(elegivel(b, T('2026-09-13T13:59:00.000Z')), false);
  assert.equal(elegivel(b, T('2026-09-13T16:00:01.000Z')), false);
  assert.equal(statusDoBanner(b, AGORA), 'ATIVO');
});

test('🔴 fim <= início é entrada inválida', () => {
  assert.equal(janelaValida({ inicioEm: '2026-09-13T16:00:00Z', fimEm: '2026-09-13T14:00:00Z' }), false);
  assert.equal(janelaValida({ inicioEm: '2026-09-13T16:00:00Z', fimEm: '2026-09-13T16:00:00Z' }), false);
  assert.equal(janelaValida({ inicioEm: '2026-09-13T14:00:00Z', fimEm: '2026-09-13T16:00:00Z' }), true);
  // Só um dos lados nunca é janela inválida.
  assert.equal(janelaValida({ inicioEm: '2026-09-13T16:00:00Z' }), true);
  assert.equal(janelaValida({}), true);
});

test('🔴 a janela é conferida contra o que JÁ ESTÁ salvo', () => {
  // Mandar só `fimEm` num banner que já tem `inicioEm` pode inverter a janela sem que o
  // corpo, sozinho, denuncie.
  const atual = { inicioEm: new Date('2026-09-13T16:00:00Z'), fimEm: null };
  const { dados } = validarEntrada({ fimEm: '2026-09-13T14:00:00Z' });
  assert.deepEqual(conferirJanela(dados, atual), { campo: 'fimEm', motivo: MOTIVO_JANELA });
  const ok = validarEntrada({ fimEm: '2026-09-13T18:00:00Z' });
  assert.equal(conferirJanela(ok.dados, atual), null);
});

test('data torta é recusada', () => {
  assert.deepEqual(validarEntrada({ inicioEm: 'ontem' }).erros, [{ campo: 'inicioEm', motivo: MOTIVO_DATA }]);
  assert.equal(instante('ontem'), null);
  assert.equal(instante(''), null);
  assert.equal(instante(null), null);
  // Limpar a agenda é explícito e válido.
  assert.equal(validarEntrada({ inicioEm: null }).dados.inicioEm, null);
  assert.equal(validarEntrada({ fimEm: '' }).dados.fimEm, null);
});

// ── ordenação ───────────────────────────────────────────────────────────────
test('elegíveis saem na ordem, e o empate desempata por id', () => {
  const lista = [
    banner({ id: 3, ordem: 1 }), banner({ id: 1, ordem: 0 }),
    banner({ id: 2, ordem: 0 }), banner({ id: 4, ordem: 2, ativo: false }),
  ];
  assert.deepEqual(elegiveis(lista, AGORA).map((b) => b.id), [1, 2, 3]);
  assert.deepEqual(elegiveis(null, AGORA), []);
});

// ── entrada ─────────────────────────────────────────────────────────────────
test('nome é obrigatório na criação e opcional na edição', () => {
  assert.deepEqual(validarEntrada({}, { exigirNome: true }).erros, [{ campo: 'nome', motivo: MOTIVO_NOME }]);
  assert.deepEqual(validarEntrada({ nome: '   ' }, { exigirNome: true }).erros, [{ campo: 'nome', motivo: MOTIVO_NOME }]);
  assert.equal(validarEntrada({}).ok, true, 'edição sem nome não exige nome');
  assert.equal(validarEntrada({ nome: '  Promo de terça  ' }).dados.nome, 'Promo de terça');
});

test('🔴 edição PARCIAL só devolve o que veio', () => {
  const r = validarEntrada({ ativo: false });
  assert.deepEqual(Object.keys(r.dados), ['ativo']);
  assert.equal(r.dados.ativo, false);
  // Nada de `nome: undefined` ou `duracaoSegundos: null` indo para o update e apagando o
  // que o gestor não mencionou.
  assert.deepEqual(Object.keys(validarEntrada({}).dados), []);
});

test('ativo só é true quando é exatamente true', () => {
  assert.equal(validarEntrada({ ativo: 'sim' }).dados.ativo, false);
  assert.equal(validarEntrada({ ativo: 1 }).dados.ativo, false);
  assert.equal(validarEntrada({ ativo: true }).dados.ativo, true);
});

// ── imagem ──────────────────────────────────────────────────────────────────
test('PNG, JPEG e WEBP reais passam, com o tipo lido dos BYTES', () => {
  for (const [url, tipo] of [[PNG, 'image/png'], [JPEG, 'image/jpeg'], [WEBP, 'image/webp']]) {
    const r = lerImagem(url);
    assert.equal(r.erro, undefined, `${tipo}: ${r.erro}`);
    assert.equal(r.tipo, tipo);
    assert.ok(Buffer.isBuffer(r.bytes));
  }
});

test('🔴 o MIME declarado NÃO é autoridade — vale a assinatura', () => {
  // Um arquivo qualquer renomeado chega com `image/png` no cabeçalho sem esforço nenhum.
  const mentira = `data:image/png;base64,${Buffer.from('isto nao e uma imagem, e texto puro').toString('base64')}`;
  assert.equal(lerImagem(mentira).erro, 'IMAGEM_FORMATO');
  // Declara png, os bytes são jpeg: recusado, senão serviríamos um Content-Type errado.
  const trocado = `data:image/png;base64,${JPEG_BYTES.toString('base64')}`;
  assert.equal(lerImagem(trocado).erro, 'IMAGEM_TIPO');
  assert.equal(tipoReal(Buffer.from('RIFFxxxxNOTWEBP')), null);
  assert.equal(tipoReal(Buffer.alloc(4)), null, 'curto demais para ter assinatura');
});

test('🔴 SVG e text/html não entram — SVG é documento, e documento carrega script', () => {
  assert.equal(lerImagem('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').erro, 'IMAGEM_FORMATO');
  assert.equal(lerImagem('data:text/html;base64,PHNjcmlwdD4=').erro, 'IMAGEM_FORMATO');
  assert.equal(lerImagem('data:image/gif;base64,R0lGODlhAQABAAAAACw=').erro, 'IMAGEM_FORMATO');
});

test('🔴 tamanho REAL, não o cabeçalho', () => {
  const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(IMAGEM_MAX_BYTES, 9)]);
  assert.equal(lerImagem(`data:image/jpeg;base64,${grande.toString('base64')}`).erro, 'IMAGEM_GRANDE');
  assert.equal(IMAGEM_MAX_BYTES, 716800, '700 KB: arte de tela cheia, ainda abaixo do 1 MB padrão do Nginx');
});

test('entrada ausente ou torta tem código próprio', () => {
  assert.equal(lerImagem(undefined).erro, 'IMAGEM_AUSENTE');
  assert.equal(lerImagem('').erro, 'IMAGEM_AUSENTE');
  assert.equal(lerImagem('https://cdn/x.png').erro, 'IMAGEM_FORMATO');
  assert.equal(lerImagem(42).erro, 'IMAGEM_AUSENTE');
});

test('🔴 substituir a arte incrementa a versão; editar nome NÃO', () => {
  assert.equal(proximaVersaoImagem(0), 1);
  assert.equal(proximaVersaoImagem(7), 8);
  for (const v of [null, undefined, '3', -1, 1.5]) assert.equal(proximaVersaoImagem(v), 1);
  // Editar nome/duração/agenda passa por validarEntrada, que não devolve imagemVersao.
  assert.equal('imagemVersao' in validarEntrada({ nome: 'Outro' }).dados, false);
});

// ── saídas ──────────────────────────────────────────────────────────────────
test('a linha do admin tem tamanho, mas não bytes', () => {
  const a = bannerParaAdmin(banner({ imagemBytes: 12345, imagemTipo: 'image/png' }), AGORA);
  assert.equal(a.imagemBytes, 12345);
  assert.equal(a.temImagem, true);
  assert.equal(a.status, 'ATIVO');
  assert.equal(a.imagemUrl, '/api/totem/banners/1/imagem?v=1');
  assert.equal(JSON.stringify(a).includes('base64'), false);
});

test('🔴 o bootstrap não carrega NENHUM byte', () => {
  const bloco = bannersPublicos([banner({ imagemBytes: 500000 })], AGORA);
  const s = JSON.stringify(bloco);
  assert.equal(s.includes('base64'), false);
  assert.equal(s.includes('data:image'), false);
  assert.equal(s.includes('dados'), false);
  assert.deepEqual(Object.keys(bloco.itens[0]).sort(),
    ['ativo', 'duracaoSegundos', 'fimEm', 'id', 'imagemUrl', 'imagemVersao', 'inicioEm', 'nome', 'ordem', 'tipo']);
});

test('🔴 agoraServidor viaja — é o que corrige o relógio do tablet', () => {
  const bloco = bannersPublicos([banner()], AGORA);
  assert.equal(bloco.agoraServidor, '2026-09-13T15:00:00.000Z');
  assert.equal(new Date(bloco.agoraServidor).getTime(), AGORA);
});

test('🔴 o AGENDADO viaja junto, para entrar na hora certa', () => {
  // Se o servidor filtrasse por janela, um banner das 18:00 só entraria no bootstrap
  // seguinte — às 18:04. Quem decide a elegibilidade temporal é o cliente.
  const futuro = banner({ id: 2, inicioEm: '2026-09-13T18:00:00.000Z' });
  const bloco = bannersPublicos([banner(), futuro], AGORA);
  assert.deepEqual(bloco.itens.map((b) => b.id), [1, 2]);
  assert.deepEqual(elegiveis(bloco.itens, AGORA).map((b) => b.id), [1], 'e o cliente filtra');
  assert.deepEqual(elegiveis(bloco.itens, T('2026-09-13T18:00:01Z')).map((b) => b.id), [1, 2]);
});

test('inativo e sem arte NÃO viajam', () => {
  const bloco = bannersPublicos([
    banner({ id: 1 }),
    banner({ id: 2, ativo: false }),
    banner({ id: 3, imagemVersao: 0 }),
  ], AGORA);
  assert.deepEqual(bloco.itens.map((b) => b.id), [1], 'banner sem arte existiria só para falhar');
});

test('🔴 empresa sem banners: bloco vazio, e o quiosque cai no fallback', () => {
  const bloco = bannersPublicos([], AGORA);
  assert.deepEqual(bloco.itens, []);
  assert.equal(typeof bloco.agoraServidor, 'string');
  assert.deepEqual(elegiveis(bloco.itens, AGORA), []);
  assert.deepEqual(bannersPublicos(null, AGORA).itens, []);
});

// ── tipo: capa × tela de espera ─────────────────────────────────────────────
import { TIPOS, TIPO_PADRAO, MEDIDAS, MOTIVO_TIPO, normalizarTipo } from './totemBanner.js';

test('dois tipos, e o padrão é o que já existia', () => {
  assert.deepEqual(TIPOS, ['ESPERA', 'CAPA']);
  // ESPERA é o default no banco: os banners cadastrados antes do tipo existir continuam
  // exatamente onde estavam.
  assert.equal(TIPO_PADRAO, 'ESPERA');
  assert.equal(normalizarTipo('CAPA'), 'CAPA');
  for (const v of ['capa', 'Capa', 'TOPO', '', null, undefined, 0, {}]) {
    assert.equal(normalizarTipo(v), null, `aceitou ${String(v)}`);
  }
});

test('cada tipo tem a sua medida recomendada', () => {
  // A espera é a tela inteira em retrato; a capa é a faixa entre a logo e o cancelar.
  assert.deepEqual(MEDIDAS.ESPERA, { largura: 1080, altura: 1920 });
  // 3:1 — a MESMA proporção da capa do Cardápio Web, para a loja reaproveitar a arte.
  assert.deepEqual(MEDIDAS.CAPA, { largura: 1200, altura: 400 });
  assert.equal(MEDIDAS.CAPA.largura / MEDIDAS.CAPA.altura, 3);
  for (const t of TIPOS) assert.ok(MEDIDAS[t], `${t} sem medida`);
});

test('🔴 tipo inválido na entrada é RECUSADO', () => {
  assert.equal(validarEntrada({ tipo: 'CAPA' }).dados.tipo, 'CAPA');
  const r = validarEntrada({ tipo: 'RODAPE' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros, [{ campo: 'tipo', motivo: MOTIVO_TIPO }]);
  // Omitir o tipo numa edição não o altera.
  assert.equal('tipo' in validarEntrada({ nome: 'x' }).dados, false);
});

test('🔴 o tipo viaja no bootstrap — o quiosque separa as listas com UMA régua', () => {
  const bloco = bannersPublicos([
    banner({ id: 1, tipo: 'ESPERA' }),
    banner({ id: 2, tipo: 'CAPA' }),
    banner({ id: 3 }),
  ], AGORA);
  assert.deepEqual(bloco.itens.map((b) => [b.id, b.tipo]), [[1, 'ESPERA'], [2, 'CAPA'], [3, 'ESPERA']]);
  // Linha antiga sem tipo lê como ESPERA, nunca como indefinida.
  assert.equal(bannerParaAdmin(banner({ tipo: undefined }), AGORA).tipo, 'ESPERA');
  assert.equal(bannerParaAdmin(banner({ tipo: 'lixo' }), AGORA).tipo, 'ESPERA');
});
