// Aparência do canal Totem — testes puros (node --test, ESM).
// Rodar: node --test backend/totemAparencia.test.js
//
// O que estes testes defendem: nada que não seja um hexadecimal reconhecido atravessa este
// módulo, o admin recebe RECUSA quando erra, e o totem NUNCA quebra por dado velho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAVES, PARES, AA_NORMAL, AA_GRANDE, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO,
  normalizarCor, validarEntrada, sanitizarTokens, contraste, diagnosticoDeContraste,
} from './totemAparencia.js';

const PALETA = {
  fundo: '#000000', cartao: '#131211', texto: '#ffffff',
  textoApoio: '#d79e00', acaoFundo: '#d79e00', acaoTexto: '#000000',
};

// ── as chaves ───────────────────────────────────────────────────────────────
test('seis chaves de DOMÍNIO, e nenhuma delas é nome de CSS', () => {
  assert.deepEqual(CHAVES, ['fundo', 'cartao', 'texto', 'textoApoio', 'acaoFundo', 'acaoTexto']);
  assert.ok(Object.isFrozen(CHAVES));
  // O banco não pode conhecer custom property: no dia em que a folha renomear um token,
  // a configuração de todas as lojas continuaria falando o nome antigo.
  for (const c of CHAVES) assert.ok(!c.startsWith('--'), `${c} parece nome de CSS`);
});

// ── normalizarCor ───────────────────────────────────────────────────────────
test('#fff vira #ffffff', () => {
  assert.equal(normalizarCor('#fff'), '#ffffff');
  assert.equal(normalizarCor('#000'), '#000000');
  assert.equal(normalizarCor('#f90'), '#ff9900');
});

test('caixa é normalizada para minúscula', () => {
  assert.equal(normalizarCor('#F9D900'), '#f9d900');
  assert.equal(normalizarCor('#ABC'), '#aabbcc');
  assert.equal(normalizarCor('#AbCdEf'), '#abcdef');
});

test('espaço em volta é tolerado — é campo de formulário, e guia de marca cola com espaço', () => {
  assert.equal(normalizarCor('  #f9d900  '), '#f9d900');
  assert.equal(normalizarCor('\t#FFF\n'), '#ffffff');
});

test('🔴 hexadecimal inválido é null', () => {
  for (const v of ['#', '#f', '#ff', '#fffff', '#fffffff', '#gggggg', '#12345g', 'f9d900', '##fff']) {
    assert.equal(normalizarCor(v), null, `aceitou ${v}`);
  }
});

test('🔴 alpha é recusado — não dá para medir contraste de cor semitransparente', () => {
  assert.equal(normalizarCor('#ffff'), null);
  assert.equal(normalizarCor('#ffffffff'), null);
  assert.equal(normalizarCor('#f9d900cc'), null);
});

test('🔴 nada que o navegador interprete entra: var, url, rgb, hsl, ; e }', () => {
  // Estes não são rejeitados por lista de proibidos — eles simplesmente não casam com a
  // regex de hex. Lista de proibidos é a defesa que esquece um caso.
  const perigosos = [
    'var(--ds-fundo)', 'url(x)', 'url(javascript:alert(1))',
    'rgb(255,0,0)', 'rgba(0,0,0,.5)', 'hsl(0 100% 50%)',
    '#fff;', '#fff}', '#fff; }', 'red', 'transparent', 'currentColor', 'inherit',
    '#fff !important', 'expression(1)', '</style>', '#fff\\3b',
  ];
  for (const v of perigosos) assert.equal(normalizarCor(v), null, `aceitou ${v}`);
});

test('valor não-string é null', () => {
  for (const v of [undefined, null, 0, 16777215, true, {}, [], ['#fff'], () => '#fff']) {
    assert.equal(normalizarCor(v), null, `aceitou ${String(v)}`);
  }
});

// ── validarEntrada: RIGOR ───────────────────────────────────────────────────
test('paleta inteira e válida passa, normalizada', () => {
  const r = validarEntrada({ ...PALETA, texto: '#FFF' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erros, []);
  assert.equal(r.tokens.texto, '#ffffff');
  assert.deepEqual(Object.keys(r.tokens).sort(), [...CHAVES].sort());
});

test('objeto PARCIAL é válido — mexer numa cor não obriga a reenviar as seis', () => {
  const r = validarEntrada({ acaoFundo: '#f9d900' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens, { acaoFundo: '#f9d900' });
});

test('🔴 chave desconhecida é ERRO na entrada, não descarte silencioso', () => {
  // O gestor que digitou errado tem de ver recusa. Sumir com o campo e responder "salvo"
  // é a mentira que o suporte descobre três semanas depois.
  const r = validarEntrada({ fundo: '#000', borda: '#fff' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros, [{ chave: 'borda', motivo: MOTIVO_CHAVE }]);
  // O que era válido continua normalizado — a tela pode remarcar só o campo errado.
  assert.deepEqual(r.tokens, { fundo: '#000000' });
});

test('🔴 valor inválido é ERRO na entrada', () => {
  const r = validarEntrada({ fundo: 'vermelho', texto: '#fff', cartao: null });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros, [{ chave: 'fundo', motivo: MOTIVO_COR }, { chave: 'cartao', motivo: MOTIVO_COR }]);
  assert.deepEqual(r.tokens, { texto: '#ffffff' });
});

test('objeto vazio: válido e sem nada para gravar', () => {
  const r = validarEntrada({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens, {});
  assert.deepEqual(r.erros, []);
});

test('🔴 corpo que não é objeto é recusado inteiro', () => {
  for (const v of [null, undefined, 'fundo=#fff', 42, [], [{ fundo: '#fff' }], true]) {
    const r = validarEntrada(v);
    assert.equal(r.ok, false, `aceitou ${String(v)}`);
    assert.deepEqual(r.erros, [{ chave: null, motivo: MOTIVO_FORMATO }]);
    assert.deepEqual(r.tokens, {});
  }
});

// ── sanitizarTokens: TOLERÂNCIA ─────────────────────────────────────────────
test('🔴 chave desconhecida guardada é IGNORADA na leitura', () => {
  // Dado de uma versão anterior, ou escrito à mão no banco. O totem não pode quebrar por
  // isso — cai no padrão da folha e a loja continua vendendo.
  const r = sanitizarTokens({ fundo: '#000', borda: '#fff', '--ds-fundo': '#111' });
  assert.deepEqual(r.tokens, { fundo: '#000000' });
  assert.deepEqual(r.ignoradas, [{ chave: 'borda', motivo: MOTIVO_CHAVE }, { chave: '--ds-fundo', motivo: MOTIVO_CHAVE }]);
});

test('🔴 valor inválido guardado é IGNORADO na leitura', () => {
  const r = sanitizarTokens({ fundo: 'rgb(0,0,0)', texto: '#FFF', cartao: 12 });
  assert.deepEqual(r.tokens, { texto: '#ffffff' });
  assert.deepEqual(r.ignoradas.map((i) => i.chave), ['fundo', 'cartao']);
});

test('🔴 leitura NUNCA lança e nunca devolve undefined', () => {
  for (const v of [null, undefined, 'lixo', 0, [], () => {}, { fundo: { r: 0 } }]) {
    const r = sanitizarTokens(v);
    assert.ok(r && typeof r.tokens === 'object', `quebrou em ${String(v)}`);
    assert.ok(Array.isArray(r.ignoradas));
  }
});

test('as duas responsabilidades divergem no mesmo dado — é o ponto delas', () => {
  const torto = { fundo: '#000', borda: '#fff' };
  assert.equal(validarEntrada(torto).ok, false, 'escrever: recusa');
  assert.deepEqual(sanitizarTokens(torto).tokens, { fundo: '#000000' }, 'ler: aproveita o que presta');
});

// ── contraste ───────────────────────────────────────────────────────────────
test('🔴 preto × branco = 21:1', () => {
  assert.equal(contraste('#000000', '#ffffff'), 21);
  assert.equal(contraste('#ffffff', '#000000'), 21, 'a fórmula é simétrica');
  assert.equal(contraste('#000', '#fff'), 21, 'forma curta dá o mesmo');
});

test('🔴 mesmo tom × mesmo tom = 1:1', () => {
  assert.equal(contraste('#131211', '#131211'), 1);
  assert.equal(contraste('#f9d900', '#F9D900'), 1);
});

test('a paleta real do Hamburgão bate com o que a spec documentou', () => {
  // Números da rev. 3 da spec do redesign: se algum destes mudar, ou a paleta mudou ou a
  // fórmula está errada. A spec escreve "8,8:1" com UMA casa; o valor exato é 8,78 — a
  // diferença é arredondamento de apresentação, não divergência de cálculo.
  assert.equal(contraste('#ffffff', '#000000'), 21);
  assert.equal(contraste('#d79e00', '#000000'), 8.78);
  assert.equal(contraste('#000000', '#d79e00'), 8.78);
});

test('cor inválida devolve null, nunca um número inventado', () => {
  // Um contraste falso é pior que contraste nenhum: ele passa no teste da tela.
  assert.equal(contraste('#fff', 'red'), null);
  assert.equal(contraste(null, '#fff'), null);
  assert.equal(contraste('#ffff', '#000'), null);
});

// ── limiares ────────────────────────────────────────────────────────────────
test('os limiares são os da WCAG', () => {
  assert.equal(AA_NORMAL, 4.5);
  assert.equal(AA_GRANDE, 3);
});

test('🔴 a aprovação sai da razão CRUA, não da arredondada', () => {
  // #767676 sobre branco dá 4,54: passa nos dois. #777777 dá 4,48 — arredondado para
  // exibição vira "4,48", mas o que não pode acontecer é um 4,4996 exibido como 4,5
  // passar num limiar de 4,5.
  const acima = diagnosticoDeContraste({ texto: '#767676', fundo: '#ffffff' })[0];
  assert.equal(acima.aaNormal, true);
  const abaixo = diagnosticoDeContraste({ texto: '#777777', fundo: '#ffffff' })[0];
  assert.equal(abaixo.aaNormal, false);
  assert.equal(abaixo.aaGrande, true, 'reprova em normal e passa em grande — é o meio-termo');
});

// ── diagnóstico ─────────────────────────────────────────────────────────────
test('🔴 os cinco pares, sempre os cinco', () => {
  const d = diagnosticoDeContraste(PALETA);
  assert.deepEqual(d.map((x) => x.id), ['texto-fundo', 'texto-cartao', 'apoio-fundo', 'apoio-cartao', 'acao']);
  assert.deepEqual(PARES.map((p) => p.id), d.map((x) => x.id));
  for (const p of d) {
    assert.equal(typeof p.ratio, 'number');
    assert.equal(typeof p.aaNormal, 'boolean');
    assert.equal(typeof p.aaGrande, 'boolean');
    assert.equal(p.medido, true);
    assert.ok(p.rotulo.length > 0);
  }
});

test('a paleta real passa em tudo', () => {
  const d = diagnosticoDeContraste(PALETA);
  for (const p of d) assert.equal(p.aaNormal, true, `${p.rotulo} = ${p.ratio}`);
  assert.equal(d.find((p) => p.id === 'texto-fundo').ratio, 21);
  assert.equal(d.find((p) => p.id === 'acao').ratio, 8.78);
});

test('🔴 paleta meia-boca: o par sem medida APARECE, com ratio null', () => {
  // Sumir com a linha esconderia justamente o caso em que a loja preencheu metade.
  const d = diagnosticoDeContraste({ texto: '#ffffff', fundo: '#000000' });
  const medidos = d.filter((p) => p.medido);
  assert.deepEqual(medidos.map((p) => p.id), ['texto-fundo']);
  assert.equal(d.length, 5);
  for (const p of d.filter((x) => !x.medido)) {
    assert.equal(p.ratio, null);
    assert.equal(p.aaNormal, false, 'sem medida NÃO conta como aprovado');
    assert.equal(p.aaGrande, false);
  }
});

test('diagnóstico com lixo dentro não quebra e ignora o que não presta', () => {
  const d = diagnosticoDeContraste({ ...PALETA, texto: 'branco', borda: '#fff' });
  assert.equal(d.length, 5);
  assert.equal(d.find((p) => p.id === 'texto-fundo').medido, false);
  assert.equal(d.find((p) => p.id === 'acao').medido, true);
  assert.deepEqual(diagnosticoDeContraste(null).map((p) => p.medido), [false, false, false, false, false]);
});

test('uma paleta ilegível é DIAGNOSTICADA, não bloqueada — quem decide é a A6', () => {
  const d = diagnosticoDeContraste({ ...PALETA, texto: '#111111' });
  const parTextoFundo = d.find((p) => p.id === 'texto-fundo');
  assert.equal(parTextoFundo.medido, true, 'o módulo mediu');
  assert.equal(parTextoFundo.aaNormal, false, 'e reprovou');
  assert.ok(parTextoFundo.ratio < 1.3, `preto sobre preto: ${parTextoFundo.ratio}`);
  // Mas a paleta continua VÁLIDA para gravar: contraste não bloqueia nesta task.
  assert.equal(validarEntrada({ ...PALETA, texto: '#111111' }).ok, true);
});
