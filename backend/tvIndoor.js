// TV Indoor — módulo puro do canal, testado em tvIndoor.test.js.
//
// Domínio PRÓPRIO. A TV e o Totem são canais IRMÃOS: dividem `Dispositivo`, pareamento,
// heartbeat, validação de mídia, agenda e cache — tudo isso é infraestrutura —, mas não
// dividem contrato de produto. Nenhuma linha deste arquivo lê `TotemBanner`, conhece
// `ESPERA`/`CAPA` ou depende do estado do totem. O caminho contrário também não existe.
//
// O que é compartilhado entra por import de helper TÉCNICO (`midiaImagem`, `midiaAgenda`),
// que não sabem o que é banner nem o que é conteúdo.
//
// Sem Prisma, sem Express, sem relógio interno — o instante ENTRA POR PARÂMETRO.

import { dentroDaJanela, duracaoNaFaixa, instante, janelaValida, statusDaJanela } from './midiaAgenda.js';

/* Duração de cada conteúdo na tela.

   O padrão é 10 s, e não os 6 s do totem: a TV é lida de longe, de passagem e sem ninguém
   parado na frente — uma arte que troca a cada 6 s numa parede vira inquietação. O teto de
   120 s (o dobro do totem) existe porque uma TV com um cartaz institucional só faz sentido
   se ele puder ficar parado por um tempo de verdade. O piso segue 3 s: abaixo disso a
   troca vira piscada em qualquer tela. */
export const DURACAO_PADRAO = 10;
export const DURACAO_MIN = 3;
export const DURACAO_MAX = 120;

export const NOME_MAX = 60;
export const PLAYLIST_NOME_MAX = 60;

/* 16:9 deitado — o formato de TODA TV de loja. O V1 não tem TV vertical (está escrito na
   spec, §8), então não há tipo, não há segunda medida e não há escolha a fazer. 1920×1080
   porque é o painel mais comum e o que a arte precisa ter para não subir borrada. */
export const MEDIDA = Object.freeze({ largura: 1920, altura: 1080 });

/* Teto por playlist. Não é limitação técnica — é o ponto em que uma programação deixa de
   ser programação: 60 conteúdos a 10 s dão 10 minutos de volta, e ninguém na loja consegue
   dizer o que está no ar. */
export const MAX_ITENS_PLAYLIST = 60;

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_DURACAO = 'DURACAO_INVALIDA';
export const MOTIVO_DATA = 'DATA_INVALIDA';
export const MOTIVO_JANELA = 'JANELA_INVALIDA';
export const MOTIVO_ITENS = 'ITENS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_DE_ITENS';

const arranjo = (v) => (Array.isArray(v) ? v : []);

/* A régua de LEITURA da duração: grampeia na faixa, com o padrão na dúvida. */
export const normalizarDuracao = (v) => duracaoNaFaixa(v, { min: DURACAO_MIN, max: DURACAO_MAX, padrao: DURACAO_PADRAO });

/* Este conteúdo está no ar AGORA? Ativo + dentro da janela. Mesma régua nos dois lados
   (servidor e TV), e é por isso que a janela vem do helper e não de uma cópia local. */
export function elegivel(conteudo, agoraMs) {
  if (!conteudo || conteudo.ativo !== true) return false;
  return dentroDaJanela(conteudo, agoraMs);
}

/* O rótulo que o admin lê — ATIVO | AGENDADO | ENCERRADO | INATIVO. */
export const statusDoConteudo = (c, agoraMs) => statusDaJanela(c, agoraMs);

/* ── Entrada administrativa ─────────────────────────────────────────────────────────── */

/* Rigor ao escrever. Devolve `{ ok, dados, erros }` com só os campos PRESENTES no corpo —
   um PUT parcial não pode apagar o que não mencionou. */
export function validarConteudo(bruto, { exigirNome = false } = {}) {
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
    // ESCRITA é recusa, não grampeio silencioso: o gestor escolheu um número, e precisa
    // saber que aquele número não vale.
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

/* A janela conferida contra o que JÁ ESTÁ salvo, e não só contra o corpo: mandar só
   `fimEm` num conteúdo que já tem `inicioEm` pode produzir uma janela invertida sem que o
   corpo, sozinho, denuncie. */
export function conferirJanela(dados, atual) {
  const inicioEm = 'inicioEm' in dados ? dados.inicioEm : atual?.inicioEm ?? null;
  const fimEm = 'fimEm' in dados ? dados.fimEm : atual?.fimEm ?? null;
  return janelaValida({ inicioEm, fimEm }) ? null : { campo: 'fimEm', motivo: MOTIVO_JANELA };
}

export function validarNomePlaylist(bruto) {
  const nome = String(bruto ?? '').trim().slice(0, PLAYLIST_NOME_MAX);
  return nome ? { ok: true, nome } : { ok: false, motivo: MOTIVO_NOME };
}

/* Os itens de uma playlist, na ORDEM em que chegaram.

   `disponiveis` é o conjunto de ids que pertencem à empresa — quem monta esse conjunto é a
   rota, com o catálogo escopado. Um id de outra loja não é "erro de digitação": é o
   caminho por onde a programação de uma loja mostraria a arte de outra. Aqui ele é
   RECUSADO, não filtrado em silêncio: filtrar deixaria a tela dizendo "salvo" com menos
   conteúdos do que o gestor escolheu, e ele não saberia qual sumiu.

   Repetido também é recusado — `@@unique([playlistId, conteudoId])` no banco recusaria de
   qualquer forma, e um 500 de constraint é uma explicação pior do que uma frase. */
export function validarItens(bruto, disponiveis) {
  const ids = arranjo(bruto).map(Number);
  const validos = new Set(disponiveis instanceof Set ? disponiveis : arranjo(disponiveis).map(Number));
  if (!Array.isArray(bruto)) return { ok: false, motivo: MOTIVO_ITENS };
  if (ids.length > MAX_ITENS_PLAYLIST) return { ok: false, motivo: MOTIVO_LIMITE };
  const vistos = new Set();
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, motivo: MOTIVO_ITENS };
    if (vistos.has(id)) return { ok: false, motivo: MOTIVO_ITENS };
    if (!validos.has(id)) return { ok: false, motivo: MOTIVO_ITENS };
    vistos.add(id);
  }
  return { ok: true, ids };
}

/* Ids validados → linhas prontas para o `createMany`, com a ordem pela POSIÇÃO na lista.
   Posição, e não troca de vizinhos: trocar dois deixa buracos e empates quando duas abas
   mexem juntas. */
export function itensParaGravar(playlistId, ids) {
  return arranjo(ids).map((conteudoId, i) => ({ playlistId, conteudoId, ordem: i }));
}

/* ── Saídas ─────────────────────────────────────────────────────────────────────────── */

/* O conteúdo como o ADMIN o lê. Sem bytes: `imagemBytes` é o TAMANHO, para a tela
   informar sem carregar o blob. */
export function conteudoParaAdmin(c, agoraMs) {
  return {
    id: c.id,
    nome: c.nome,
    ativo: c.ativo,
    duracaoSegundos: normalizarDuracao(c.duracaoSegundos),
    inicioEm: c.inicioEm ? new Date(c.inicioEm).toISOString() : null,
    fimEm: c.fimEm ? new Date(c.fimEm).toISOString() : null,
    imagemVersao: c.imagemVersao ?? 0,
    imagemTipo: c.imagemTipo ?? null,
    imagemBytes: c.imagemBytes ?? null,
    temImagem: (c.imagemVersao ?? 0) > 0,
    status: statusDoConteudo(c, agoraMs),
    imagemUrl: `/api/tv-indoor/conteudos/${c.id}/imagem?v=${c.imagemVersao ?? 0}`,
  };
}

/* A playlist como o admin a lê, na ordem, com os DOIS tipos de item.
   `linhas` são os `TvPlaylistItem` com `conteudo` e/ou `menuBoard` incluídos.

   Cada item da saída declara o `tipo`, e o que vem junto depende dele: a imagem traz o
   conteúdo inteiro (com status e agenda), o board traz o cabeçalho dele (nome, layout,
   quantos itens) — a listagem do admin NÃO resolve catálogo, porque ela precisa abrir mesmo
   com o HUB fora do ar. Quem resolve é a tela de edição do board e a programação da TV. */
export function playlistParaAdmin(p, agoraMs, boardParaAdmin) {
  const itens = arranjo(p?.itens)
    .slice()
    .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id))
    .map((i) => {
      // `tipo` ausente é IMAGEM: é o contrato da coluna (DEFAULT 'IMAGEM') e o que faz uma
      // linha gravada antes do Menu Board continuar valendo.
      const tipo = i?.tipo === 'MENU_BOARD' ? 'MENU_BOARD' : 'IMAGEM';
      if (tipo === 'MENU_BOARD') {
        if (!i?.menuBoard) return null;
        const board = typeof boardParaAdmin === 'function' ? boardParaAdmin(i.menuBoard) : i.menuBoard;
        return { tipo, itemId: i.id, board };
      }
      if (!i?.conteudo) return null;
      return { tipo, itemId: i.id, conteudo: conteudoParaAdmin(i.conteudo, agoraMs) };
    })
    .filter(Boolean);
  return {
    id: p.id,
    nome: p.nome,
    itens,
    // Quantos estão NO AR agora: é a pergunta que o gestor faz olhando a lista, e um
    // "8 conteúdos" que inclui 6 encerrados não responde nada. Board conta pelo liga-desliga
    // — a elegibilidade dele depende do catálogo, que esta listagem não consulta.
    noAr: itens.filter((i) => (i.tipo === 'IMAGEM' ? i.conteudo.status === 'ATIVO' : i.board?.ativo !== false)).length,
  };
}

/* O bloco que vai para a TV.

   Três decisões que o comentário justifica:

   · NENHUM BYTE. A programação é relida a cada 60 s; mandar arte em base64 nessa
     frequência seria desperdício puro. Vão metadados e uma URL versionada.

   · VÃO OS AGENDADOS TAMBÉM. Conteúdo ativo com janela no futuro viaja junto, e quem
     decide se ele está no ar é a TV, com o relógio corrigido. É isso que faz uma arte
     agendada para as 18:00 entrar às 18:00 em vez de esperar o próximo refresh.

   · `ativo: true` REDUNDANTE, de propósito. Só ativo viaja — mas com o campo presente, a
     mesma função de elegibilidade decide nos DOIS lados. Sem ele a TV precisaria de uma
     segunda régua, e duas réguas divergem.

   Conteúdo sem arte não viaja: ele existiria só para falhar no carregamento. */
export function programacaoPublica(itens, agoraMs, opcoes) {
  // Os boards JÁ RESOLVIDOS contra o catálogo, por id. Quem resolve é a rota (precisa do
  // HUB); aqui só se monta a sequência. Board sem entrada no mapa — ou resolvido como
  // inelegível — simplesmente não entra: o player segue para o próximo item.
  const boards = opcoes?.boards instanceof Map ? opcoes.boards : new Map();
  const lista = arranjo(itens)
    .slice()
    .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id))
    .map((i) => {
      const tipo = i?.tipo === 'MENU_BOARD' ? 'MENU_BOARD' : 'IMAGEM';
      if (tipo === 'MENU_BOARD') {
        const id = i?.menuBoardId ?? i?.menuBoard?.id;
        return id == null ? null : (boards.get(String(id)) ?? null);
      }
      const c = i?.conteudo;
      // Conteúdo sem arte não viaja: existiria só para falhar no carregamento.
      if (!c || c.ativo !== true || (c.imagemVersao ?? 0) <= 0) return null;
      return {
        // O TIPO é o que permite à playlist misturar arte e menu board. Aditivo: todo campo
        // que a imagem já tinha continua onde estava.
        tipo: 'imagem',
        id: c.id,
        nome: c.nome,
        ativo: true,
        duracaoSegundos: normalizarDuracao(c.duracaoSegundos),
        inicioEm: c.inicioEm ? new Date(c.inicioEm).toISOString() : null,
        fimEm: c.fimEm ? new Date(c.fimEm).toISOString() : null,
        imagemVersao: c.imagemVersao ?? 0,
        imagemUrl: `/api/public/aparelho/tv/conteudo/${c.id}/imagem?v=${c.imagemVersao ?? 0}`,
      };
    })
    .filter(Boolean);
  return { agoraServidor: new Date(agoraMs).toISOString(), itens: lista };
}
