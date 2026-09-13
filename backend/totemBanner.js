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

/* Duração de cada arte no carrossel.

   O piso não é gosto: abaixo de 3 s a troca vira piscada, e quem passa na frente não lê
   nada. O teto existe pelo lado oposto — 60 s parado com mais de um banner cadastrado faz
   o gestor achar que o carrossel travou e abrir chamado. */
export const DURACAO_PADRAO = 6;
export const DURACAO_MIN = 3;
export const DURACAO_MAX = 60;

export const NOME_MAX = 60;

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_DURACAO = 'DURACAO_INVALIDA';
export const MOTIVO_DATA = 'DATA_INVALIDA';
export const MOTIVO_JANELA = 'JANELA_INVALIDA';

/* Inteiro dentro da faixa, com o padrão na dúvida. Grampeia em vez de recusar quando o
   valor é numérico: o campo é um seletor, e um número fora da faixa é engano — o totem
   precisa continuar com uma duração sensata em vez de nenhuma. */
export function normalizarDuracao(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return DURACAO_PADRAO;
  if (typeof valor === 'string' && valor.trim() === '') return DURACAO_PADRAO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return DURACAO_PADRAO;
  const i = Math.round(n);
  if (i < DURACAO_MIN) return DURACAO_MIN;
  if (i > DURACAO_MAX) return DURACAO_MAX;
  return i;
}

/* Texto ISO (ou Date) → milissegundos, ou `null`.

   Aceita só o que representa um instante ABSOLUTO. Não existe fuso por loja no PDV, e
   inventar um a partir do relógio do VPS faria a agenda de uma loja depender de onde o
   servidor está hospedado. O admin converte a hora local do navegador antes de mandar. */
export function instante(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/* A janela é coerente? `fim <= início` é entrada inválida: uma janela que fecha antes de
   abrir nunca exibiria o banner, e aceitar em silêncio deixaria o gestor esperando por
   uma arte que não vai aparecer nunca. */
export function janelaValida({ inicioEm, fimEm } = {}) {
  const i = instante(inicioEm);
  const f = instante(fimEm);
  if (i === null || f === null) return true;
  return f > i;
}

/* Este banner está no ar AGORA?

   `agoraMs` entra por parâmetro — nunca `Date.now()` aqui dentro. Sem agenda, basta estar
   ativo. As bordas: o início é inclusivo e o fim é exclusivo, para um banner que termina
   às 18:00 não dividir esse segundo com o que começa às 18:00. */
export function elegivel(banner, agoraMs) {
  if (!banner || banner.ativo !== true) return false;
  if (!Number.isFinite(agoraMs)) return false;
  const i = instante(banner.inicioEm);
  const f = instante(banner.fimEm);
  if (i !== null && agoraMs < i) return false;
  if (f !== null && agoraMs >= f) return false;
  return true;
}

/* Os banners que o carrossel deve girar, na ordem. Empate de `ordem` desempata por `id`,
   senão a sequência mudaria de execução para execução e ninguém entenderia por quê. */
export function elegiveis(lista, agoraMs) {
  const itens = Array.isArray(lista) ? lista.filter((b) => elegivel(b, agoraMs)) : [];
  return itens.slice().sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id));
}

/* O rótulo que o admin lê. Derivado, nunca guardado: um status em coluna envelhece sozinho
   e passa a mentir no minuto seguinte ao vencimento. */
export function statusDoBanner(banner, agoraMs) {
  if (!banner) return 'INATIVO';
  if (banner.ativo !== true) return 'INATIVO';
  const i = instante(banner.inicioEm);
  const f = instante(banner.fimEm);
  if (f !== null && Number.isFinite(agoraMs) && agoraMs >= f) return 'ENCERRADO';
  if (i !== null && Number.isFinite(agoraMs) && agoraMs < i) return 'AGENDADO';
  return 'ATIVO';
}

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

/* Arte de tela cheia em 1080 × 1920. Maior que a logo (300 KB) porque aqui a imagem É o
   conteúdo, e menor que o que o Nginx assume por padrão (1 MB) com folga para o resto do
   corpo. O cliente reduz antes de subir; isto é o teto do servidor. */
export const IMAGEM_MAX_BYTES = 700 * 1024;

const TIPOS = Object.freeze({ 'image/png': true, 'image/jpeg': true, 'image/webp': true });
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/* O tipo REAL, lido dos primeiros bytes.

   O `Content-Type` do data URL é texto que o cliente escreve, e um `.exe` renomeado chega
   com `image/png` no cabeçalho sem nenhum esforço. A assinatura não mente:
     PNG   89 50 4E 47
     JPEG  FF D8 FF
     WEBP  "RIFF" .... "WEBP" */
export function tipoReal(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* Data URL → `{ tipo, bytes }`, ou `{ erro }`.

   O tipo que sai é o REAL, não o declarado: se os dois discordam, o arquivo é recusado.
   Deixar passar "declara png, é outra coisa" seria servir depois um `Content-Type` que
   não corresponde ao conteúdo. */
export function lerImagem(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return { erro: 'IMAGEM_AUSENTE' };
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) return { erro: 'IMAGEM_FORMATO' };
  if (!TIPOS[m[1]]) return { erro: 'IMAGEM_TIPO' };
  let bytes;
  try { bytes = Buffer.from(m[2], 'base64'); } catch { return { erro: 'IMAGEM_FORMATO' }; }
  if (!bytes.length) return { erro: 'IMAGEM_FORMATO' };
  if (bytes.length > IMAGEM_MAX_BYTES) return { erro: 'IMAGEM_GRANDE' };
  const real = tipoReal(bytes);
  if (!real) return { erro: 'IMAGEM_FORMATO' };
  if (real !== m[1]) return { erro: 'IMAGEM_TIPO' };
  return { tipo: real, bytes };
}

/* A versão sobe SÓ quando os bytes mudam. Trocar nome, duração ou agenda não mexe nela —
   o tablet guarda a arte por um ano com `immutable`, e rebaixar tudo porque alguém
   corrigiu um título seria desperdício. */
export function proximaVersaoImagem(atual) {
  const base = Number.isInteger(atual) && atual >= 0 ? atual : 0;
  return base + 1;
}

/* ── Saídas ─────────────────────────────────────────────────────────────────────────── */

/* A linha como o ADMIN a lê. Sem bytes: `imagemBytes` é o tamanho, para a tela informar
   sem carregar o blob. */
export function bannerParaAdmin(b, agoraMs) {
  return {
    id: b.id,
    nome: b.nome,
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
