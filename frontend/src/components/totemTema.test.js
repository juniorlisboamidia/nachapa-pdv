// Adaptador domínio → CSS — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemTema.test.js
//
// O que estes testes defendem: só as SEIS propriedades conhecidas viram CSS, nada que o
// servidor mande por engano chega ao CSSOM, e uma instalação sem configuração desenha
// exatamente como sempre desenhou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPRIEDADES, propriedadesDe, urlDaLogo, posicaoDeCategorias } from './totemTema.js';

const PALETA = {
  fundo: '#000000', cartao: '#131211', texto: '#ffffff',
  textoApoio: '#d79e00', acaoFundo: '#d79e00', acaoTexto: '#000000',
};

// ── o mapa ──────────────────────────────────────────────────────────────────
test('seis chaves de domínio, seis custom properties, sem repetição', () => {
  assert.deepEqual(Object.keys(PROPRIEDADES), ['fundo', 'cartao', 'texto', 'textoApoio', 'acaoFundo', 'acaoTexto']);
  const props = Object.values(PROPRIEDADES);
  assert.equal(new Set(props).size, 6, 'duas chaves na mesma propriedade fariam uma sobrescrever a outra');
  for (const p of props) assert.ok(p.startsWith('--'), `${p} não é custom property`);
  assert.ok(Object.isFrozen(PROPRIEDADES));
});

test('cartao aponta para --tq-superficie, e não para --ds-cartao', () => {
  // O surface.card da marca é um marrom que lê como sujeira sob foto de comida (spec
  // §5.2). Quem desenha o cartão no quiosque é --tq-superficie.
  assert.equal(PROPRIEDADES.cartao, '--tq-superficie');
  assert.equal(PROPRIEDADES.fundo, '--tq-fundo');
  assert.equal(PROPRIEDADES.acaoFundo, '--ds-botao-fundo');
});

// ── o que vira CSS ──────────────────────────────────────────────────────────
test('a paleta inteira vira seis pares', () => {
  const pares = propriedadesDe(PALETA);
  assert.equal(pares.length, 6);
  assert.deepEqual(pares[0], ['--tq-fundo', '#000000']);
  assert.deepEqual(pares.find((p) => p[0] === '--tq-superficie'), ['--tq-superficie', '#131211']);
});

test('🔴 instalação sem configuração não escreve NADA — a folha manda', () => {
  for (const v of [undefined, null, {}, [], 'x', 0]) {
    assert.deepEqual(propriedadesDe(v), [], `entrada ${String(v)}`);
  }
});

test('override esparso escreve só o que veio', () => {
  assert.deepEqual(propriedadesDe({ acaoFundo: '#ff0000' }), [['--ds-botao-fundo', '#ff0000']]);
});

test('🔴 chave desconhecida NUNCA vira CSS', () => {
  // Nem uma inventada, nem uma que pareça nome de token. O mapa é a allowlist.
  const pares = propriedadesDe({
    fundo: '#111111', borda: '#ffffff', '--tq-fundo': '#00ff00',
    '--tq-superficie': '#00ff00', raio: '18px', fonte: 'Comic Sans',
  });
  assert.deepEqual(pares, [['--tq-fundo', '#111111']]);
});

test('🔴 valor que não é hex canônico é descartado no último portão', () => {
  // O servidor já normaliza. Este é o portão seguinte, e ele não confia no anterior.
  const pares = propriedadesDe({
    fundo: 'var(--x)', cartao: 'url(a)', texto: '#fff', textoApoio: 'red',
    acaoFundo: '#ffffff; color: red', acaoTexto: 12,
  });
  assert.deepEqual(pares, [], 'nem a forma curta #fff passa: aqui só o canônico de seis');
});

test('caixa e espaço são tolerados no valor', () => {
  assert.deepEqual(propriedadesDe({ fundo: '  #AABBCC ' }), [['--tq-fundo', '#aabbcc']]);
});

test('a ordem é a do mapa, não a do objeto que chegou', () => {
  const pares = propriedadesDe({ acaoTexto: '#000000', fundo: '#ffffff' });
  assert.deepEqual(pares.map((p) => p[0]), ['--tq-fundo', '--ds-botao-texto']);
});

// ── a logo ──────────────────────────────────────────────────────────────────
test('🔴 canal vence HUB', () => {
  const url = urlDaLogo({
    aparencia: { temLogoPersonalizada: true, logoVersao: 3 },
    loja: { logo: 'https://cdn.cw/logo.png' },
  });
  assert.equal(url, '/api/public/aparelho/totem/logo?v=3');
});

test('sem logo própria, cai na do HUB — o comportamento de hoje', () => {
  assert.equal(urlDaLogo({ aparencia: { temLogoPersonalizada: false }, loja: { logo: 'https://cdn.cw/logo.png' } }), 'https://cdn.cw/logo.png');
  assert.equal(urlDaLogo({ loja: { logo: 'https://cdn.cw/logo.png' } }), 'https://cdn.cw/logo.png');
  assert.equal(urlDaLogo({ loja: { logoDataUrl: 'data:image/png;base64,AA' } }), 'data:image/png;base64,AA');
});

test('sem logo nenhuma, null — a tela desenha a inicial', () => {
  assert.equal(urlDaLogo({}), null);
  assert.equal(urlDaLogo(), null);
  assert.equal(urlDaLogo({ aparencia: {}, loja: {} }), null);
});

test('a versão entra na URL para o cache do tablet cair sozinho', () => {
  assert.equal(urlDaLogo({ aparencia: { temLogoPersonalizada: true, logoVersao: 7 } }), '/api/public/aparelho/totem/logo?v=7');
  // Versão torta não quebra a URL.
  assert.equal(urlDaLogo({ aparencia: { temLogoPersonalizada: true, logoVersao: '7' } }), '/api/public/aparelho/totem/logo?v=0');
});

// ── posição ─────────────────────────────────────────────────────────────────
test('posição: direita quando pedida, esquerda em todo o resto', () => {
  assert.equal(posicaoDeCategorias({ posicaoCategorias: 'direita' }), 'direita');
  for (const v of [{ posicaoCategorias: 'esquerda' }, { posicaoCategorias: 'topo' }, {}, null, undefined]) {
    assert.equal(posicaoDeCategorias(v), 'esquerda', `${JSON.stringify(v)}`);
  }
});

// ── a cópia da fórmula, com fiador ──────────────────────────────────────────
import { razaoDeContraste, normalizarHex, AA_NORMAL, AA_GRANDE } from './totemTema.js';
import { contraste as contrasteOficial, AA_NORMAL as AA_N_BACK, AA_GRANDE as AA_G_BACK } from '../../../backend/totemAparencia.js';

test('🔴 a prévia calcula o MESMO contraste que o backend', () => {
  // A régua oficial é a do backend. Esta cópia existe porque a prévia recalcula a cada
  // toque no seletor. O teste é o fiador da duplicação: se uma mudar sem a outra, cai.
  const cores = ['#000000', '#ffffff', '#131211', '#d79e00', '#767676', '#777777', '#ff0000', '#0000ff'];
  for (const a of cores) {
    for (const b of cores) {
      const local = Math.round(razaoDeContraste(a, b) * 100) / 100;
      assert.equal(local, contrasteOficial(a, b), `${a} × ${b}`);
    }
  }
  assert.equal(AA_NORMAL, AA_N_BACK);
  assert.equal(AA_GRANDE, AA_G_BACK);
});

test('razão inválida é null, e a forma curta é aceita na prévia', () => {
  assert.equal(razaoDeContraste('#fff', 'red'), null);
  assert.equal(razaoDeContraste(null, '#fff'), null);
  assert.equal(Math.round(razaoDeContraste('#fff', '#000') * 100) / 100, 21);
  assert.equal(normalizarHex('#ABC'), '#aabbcc');
  assert.equal(normalizarHex('rgb(0,0,0)'), null);
});

// ── origem da logo: é ela que decide a apresentação ─────────────────────────
import { logoDoTotem } from './totemTema.js';

test('🔴 a logo do CANAL vem marcada como própria — e é o que tira a placa', () => {
  // A do canal foi preparada com transparência para o preto do totem; a do Cardápio Web
  // vem com o branco embutido no arquivo e precisa da placa. A tela não adivinha isso.
  const canal = logoDoTotem({ aparencia: { temLogoPersonalizada: true, logoVersao: 3 }, loja: { logo: 'https://cdn.cw/logo.png' } });
  assert.deepEqual(canal, { url: '/api/public/aparelho/totem/logo?v=3', propria: true });
});

test('🔴 a logo do HUB continua NÃO própria — o fallback legado mantém a placa', () => {
  assert.deepEqual(logoDoTotem({ loja: { logo: 'https://cdn.cw/logo.png' } }), { url: 'https://cdn.cw/logo.png', propria: false });
  assert.deepEqual(logoDoTotem({ aparencia: { temLogoPersonalizada: false }, loja: { logoDataUrl: 'data:image/png;base64,AA' } }),
    { url: 'data:image/png;base64,AA', propria: false });
});

test('sem logo nenhuma: url nula e não própria — a tela desenha a inicial', () => {
  assert.deepEqual(logoDoTotem({}), { url: null, propria: false });
  assert.deepEqual(logoDoTotem(), { url: null, propria: false });
});

test('🔴 urlDaLogo e logoDoTotem nunca discordam sobre qual logo está valendo', () => {
  // Uma é implementada sobre a outra justamente para isso: a precedência canal → HUB →
  // nada existe em UM lugar só.
  const casos = [
    { aparencia: { temLogoPersonalizada: true, logoVersao: 2 }, loja: { logo: 'hub.png' } },
    { aparencia: { temLogoPersonalizada: false }, loja: { logo: 'hub.png' } },
    { loja: { logoDataUrl: 'data:image/png;base64,AA' } },
    {}, undefined,
  ];
  for (const c of casos) assert.equal(urlDaLogo(c), logoDoTotem(c).url, JSON.stringify(c));
});
