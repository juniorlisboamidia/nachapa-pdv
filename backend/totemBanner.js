// Totem › Banners — módulo puro, testado em totemBanner.test.js.
//
// Domínio PRÓPRIO do canal. O módulo de Banner/Vídeo/Roleta do HUB entrou como referência
// de PRODUTO (o que um banner precisa ter: nome, ativo, ordem, agenda, prévia) e não como
// código: nenhum import, nenhuma FK, nenhuma chamada. O totem tem de abrir com o HUB fora
// do ar.
//
// Sem Prisma, sem Express, sem relógio interno — o instante ENTRA POR PARÂMETRO. É o mesmo
// contrato de `clientes/inadimplencia.js` no HUB, e existe porque um teste que lê
// `Date.now()` passa hoje e quebra sozinho daqui a duas semanas.
//
// ── SOBRE O RELÓGIO, que é a decisão menos óbvia daqui ────────────────────────────────
// Quem decide se um banner está no ar é o CLIENTE, não o servidor. Parece errado e não é:
// o bootstrap se refaz a cada 5 min, e um banner agendado para as 18:00 que só entrasse no
// próximo bootstrap estrearia às 18:04. O servidor manda os metadados e o instante DELE; o
// tablet calcula o desvio do próprio relógio e decide a cada segundo.
//
// O desvio importa: tablet Android sem rede erra a hora com frequência, e a agenda da loja
// não pode depender disso.

// ── O QUE SAIU DAQUI, E POR QUÊ ───────────────────────────────────────────────────────
// A validação de imagem (MIME real, teto de bytes, versão) e a régua de agenda (instante,
// janela, status) eram deste arquivo e viraram helpers TÉCNICOS — `midiaImagem.js` e
// `midiaAgenda.js` — quando o segundo canal (TV Indoor) precisou exatamente das mesmas
// garantias. Eles não sabem o que é banner nem o que é conteúdo, então compartilhá-los não
// cria dependência entre canais irmãos: o que é de PRODUTO (tipos, medidas, duração,
// `bannersPublicos`) continua inteiro aqui.
// As funções seguem exportadas com os mesmos nomes e o mesmo comportamento — quem importa
// deste módulo não muda uma linha.
import { lerImagem as lerImagemMidia, tipoReal, proximaVersaoImagem, IMAGEM_MAX_BYTES } from './midiaImagem.js';
import { instante, janelaValida, dentroDaJanela, statusDaJanela, duracaoNaFaixa } from './midiaAgenda.js';

export { tipoReal, proximaVersaoImagem, IMAGEM_MAX_BYTES, instante, janelaValida };

/* Duração de cada arte no carrossel.

   O piso não é gosto: abaixo de 3 s a troca vira piscada, e quem passa na frente não lê
   nada. O teto existe pelo lado oposto — 60 s parado com mais de um banner cadastrado faz
   o gestor achar que o carrossel travou e abrir chamado. */
export const DURACAO_PADRAO = 6;
export const DURACAO_MIN = 3;
export const DURACAO_MAX = 60;

export const NOME_MAX = 60;

/* Os dois lugares onde uma arte pode aparecer. São formatos diferentes — a espera é a tela
   inteira em retrato, a capa é uma faixa deitada no topo do catálogo — e por isso o tipo
   entra também na recomendação de tamanho que o admin mostra. */
/* Dois lugares onde uma arte da loja aparece, e cada um é um contrato diferente:

     ESPERA — o vidro inteiro, com o totem parado. Tocar começa uma sessão.
     CAPA   — a faixa entre a logo e o cancelar, no topo do catálogo. Não é tocável.

   A foto de fundo da VITRINE (a tela de espera padrão) NÃO é banner. Chegou a ser um
   terceiro tipo aqui por um dia, e saiu: banner é uma LISTA — várias artes, cada uma com
   agenda e rodízio —, e a vitrine tem uma foto só, que é o padrão da loja. Modelar o padrão
   como item de lista fazia o admin parecer que haveria vários fundos. Ela mora em
   Personalização, com bytes em tabela própria (`TotemEsperaFundo`). */
export const TIPOS = Object.freeze(['ESPERA', 'CAPA']);
export const TIPO_PADRAO = 'ESPERA';
export const MOTIVO_TIPO = 'TIPO_INVALIDO';

/* Proporção recomendada de cada um. A espera ocupa o vidro inteiro; a capa é a faixa entre
   a logo e o botão de cancelar.

   A CAPA é 3:1 de propósito, e não a medida que a faixa tem em pixels: é a MESMA proporção
   da capa do Cardápio Web (o HUB a renderiza em `aspect-[3/1]`, em
   `frontend/src/pages/CardapioWebCapas.jsx`). Com isso a loja desenha uma arte e usa nos
   dois lugares, sem recortar nada.

   No alvo em pé a faixa tem ~821px de largura (1080 menos a coluna de categorias), o que
   dá ~274px de altura a 3:1 — uma arte de 1200 × 400 cobre isso com sobra. */
export const MEDIDAS = Object.freeze({
  ESPERA: Object.freeze({ largura: 1080, altura: 1920 }),
  CAPA: Object.freeze({ largura: 1200, altura: 400 }),
});

export function normalizarTipo(valor) {
  return TIPOS.includes(valor) ? valor : null;
}

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_DURACAO = 'DURACAO_INVALIDA';
export const MOTIVO_DATA = 'DATA_INVALIDA';
export const MOTIVO_JANELA = 'JANELA_INVALIDA';

/* Inteiro dentro da faixa, com o padrão na dúvida. Grampeia em vez de recusar quando o
   valor é numérico: o campo é um seletor, e um número fora da faixa é engano — o totem
   precisa continuar com uma duração sensata em vez de nenhuma. */
export const normalizarDuracao = (valor) => duracaoNaFaixa(valor, { min: DURACAO_MIN, max: DURACAO_MAX, padrao: DURACAO_PADRAO });

/* `instante` e `janelaValida` vêm de `midiaAgenda.js` e são reexportados no topo: o
   contrato deste módulo não mudou, só o lugar onde a conta mora. */

/* Este banner está no ar AGORA?

   `agoraMs` entra por parâmetro — nunca `Date.now()` aqui dentro. Sem agenda, basta estar
   ativo. As bordas: o início é inclusivo e o fim é exclusivo, para um banner que termina
   às 18:00 não dividir esse segundo com o que começa às 18:00. */
export function elegivel(banner, agoraMs) {
  if (!banner || banner.ativo !== true) return false;
  return dentroDaJanela(banner, agoraMs);
}

/* Os banners que o carrossel deve girar, na ordem. Empate de `ordem` desempata por `id`,
   senão a sequência mudaria de execução para execução e ninguém entenderia por quê. */
export function elegiveis(lista, agoraMs) {
  const itens = Array.isArray(lista) ? lista.filter((b) => elegivel(b, agoraMs)) : [];
  return itens.slice().sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id));
}

/* O rótulo que o admin lê. Derivado, nunca guardado: um status em coluna envelhece sozinho
   e passa a mentir no minuto seguinte ao vencimento. */
export const statusDoBanner = (banner, agoraMs) => statusDaJanela(banner, agoraMs);

/* ── Entrada administrativa ─────────────────────────────────────────────────────────── */

/* Rigor ao escrever, como no resto do canal. Devolve `{ ok, dados, erros }` com só os
   campos PRESENTES no corpo — um PUT parcial não pode apagar o que não mencionou. */
export function validarEntrada(bruto, { exigirNome = false } = {}) {
  const erros = [];
  const dados = {};
  const corpo = (typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto)) ? bruto : {};

  if (corpo.nome !== undefined || exigirNome) {
    const nome = String(corpo.nome ?? '').trim().slice(0, NOME_MAX);
    if (!nome) erros.push({ campo: 'nome', motivo: MOTIVO_NOME });
    else dados.nome = nome;
  }
  if (corpo.ativo !== undefined) dados.ativo = corpo.ativo === true;
  if (corpo.tipo !== undefined) {
    const t = normalizarTipo(corpo.tipo);
    if (t === null) erros.push({ campo: 'tipo', motivo: MOTIVO_TIPO });
    else dados.tipo = t;
  }
  if (corpo.duracaoSegundos !== undefined) {
    const n = Number(corpo.duracaoSegundos);
    // Aqui é ESCRITA: fora da faixa é recusa, e não grampeio silencioso. O gestor escolheu
    // um número; ele precisa saber que aquele número não vale.
    if (!Number.isFinite(n) || Math.round(n) < DURACAO_MIN || Math.round(n) > DURACAO_MAX) {
      erros.push({ campo: 'duracaoSegundos', motivo: MOTIVO_DURACAO });
    } else dados.duracaoSegundos = Math.round(n);
  }
  for (const campo of ['inicioEm', 'fimEm']) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null || corpo[campo] === '') { dados[campo] = null; continue; }
    const ms = instante(corpo[campo]);
    if (ms === null) erros.push({ campo, motivo: MOTIVO_DATA });
    else dados[campo] = new Date(ms);
  }
  return { ok: erros.length === 0, dados, erros };
}

/* A janela conferida contra o que JÁ ESTÁ salvo, e não só contra o que veio no corpo:
   mandar só `fimEm` num banner que já tem `inicioEm` pode produzir uma janela invertida
   sem que o corpo, sozinho, denuncie. */
export function conferirJanela(dados, atual) {
  const inicioEm = 'inicioEm' in dados ? dados.inicioEm : atual?.inicioEm ?? null;
  const fimEm = 'fimEm' in dados ? dados.fimEm : atual?.fimEm ?? null;
  return janelaValida({ inicioEm, fimEm }) ? null : { campo: 'fimEm', motivo: MOTIVO_JANELA };
}

/* ── Imagem ─────────────────────────────────────────────────────────────────────────── */

/* A arte do banner: PNG/JPEG/WEBP até 700 KB, com o MIME lido dos BYTES (não do cabeçalho
   que o cliente escreve). A conta inteira mora em `midiaImagem.js` — aqui fica só o nome
   que o resto do totem já importa, e o teto, que é decisão de canal. */
export const lerImagem = (dataUrl) => lerImagemMidia(dataUrl, { maxBytes: IMAGEM_MAX_BYTES });

/* ── Saídas ─────────────────────────────────────────────────────────────────────────── */

/* A linha como o ADMIN a lê. Sem bytes: `imagemBytes` é o tamanho, para a tela informar
   sem carregar o blob. */
export function bannerParaAdmin(b, agoraMs) {
  return {
    id: b.id,
    nome: b.nome,
    tipo: normalizarTipo(b.tipo) ?? TIPO_PADRAO,
    ativo: b.ativo,
    ordem: b.ordem,
    duracaoSegundos: normalizarDuracao(b.duracaoSegundos),
    inicioEm: b.inicioEm ? new Date(b.inicioEm).toISOString() : null,
    fimEm: b.fimEm ? new Date(b.fimEm).toISOString() : null,
    imagemVersao: b.imagemVersao ?? 0,
    imagemTipo: b.imagemTipo ?? null,
    imagemBytes: b.imagemBytes ?? null,
    temImagem: (b.imagemVersao ?? 0) > 0,
    status: statusDoBanner(b, agoraMs),
    imagemUrl: `/api/totem/banners/${b.id}/imagem?v=${b.imagemVersao ?? 0}`,
  };
}

/* O bloco do bootstrap.

   `agoraServidor` é o que permite ao tablet corrigir o próprio relógio. Vão os banners
   ATIVOS, incluindo os agendados para o futuro: é assim que um banner das 18:00 entra às
   18:00 em vez de esperar o bootstrap seguinte. Quem decide a elegibilidade temporal é o
   cliente, com o tempo corrigido.

   Banner sem arte não viaja: ele existiria só para falhar no carregamento.

   Nenhum byte aqui. A URL é versionada, e o tablet busca a arte uma vez. */
export function bannersPublicos(lista, agoraMs) {
  const itens = (Array.isArray(lista) ? lista : [])
    .filter((b) => b?.ativo === true && (b.imagemVersao ?? 0) > 0)
    .slice()
    .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id))
    .map((b) => ({
      id: b.id,
      nome: b.nome,
      // O TIPO viaja: o quiosque separa as duas listas com a MESMA régua de
      // elegibilidade, em vez de manter duas.
      tipo: normalizarTipo(b.tipo) ?? TIPO_PADRAO,
      // Redundante à primeira vista — só ativo viaja — e é de propósito: com o campo
      // presente, `elegivel()` decide igual nos DOIS lados. Sem ele o quiosque precisaria
      // de uma segunda régua de elegibilidade, e duas réguas divergem.
      ativo: true,
      ordem: b.ordem,
      duracaoSegundos: normalizarDuracao(b.duracaoSegundos),
      inicioEm: b.inicioEm ? new Date(b.inicioEm).toISOString() : null,
      fimEm: b.fimEm ? new Date(b.fimEm).toISOString() : null,
      imagemVersao: b.imagemVersao ?? 0,
      imagemUrl: `/api/public/aparelho/totem/banner/${b.id}/imagem?v=${b.imagemVersao ?? 0}`,
    }));
  return { agoraServidor: new Date(agoraMs).toISOString(), itens };
}
