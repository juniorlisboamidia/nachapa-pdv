// Regra de custeio — testes puros (node --test, ESM).
// Rodar: node --test backend/produtos/custeio.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODOS_SOBREMESA, MODO_SOBREMESA_PADRAO, TIPOS_PRODUTO,
  custeioDoProduto, usaCustoDireto, usaFichaTecnica,
} from './custeio.js';

test('cada tipo antigo continua indo para o lado de sempre', () => {
  assert.equal(custeioDoProduto({ tipoProduto: 'PRODUTO' }), 'FICHA');
  assert.equal(custeioDoProduto({ tipoProduto: 'BEBIDA' }), 'DIRETO');
  assert.equal(custeioDoProduto({ tipoProduto: 'COMBO' }), 'COMBO');
});

test('sem tipo é produto — o default do banco', () => {
  assert.equal(custeioDoProduto({}), 'FICHA');
  assert.equal(custeioDoProduto(null), 'FICHA');
  assert.equal(custeioDoProduto(undefined), 'FICHA');
});

test('sobremesa vai para onde o modo mandar', () => {
  assert.equal(custeioDoProduto({ tipoProduto: 'SOBREMESA', sobremesaModo: 'FICHA' }), 'FICHA');
  assert.equal(custeioDoProduto({ tipoProduto: 'SOBREMESA', sobremesaModo: 'REVENDA' }), 'DIRETO');
});

test('🔴 modo perdido + custo de compra informado = DIRETO, nunca FICHA', () => {
  /* Este é o caso que faz precificar errado. Uma sobremesa revendida cujo modo se
     perdeu (linha antiga, escrita fora da API, import) cairia em FICHA, e como ela
     não tem ficha nenhuma o custo sairia R$ 0,00 — lucro inventado, e o erro se
     propaga para dentro dos combos que a usam.

     Entre subestimar e superestimar o custo, o lado seguro é o custo de compra que
     está escrito ali. */
  const orfa = { tipoProduto: 'SOBREMESA', custoDireto: 12.5 };
  assert.equal(custeioDoProduto({ ...orfa }), 'DIRETO');
  assert.equal(custeioDoProduto({ ...orfa, sobremesaModo: null }), 'DIRETO');
  assert.equal(custeioDoProduto({ ...orfa, sobremesaModo: '' }), 'DIRETO');
  assert.equal(custeioDoProduto({ ...orfa, sobremesaModo: 'QUALQUER_COISA' }), 'DIRETO');
});

test('🔴 custo de compra ZERO é um custo informado, não um campo vazio', () => {
  // `Number(null) === 0` já mordeu este projeto três vezes. Aqui a diferença entre
  // "não preenchido" e "preenchido com zero" decide o caminho inteiro, então a
  // checagem é por null/undefined — nunca por valor falsy.
  assert.equal(custeioDoProduto({ tipoProduto: 'SOBREMESA', custoDireto: 0 }), 'DIRETO');
  assert.equal(custeioDoProduto({ tipoProduto: 'SOBREMESA', custoDireto: null }), 'FICHA');
  assert.equal(custeioDoProduto({ tipoProduto: 'SOBREMESA' }), 'FICHA');
});

test('o modo só vale em sobremesa — pendurado em outro tipo, não muda nada', () => {
  // Um modo sobrando num produto comum (troca de tipo malfeita) não pode desviar o
  // custeio dele: quem manda é o tipo, o modo só desempata dentro da sobremesa.
  assert.equal(custeioDoProduto({ tipoProduto: 'PRODUTO', sobremesaModo: 'REVENDA' }), 'FICHA');
  assert.equal(custeioDoProduto({ tipoProduto: 'BEBIDA', sobremesaModo: 'FICHA' }), 'DIRETO');
  assert.equal(custeioDoProduto({ tipoProduto: 'COMBO', sobremesaModo: 'REVENDA' }), 'COMBO');
});

test('os atalhos dizem o mesmo que o helper', () => {
  const ficha = { tipoProduto: 'SOBREMESA', sobremesaModo: 'FICHA' };
  const revenda = { tipoProduto: 'SOBREMESA', sobremesaModo: 'REVENDA' };
  assert.equal(usaFichaTecnica(ficha), true);
  assert.equal(usaCustoDireto(ficha), false);
  assert.equal(usaCustoDireto(revenda), true);
  assert.equal(usaFichaTecnica(revenda), false);
  // Combo não é nenhum dos dois: quem pergunta "é ficha?" para um combo recebe não,
  // e quem pergunta "é direto?" também. O terceiro caminho é explícito de propósito.
  assert.equal(usaFichaTecnica({ tipoProduto: 'COMBO' }), false);
  assert.equal(usaCustoDireto({ tipoProduto: 'COMBO' }), false);
});

test('os catálogos são a fonte dos rótulos aceitos', () => {
  assert.deepEqual(TIPOS_PRODUTO, ['PRODUTO', 'BEBIDA', 'SOBREMESA', 'COMBO']);
  assert.deepEqual(MODOS_SOBREMESA, ['FICHA', 'REVENDA']);
  assert.ok(MODOS_SOBREMESA.includes(MODO_SOBREMESA_PADRAO));
});

test('🔴 o espelho do frontend é igual byte a byte', async () => {
  /* A regra vive nos dois lados porque o modal precisa decidir o que desenhar antes
     de salvar. Duas cópias que divergem custeiam diferente na tela e no banco — o
     usuário vê um lucro que o sistema não vai gravar. */
  const fs = await import('node:fs');
  const daqui = fs.readFileSync(new URL('./custeio.js', import.meta.url), 'utf8');
  const espelho = fs.readFileSync(
    new URL('../../frontend/src/utils/custeio.js', import.meta.url), 'utf8'
  );
  const semCabecalho = espelho.replace(/^\/\/ \(espelho de[^\n]*\n/, '');
  assert.equal(semCabecalho.replace(/\r\n/g, '\n'), daqui.replace(/\r\n/g, '\n'));
});

// ── Guardas do código que CONSOME a regra ────────────────────────────────────
// Lêem o server.js como texto. Não substituem um teste de integração, mas prendem
// exatamente as três regressões que custam dinheiro — e que já aconteceram no H360.
const servidor = async () => {
  const fs = await import('node:fs');
  return fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
};

test('🔴 o PUT parcial NUNCA rebaixa o modo salvo', async () => {
  /* `PUT {tipoProduto:'SOBREMESA'}` sem mandar o modo — o que qualquer tela que
     salva um campo só faz — jogaria uma sobremesa de revenda em FICHA. O custo de
     compra pararia de valer e ela passaria a custar R$ 0,00 dentro dos combos, sem
     erro nenhum na tela. O modo salvo é o piso. */
  const codigo = await servidor();
  assert.match(codigo, /data\.sobremesaModo = existing\.sobremesaModo \?\? MODO_SOBREMESA_PADRAO/);
  // E o campo só é zerado quando o tipo REALMENTE mudou para outra coisa.
  assert.match(codigo, /if \(data\.tipoProduto !== undefined\) data\.sobremesaModo = null/);
});

test('🔴 a cópia da ficha pergunta ao custeio, não ao tipo', async () => {
  // Duplicar uma sobremesa feita na casa tem que copiar a ficha dela. Com
  // `tipo === 'PRODUTO'` a cópia sairia sem ficha nenhuma — custo zero, calada.
  const codigo = await servidor();
  assert.match(codigo, /usaFichaTecnica\(original\) && original\.fichaTecnica\.length > 0/);
});

test('🔴 nenhum ponto de CUSTO decide por tipoProduto === BEBIDA', async () => {
  /* Esta é a guarda que vale para o próximo tipo, não só para a sobremesa: assim que
     alguém voltar a perguntar "é bebida?" para decidir custo, um item que custeia por
     compra mas não é bebida passa a valer R$ 0,00.

     Os `=== 'BEBIDA'` que SOBRAM de propósito são os de tipoBebidaAnalise
     (COMMODITY/AUTORAL), que são mesmo específicos de bebida. */
  const codigo = await servidor();
  const linhas = codigo.split('\n')
    .map((linha, i) => ({ n: i + 1, texto: linha }))
    .filter(({ texto }) => /=== 'BEBIDA'/.test(texto))
    .filter(({ texto }) => !/tipoBebidaAnalise/.test(texto));
  // As duas sobreviventes são o cabeçalho do bloco de tipoBebidaAnalise, que só é
  // legível olhando as linhas seguintes — por isso a exceção é por vizinhança.
  const suspeitas = linhas.filter(({ n }) =>
    !linhas_seguintes_falam_de_analise(codigo, n));
  assert.deepEqual(
    suspeitas.map((l) => `${l.n}: ${l.texto.trim()}`), [],
    'estes pontos voltaram a decidir por tipo — devem perguntar a custeioDoProduto()'
  );
});

// Uma linha `=== 'BEBIDA'` é aceitável quando o bloco que ela abre trata de
// tipoBebidaAnalise (a classificação commodity/autoral, que é mesmo só de bebida).
function linhas_seguintes_falam_de_analise(codigo, n) {
  const linhas = codigo.split('\n');
  return linhas.slice(n - 1, n + 4).some((l) => /tipoBebidaAnalise/.test(l));
}
