// Aparência do canal Totem — testes puros (node --test, ESM).
// Rodar: node --test backend/totemAparencia.test.js
//
// O que estes testes defendem: nada que não seja um hexadecimal reconhecido atravessa este
// módulo, o admin recebe RECUSA quando erra, e o totem NUNCA quebra por dado velho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ══ Operações de contrato (A3) ══════════════════════════════════════════════
import {
  PADROES, PADROES_POR_LAYOUT, POSICOES, POSICAO_PADRAO,
  LAYOUTS, LAYOUT_PADRAO, normalizarLayout, layoutEfetivo, lerCofre, tokensDoLayout,
  normalizarPosicao, posicaoEfetiva, validarPatch, aplicarPatch, coresEfetivas, aparenciaPublica,
} from './totemAparencia.js';

test('os padrões são as seis chaves, e batem com o que a folha desenha', () => {
  assert.deepEqual(Object.keys(PADROES).sort(), [...CHAVES].sort());
  assert.ok(Object.isFrozen(PADROES));
  // Estes seis também estão em frontend/src/styles/totem.css. Mudar um sem o outro faz a
  // tela de configuração mentir sobre o que o cliente está vendo.
  assert.deepEqual(PADROES, {
    fundo: '#0f0e0d', cartao: '#1e1b18', texto: '#ffffff',
    textoApoio: '#d79e00', acaoFundo: '#d79e00', acaoTexto: '#000000',
  });
  for (const v of Object.values(PADROES)) assert.equal(normalizarCor(v), v, 'padrão tem de ser hex canônico');
});

// ── Os dois fundos ────────────────────────────────────────────
test('cada fundo tem as SEIS chaves, em hex canônico', () => {
  assert.deepEqual([...LAYOUTS], ['PADRAO', 'CLARO']);
  assert.equal(LAYOUT_PADRAO, 'PADRAO');
  assert.equal(PADROES_POR_LAYOUT.PADRAO, PADROES, 'PADROES é atalho do fundo padrão');
  for (const l of LAYOUTS) {
    assert.deepEqual(Object.keys(PADROES_POR_LAYOUT[l]).sort(), [...CHAVES].sort(), l);
    assert.ok(Object.isFrozen(PADROES_POR_LAYOUT[l]), l);
    for (const v of Object.values(PADROES_POR_LAYOUT[l])) assert.equal(normalizarCor(v), v, l + ': hex canônico');
  }
});

test('🔴 a escada aponta para cima, e o chão não é preto puro', () => {
  /* Duas afirmações, e nenhuma delas é "contraste".

     A razão da WCAG NÃO serve para medir separação entre dois quase-pretos: o termo +0,05
     da fórmula domina, e #000 contra #131211 (o par antigo) dá 1,122 enquanto #0f0e0d
     contra #1e1b18 (o par novo) dá 1,125. Pelo número, nada mudou. A régua é para texto
     sobre fundo, e usá-la aqui produziria um teste que passa dizendo o que não sabe.

     O que a escada garante, e é o que se mede aqui:
       · o cartão é MAIS CLARO que o chão nos dois fundos — em tema escuro elevação é
         claridade, e no claro a mesma direção continua valendo;
       · o chão não é preto puro. Era ele o buraco: com #000 embaixo, quem separava o
         cartão do chão era a FOTOGRAFIA, e um produto sem foto virava um vazio na grade.

     O terceiro pedaço do desenho — o fio de 1px no cartão — mora na folha, porque não é
     cor de domínio: a loja não o configura. */
  const claridade = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  for (const l of LAYOUTS) {
    const { fundo, cartao } = PADROES_POR_LAYOUT[l];
    assert.ok(claridade(cartao) > claridade(fundo), l + ': o cartão tem de subir sobre o chão');
    assert.notEqual(fundo, '#000000', l + ': chão preto puro é o buraco que esta frente veio fechar');
  }
});

test('🔴 os cinco pares passam em AA nos DOIS fundos', () => {
  // Um fundo que sai da fábrica reprovando contraste é um fundo que não devia existir.
  for (const l of LAYOUTS) {
    for (const par of diagnosticoDeContraste(PADROES_POR_LAYOUT[l])) {
      assert.ok(par.medido, l + '/' + par.id + ': sem medida');
      assert.ok(par.aaNormal, l + '/' + par.id + ': ' + par.ratio + ':1 não passa em AA');
    }
  }
});

/* ── A GUARDA: a folha e o servidor têm de concordar ─────────────────────────
   Os seis valores de cada fundo existem em DOIS lugares: aqui, como "o padrão" que o
   admin mostra, e em `frontend/src/styles/totem.css`, como o que o quiosque desenha
   quando nada chega (bootstrap velho, rede caindo, aparência corrompida).

   O comentário do módulo sempre prometeu que havia teste para isso. Não havia — o que
   havia era um `deepEqual` contra valores digitados à mão, que concorda com ele mesmo.
   Mudar a folha sem mudar o módulo faz a tela de configuração MENTIR sobre o que o
   cliente está vendo, e nada acusaria. Este teste lê o CSS e compara.

   Ler um arquivo do frontend a partir de um teste do backend não cria dependência de
   runtime: nada aqui é importado pelo servidor. É uma guarda estática, do mesmo tipo das
   que leem `server.js` para conferir escopo por empresa. */
test('🔴 os padrões dos dois fundos batem, valor por valor, com a folha do quiosque', () => {
  // Normalizado: ver a nota em totem.tenant.test.js.
  const css = readFileSync(new URL('../frontend/src/styles/totem.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  // Chave de domínio → a custom property que a folha usa. É o MESMO mapa de
  // `frontend/src/components/totemTema.js`, repetido aqui de propósito: se um dia ele
  // mudar de um lado só, este teste é que vai contar.
  const PROP = {
    fundo: '--tq-fundo',
    cartao: '--tq-superficie',
    texto: '--ds-texto',
    textoApoio: '--ds-texto-apoio',
    acaoFundo: '--ds-botao-fundo',
    acaoTexto: '--ds-botao-texto',
  };

  // O bloco que vale para cada fundo: a raiz para o padrão, `[data-fundo='claro']` para o
  // claro. Recortar o bloco antes de procurar evita casar com a declaração do outro.
  const bloco = (abre) => {
    const i = css.indexOf(abre);
    assert.notEqual(i, -1, `bloco ausente na folha: ${abre}`);
    const fim = css.indexOf('\n}', i);
    assert.notEqual(fim, -1, `bloco sem fecho: ${abre}`);
    return css.slice(i, fim);
  };

  const declarado = (trecho, prop) => {
    // A ÚLTIMA declaração é a que vale — a folha declara `--tq-lado-bg` duas vezes.
    const achados = [...trecho.matchAll(new RegExp(`${prop}:\\s*([^;]+);`, 'g'))];
    return achados.length ? achados[achados.length - 1][1].trim() : null;
  };

  const blocos = {
    PADRAO: bloco('.tq-raiz {'),
    CLARO: bloco(".tq-raiz[data-fundo='claro'] {"),
  };

  for (const layout of LAYOUTS) {
    for (const [chave, prop] of Object.entries(PROP)) {
      const naFolha = declarado(blocos[layout], prop);
      // O fundo claro só redefine o que MUDA; o que ele não declara vem da raiz.
      const valor = naFolha ?? declarado(blocos.PADRAO, prop);
      assert.equal(
        valor, PADROES_POR_LAYOUT[layout][chave],
        `${layout}.${chave}: a folha diz ${valor} e o módulo diz ${PADROES_POR_LAYOUT[layout][chave]}`,
      );
    }
  }

  // E a tinta-base, que é o que faz os dezessete brancos-com-alfa virarem de lado.
  assert.equal(declarado(blocos.PADRAO, '--tq-tinta-base'), '255, 255, 255');
  assert.equal(declarado(blocos.CLARO, '--tq-tinta-base'), '26, 23, 20');
});

test('fundo inválido cai no padrão, nunca derruba a tela', () => {
  assert.equal(normalizarLayout('CLARO'), 'CLARO');
  assert.equal(normalizarLayout('claro'), null, 'não normaliza caixa: vem de um seletor');
  for (const v of [null, undefined, '', 'ESCURO', 3, {}, []]) {
    assert.equal(normalizarLayout(v), null, String(v));
    assert.equal(layoutEfetivo(v), 'PADRAO', String(v));
  }
});

// ── O cofre: um conjunto de overrides por fundo ────────────────────────
test('🔴 formato ANTIGO (objeto plano) é lido como o conjunto do fundo padrão', () => {
  // É o que dispensa migração de dado: quem já configurou continua valendo, no fundo em
  // que aquelas cores sempre foram escolhidas.
  const antigo = { fundo: '#111111', texto: '#eeeeee' };
  assert.deepEqual(lerCofre(antigo), { PADRAO: antigo, CLARO: {} });
  assert.deepEqual(tokensDoLayout(antigo, 'PADRAO'), antigo);
  assert.deepEqual(tokensDoLayout(antigo, 'CLARO'), {}, 'o claro nasce limpo');
});

test('o cofre novo mantém os dois conjuntos separados', () => {
  const cofre = { PADRAO: { fundo: '#111111' }, CLARO: { fundo: '#f0f0f0' } };
  assert.deepEqual(tokensDoLayout(cofre, 'PADRAO'), { fundo: '#111111' });
  assert.deepEqual(tokensDoLayout(cofre, 'CLARO'), { fundo: '#f0f0f0' });
  assert.equal(coresEfetivas(cofre, 'PADRAO').fundo, '#111111');
  assert.equal(coresEfetivas(cofre, 'CLARO').fundo, '#f0f0f0');
  assert.equal(coresEfetivas(cofre, 'CLARO').texto, PADROES_POR_LAYOUT.CLARO.texto,
    'o que não tem override vem do padrão DAQUELE fundo');
});

test('cofre torto: cada conjunto é saneado por si, e o resto sobrevive', () => {
  const podre = { PADRAO: { fundo: '#111111', borda: '#fff' }, CLARO: 'não é objeto', LIXO: { fundo: '#000' } };
  assert.deepEqual(lerCofre(podre), { PADRAO: { fundo: '#111111' }, CLARO: {} });
  for (const v of [null, undefined, 42, 'texto', []]) {
    assert.deepEqual(lerCofre(v), { PADRAO: {}, CLARO: {} }, String(v));
  }
});

test('🔴 gravar num fundo não encosta no outro', () => {
  const cofre = { PADRAO: { fundo: '#111111' }, CLARO: { fundo: '#f0f0f0' } };
  const novo = aplicarPatch(cofre, validarPatch({ texto: '#00ff00' }), 'CLARO');
  assert.deepEqual(novo.PADRAO, { fundo: '#111111' }, 'o fundo padrão fica intocado');
  assert.deepEqual(novo.CLARO, { fundo: '#f0f0f0', texto: '#00ff00' });
});

test('🔴 instalação sem configuração = a aparência de hoje, idêntica', () => {
  assert.deepEqual(coresEfetivas(null), PADROES);
  assert.deepEqual(coresEfetivas(undefined), PADROES);
  assert.deepEqual(coresEfetivas({}), PADROES);
  const pub = aparenciaPublica({});
  assert.deepEqual(pub.tokens, {}, 'nenhum override viaja');
  assert.equal(pub.posicaoCategorias, 'esquerda');
  assert.equal(pub.temLogoPersonalizada, false);
  assert.equal(pub.logoVersao, 0);
});

// -- posição -----------------------------------------------------------------
test('só esquerda e direita', () => {
  assert.deepEqual(POSICOES, ['esquerda', 'direita']);
  assert.equal(POSICAO_PADRAO, 'esquerda');
  assert.equal(normalizarPosicao('direita'), 'direita');
  for (const v of ['topo', 'Direita', 'DIREITA', ' direita', '', null, undefined, 0, {}]) {
    assert.equal(normalizarPosicao(v), null, `aceitou ${String(v)}`);
  }
});

test('🔴 override do APARELHO vence o padrão da loja', () => {
  assert.equal(posicaoEfetiva({ override: 'direita', padrao: 'esquerda' }), 'direita');
  assert.equal(posicaoEfetiva({ override: 'esquerda', padrao: 'direita' }), 'esquerda');
  assert.equal(posicaoEfetiva({ override: null, padrao: 'direita' }), 'direita');
  assert.equal(posicaoEfetiva({ padrao: 'direita' }), 'direita');
  // Cada degrau é sanitizado: lixo guardado cai para o degrau seguinte.
  assert.equal(posicaoEfetiva({ override: 'topo', padrao: 'direita' }), 'direita');
  assert.equal(posicaoEfetiva({ override: 'topo', padrao: 'topo' }), 'esquerda');
  assert.equal(posicaoEfetiva(), 'esquerda');
});

// -- patch -------------------------------------------------------------------
test('🔴 null REMOVE o override — e continua não sendo cor válida', () => {
  const p = validarPatch({ fundo: null });
  assert.equal(p.ok, true);
  assert.deepEqual(p.remover, ['fundo']);
  assert.deepEqual(p.definir, {});
  // A camada de cor não mudou: para ela, null segue sendo inválido.
  assert.equal(normalizarCor(null), null);
  assert.equal(validarEntrada({ fundo: null }).ok, false);
});

test('🔴 chave omitida não é tocada — PUT parcial não apaga o resto', () => {
  const guardados = { fundo: '#111111', texto: '#eeeeee', acaoFundo: '#f9d900' };
  const novo = aplicarPatch(guardados, validarPatch({ texto: '#ffffff' }));
  assert.deepEqual(novo.PADRAO, { fundo: '#111111', texto: '#ffffff', acaoFundo: '#f9d900' });
});

test('🔴 remover tira a chave do objeto, não guarda null', () => {
  const novo = aplicarPatch({ fundo: '#111111', texto: '#eeeeee' }, validarPatch({ fundo: null }));
  assert.deepEqual(novo.PADRAO, { texto: '#eeeeee' });
  assert.equal('fundo' in novo.PADRAO, false, 'override removido some do objeto');
  assert.equal(coresEfetivas(novo).fundo, PADROES.fundo, 'e a cor volta ao padrão');
});

test('patch mistura definir, remover e erro na mesma chamada', () => {
  const p = validarPatch({ fundo: '#FFF', cartao: null, texto: 'branco', borda: '#000' });
  assert.equal(p.ok, false);
  assert.deepEqual(p.definir, { fundo: '#ffffff' });
  assert.deepEqual(p.remover, ['cartao']);
  assert.deepEqual(p.erros, [{ chave: 'texto', motivo: MOTIVO_COR }, { chave: 'borda', motivo: MOTIVO_CHAVE }]);
});

test('🔴 remover chave desconhecida é erro, não silêncio', () => {
  const p = validarPatch({ borda: null });
  assert.equal(p.ok, false);
  assert.deepEqual(p.erros, [{ chave: 'borda', motivo: MOTIVO_CHAVE }]);
  assert.deepEqual(p.remover, []);
});

test('patch de corpo que não é objeto é recusado inteiro', () => {
  for (const v of [null, 'x', 3, []]) {
    const p = validarPatch(v);
    assert.equal(p.ok, false);
    assert.deepEqual(p.erros, [{ chave: null, motivo: MOTIVO_FORMATO }]);
  }
});

// -- overrides esparsos e dado corrompido ------------------------------------
test('🔴 overrides ESPARSOS: uma cor trocada, cinco no padrão', () => {
  const efetivas = coresEfetivas({ acaoFundo: '#ff0000' });
  assert.equal(efetivas.acaoFundo, '#ff0000');
  assert.equal(efetivas.fundo, PADROES.fundo);
  assert.equal(Object.keys(efetivas).length, 6, 'sempre completo para a tela e o contraste');
});

test('🔴 dado persistido inválido degrada para o padrão', () => {
  const podre = { fundo: 'rgb(0,0,0)', cartao: null, borda: '#fff', texto: '#00ff00' };
  const efetivas = coresEfetivas(podre);
  assert.equal(efetivas.texto, '#00ff00', 'o que presta vale');
  assert.equal(efetivas.fundo, PADROES.fundo);
  assert.equal(efetivas.cartao, PADROES.cartao);
  assert.equal('borda' in efetivas, false, 'chave desconhecida não vira cor');
  assert.deepEqual(aparenciaPublica({ config: { tokens: podre } }).tokens, { texto: '#00ff00' });
});

// -- o bloco do bootstrap ----------------------------------------------------
test('🔴 a logo NUNCA vai no bootstrap', () => {
  const pub = aparenciaPublica({
    config: { logoDataUrl: 'data:image/png;base64,AAAA', logoVersao: 4, tokens: { fundo: '#111111' } },
  });
  assert.equal(pub.temLogoPersonalizada, true);
  assert.equal(pub.logoVersao, 4);
  const serializado = JSON.stringify(pub);
  assert.equal(serializado.includes('base64'), false, 'base64 no bootstrap é desperdício a cada 5 min');
  assert.equal(serializado.includes('data:image'), false);
  assert.equal('logoDataUrl' in pub, false);
});

test('bloco público tem só o que o quiosque desenha', () => {
  const pub = aparenciaPublica({ config: { tokens: { fundo: '#111111' }, posicaoCategoriasPadrao: 'direita' } });
  assert.deepEqual(Object.keys(pub).sort(), ['layoutFundo', 'logoVersao', 'posicaoCategorias', 'temLogoPersonalizada', 'tokens']);
  assert.equal(pub.posicaoCategorias, 'direita');
});

test('logoVersao torta vira 0', () => {
  for (const v of [null, undefined, '3', 3.5, NaN, {}]) {
    assert.equal(aparenciaPublica({ config: { logoVersao: v } }).logoVersao, 0, `versão ${String(v)}`);
  }
});

test('🔴 duas empresas não se misturam — cada bloco sai da sua config', () => {
  const a = aparenciaPublica({ config: { tokens: { fundo: '#aa0000' }, logoVersao: 1, logoDataUrl: 'data:image/png;base64,A' } });
  const b = aparenciaPublica({ config: { tokens: { fundo: '#0000bb' }, logoVersao: 7 } });
  assert.equal(a.tokens.fundo, '#aa0000');
  assert.equal(b.tokens.fundo, '#0000bb');
  assert.equal(a.temLogoPersonalizada, true);
  assert.equal(b.temLogoPersonalizada, false, 'versão igual não implica logo igual');
});

test('contraste AVISA mas não impede salvar', () => {
  const ilegivel = { texto: '#111111', fundo: '#000000' };
  assert.equal(validarPatch(ilegivel).ok, true, 'salvar é permitido');
  const d = diagnosticoDeContraste(coresEfetivas(ilegivel));
  assert.equal(d.find((p) => p.id === 'texto-fundo').aaNormal, false, 'e o diagnóstico reprova');
});

// ══ Logo do canal ═══════════════════════════════════════════════════════════
import { LOGO_MAX_BYTES, validarLogoDataUrl, decodificarDataUrl, proximaVersaoLogo } from './totemAparencia.js';

// Um PNG de 1×1 de verdade — 70 bytes.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const gerar = (tipo, bytes) => `data:${tipo};base64,${Buffer.alloc(bytes, 1).toString('base64')}`;

test('PNG real passa e decodifica com o tipo certo', () => {
  assert.equal(validarLogoDataUrl(PNG), null);
  const d = decodificarDataUrl(PNG);
  assert.equal(d.tipo, 'image/png');
  assert.equal(d.bytes.length, 70);
  assert.ok(Buffer.isBuffer(d.bytes));
});

test('🔴 a rota devolve o MIME declarado — png, jpeg e webp, e nada mais', () => {
  for (const tipo of ['image/png', 'image/jpeg', 'image/webp']) {
    const url = gerar(tipo, 32);
    assert.equal(validarLogoDataUrl(url), null, tipo);
    assert.equal(decodificarDataUrl(url).tipo, tipo);
  }
});

test('🔴 SVG, GIF e text/html não entram — SVG é documento, e documento carrega script', () => {
  for (const url of [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:application/pdf;base64,JVBERi0=',
  ]) {
    assert.equal(validarLogoDataUrl(url), 'LOGO_FORMATO', url.slice(0, 24));
    assert.equal(decodificarDataUrl(url), null);
  }
});

test('🔴 o tamanho REAL é conferido, não o cabeçalho', () => {
  // "data:image/png;base64," na frente de um megabyte continua sendo um megabyte.
  assert.equal(validarLogoDataUrl(gerar('image/png', LOGO_MAX_BYTES)), null, 'no limite passa');
  assert.equal(validarLogoDataUrl(gerar('image/png', LOGO_MAX_BYTES + 1)), 'LOGO_GRANDE');
  assert.equal(LOGO_MAX_BYTES, 307200, '300 KB: cabe com folga no 1 MB que o Nginx assume por padrão');
});

test('entrada torta é recusada com o código certo', () => {
  assert.equal(validarLogoDataUrl(undefined), 'LOGO_AUSENTE');
  assert.equal(validarLogoDataUrl(''), 'LOGO_AUSENTE');
  assert.equal(validarLogoDataUrl(42), 'LOGO_AUSENTE');
  assert.equal(validarLogoDataUrl('https://cdn/logo.png'), 'LOGO_FORMATO');
  assert.equal(validarLogoDataUrl('data:image/png;base64,'), 'LOGO_FORMATO');
});

test('🔴 leitura de dado corrompido não vira resposta com Content-Type inventado', () => {
  for (const v of [null, undefined, 'lixo', 'data:image/svg+xml;base64,AAA', {}]) {
    assert.equal(decodificarDataUrl(v), null, String(v));
  }
});

test('🔴 trocar a logo INCREMENTA a versão', () => {
  assert.equal(proximaVersaoLogo({ atual: 0, mudou: true }), 1);
  assert.equal(proximaVersaoLogo({ atual: 3, mudou: true }), 4);
});

test('🔴 remover a logo TAMBÉM incrementa', () => {
  // O tablet guarda a imagem por um ano, `immutable`. Sem subir a versão ele continuaria
  // servindo do cache uma logo que a loja acabou de tirar do ar.
  assert.equal(proximaVersaoLogo({ atual: 4, mudou: true }), 5);
});

test('reenviar a MESMA imagem não sobe versão', () => {
  // Subir à toa obrigaria todos os tablets a rebaixar o que já têm.
  assert.equal(proximaVersaoLogo({ atual: 4, mudou: false }), 4);
  assert.equal(proximaVersaoLogo({ atual: 0, mudou: false }), 0);
});

test('versão torta no banco vira 0 antes de somar', () => {
  for (const v of [null, undefined, '3', -2, 1.5, NaN, {}]) {
    assert.equal(proximaVersaoLogo({ atual: v, mudou: true }), 1, `atual=${String(v)}`);
  }
  assert.equal(proximaVersaoLogo(), 0);
});
