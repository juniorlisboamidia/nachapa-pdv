// TV Indoor › GRADE SEMANAL — módulo puro (sem Prisma, sem Express, sem relógio escondido).
//
// Responde a UMA pergunta: **qual playlist esta TV deve estar tocando neste instante?**
//
// ── AS DUAS AGENDAS, QUE NÃO SE MISTURAM ──────────────────────────────────────────────
// A AGENDA DO CONTEÚDO diz "esta campanha existe de 01/10 a 15/10" e vive em `midiaAgenda`.
// A GRADE DA TELA diz "das 18h às 23h esta TV usa a playlist Jantar" e vive aqui. Elas se
// aplicam EM SEQUÊNCIA, nunca fundidas: primeiro a grade escolhe a playlist, depois a
// agenda do conteúdo filtra os itens dela. Misturar as duas produziria perguntas sem
// resposta ("a campanha acabou às 14h, a grade vale até as 23h — quem manda?").
//
// ── POR QUE MINUTOS, E NÃO "18:00" ────────────────────────────────────────────────────
// Horário no banco é um INTEIRO de minutos desde a meia-noite local. Comparar `1080 <= x`
// é a operação inteira; comparar "18:00" obrigaria a reparsear string em todo lugar, e a
// primeira vez que alguém gravasse "8:00" sem zero à esquerda a ordenação quebraria em
// silêncio. A UI continua falando "HH:MM" — a conversão é aqui, num lugar só.
//
// ── POR QUE `Intl`, E NÃO UMA BIBLIOTECA ──────────────────────────────────────────────
// `Intl.DateTimeFormat` COM `timeZone` é a base de dados IANA do próprio runtime, incluindo
// as regras históricas de horário de verão. Trazer date-fns-tz/luxon seria instalar uma
// segunda cópia da mesma tabela. E offset fixo (`-03:00`) está fora de questão: ele é um
// retrato de um instante, não um fuso — no dia em que o Brasil retomar o horário de verão,
// ou numa loja em outro país, toda a grade escorrega uma hora sem ninguém perceber.
//
// ── O QUE ESTE MÓDULO NUNCA FAZ ───────────────────────────────────────────────────────
// Chamar `Date.now()`. O instante entra por parâmetro, sempre. É o que torna "sexta 23:59",
// "sábado 01:59" e "a virada do horário de verão" casos de teste em vez de fé.

/* Dias em ISO-8601: 1 = segunda … 7 = domingo. Estável, numérico e independente de idioma —
   nunca "Segunda-feira", que muda com a tradução e não ordena. */
export const DIAS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
export const MINUTOS_NO_DIA = 24 * 60;
export const FUSO_PADRAO = 'America/Sao_Paulo';

export const ORIGEM_REGRA = 'REGRA';
export const ORIGEM_PADRAO = 'PADRAO';

export const MOTIVO_DIAS = 'DIAS_INVALIDOS';
export const MOTIVO_HORA = 'HORA_INVALIDA';
export const MOTIVO_JANELA_NULA = 'JANELA_NULA';
export const MOTIVO_PLAYLIST = 'PLAYLIST_INVALIDA';
export const MOTIVO_FUSO = 'FUSO_INVALIDO';
export const MOTIVO_PERIODO = 'PERIODO_INVALIDO';

/* ── Fuso ───────────────────────────────────────────────────────────────────────────── */

/* O fuso é IANA e é VALIDADO contra o runtime, não contra uma lista nossa que envelhece.
   Sem isto, uma string qualquer gravada no banco derrubaria a programação pública de uma
   loja inteira — e o lugar onde isso apareceria seria a parede, não um log. */
export function fusoValido(bruto) {
  const tz = typeof bruto === 'string' ? bruto.trim() : '';
  if (!tz) return false;
  // `Intl` MODERNO aceita deslocamento fixo ("-03:00") como fuso, e nós não. Um offset é o
  // retrato de um instante, não um fuso: no dia em que a região adotar horário de verão, a
  // grade inteira escorrega uma hora e ninguém percebe. Só zona IANA de verdade passa.
  if (/^[+-]\d{1,2}(:?\d{2})?$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const fusoOuPadrao = (bruto) => (fusoValido(bruto) ? bruto.trim() : FUSO_PADRAO);

// Um formatador por fuso: criar `Intl.DateTimeFormat` é caro, e a rota pública chama isto a
// cada requisição de cada TV.
const formatadores = new Map();
function formatador(fuso) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

const DIA_DA_SIGLA = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/* O instante UTC visto pelo RELÓGIO DA LOJA: que dia da semana é, e quantos minutos já se
   passaram da meia-noite local. É a tradução que separa "agora" de "agora ali". */
export function partesLocais(agoraMs, fuso) {
  const partes = formatador(fusoOuPadrao(fuso)).formatToParts(new Date(agoraMs));
  const p = {};
  for (const { type, value } of partes) p[type] = value;
  const hora = Number(p.hour) % 24;   // h23 devolve 00–23, mas 24 aparece em runtimes antigos
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    diaSemana: DIA_DA_SIGLA[p.weekday] ?? 1,
    minutos: hora * 60 + Number(p.minute),
  };
}

/* O caminho INVERSO: uma hora de parede local vira o instante UTC correspondente.

   Não existe API direta para isso, e o algoritmo é o conhecido de duas passagens: trata-se
   a hora local como se fosse UTC, mede-se o deslocamento real naquele ponto e corrige-se.
   A segunda passagem existe porque a primeira correção pode cair do outro lado de uma
   virada de horário de verão, onde o deslocamento é outro.

   Em hora que não existe (a madrugada que o relógio pula ao entrar no horário de verão) o
   resultado cai no instante logo após o salto — que é o comportamento desejado: a grade
   entra assim que aquele horário passa a existir. */
export function instanteDeLocal({ ano, mes, dia, minutos }, fuso) {
  const tz = fusoOuPadrao(fuso);
  const alvo = Date.UTC(ano, mes - 1, dia, Math.floor(minutos / 60), minutos % 60);
  let ts = alvo;
  for (let i = 0; i < 2; i += 1) {
    const l = partesLocais(ts, tz);
    const comoUtc = Date.UTC(l.ano, l.mes - 1, l.dia, Math.floor(l.minutos / 60), l.minutos % 60);
    ts = alvo - (comoUtc - ts);
  }
  return ts;
}

/* ── Horas ──────────────────────────────────────────────────────────────────────────── */

/* "18:30" → 1110. Estrito: nada de "18h", "6 PM", "25:00" ou "18:60". A precisão do V1 é o
   MINUTO, e aceitar segundos aqui seria prometer uma exatidão que a grade não entrega. */
export function minutosDeHora(bruto) {
  if (typeof bruto === 'number') {
    return Number.isSafeInteger(bruto) && bruto >= 0 && bruto < MINUTOS_NO_DIA ? bruto : null;
  }
  const m = /^([0-2]\d):([0-5]\d)$/.exec(String(bruto ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return h * 60 + Number(m[2]);
}

export function horaDeMinutos(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n < 0 || n >= MINUTOS_NO_DIA) return null;
  const p = (x) => String(x).padStart(2, '0');
  return `${p(Math.floor(n / 60))}:${p(Math.round(n) % 60)}`;
}

const diaAnterior = (d) => (d === 1 ? 7 : d - 1);

/* ── A regra ────────────────────────────────────────────────────────────────────────── */

const diasDe = (regra) => (Array.isArray(regra?.dias) ? regra.dias : []);

/* A regra atravessa a meia-noite? `18:00 → 02:00` sim; `11:00 → 14:30` não.

   Início IGUAL a fim não é nem um nem outro: é janela nula, recusada na escrita. Interpretá-la
   como "24 horas" seria adivinhar — e quem quer conteúdo permanente usa a playlist padrão. */
export const cruzaMeiaNoite = (regra) => regra?.inicioMin > regra?.fimMin;

/* Esta regra vale AGORA?

   O DIA marcado é o de INÍCIO da janela, e é isso que faz `sexta 18:00 → 02:00` funcionar
   com uma regra só: às 23:30 de sexta ela vale pelo próprio dia; à 01:30 de sábado ela vale
   porque SEXTA — o dia anterior — está marcada e ainda não deram 02:00.

   As bordas são início INCLUSIVO e fim EXCLUSIVO, a mesma régua da agenda de conteúdo. Às
   02:00 em ponto a regra já não vale: senão duas regras vizinhas (uma terminando, outra
   começando no mesmo minuto) valeriam juntas por um minuto inteiro. */
/* ── O PERÍODO: a regra que só vale entre duas DATAS ────────────────────────────────
   "Terça em dobro" vale toda terça; "Dia dos Pais" vale de 16 a 17 de julho, e só. A
   segunda precisa de um período além dos dias da semana — e é aqui, na grade, que ele mora.
   Antes ele morava na ARTE (começa/termina no conteúdo), o que fazia o acervo decidir
   quando algo vai ao ar. Quando é pergunta da programação, e a grade é a programação.

   São INSTANTES (UTC), não datas de calendário: é como o navegador do gestor os manda, e é
   contra o relógio do servidor que se compara. `null` dos dois lados = vale sempre, que é
   como toda regra existente continua se comportando. */
export function periodoVale(regra, agoraMs) {
  const de = instanteOuNulo(regra?.validoDe);
  const ate = instanteOuNulo(regra?.validoAte);
  if (de !== null && agoraMs < de) return false;
  if (ate !== null && agoraMs >= ate) return false;
  return true;
}

// Data em qualquer forma (Date, ISO, ms) → ms, ou `null` para vazio/inválido.
// ⚠️ Inválido vira `null` ("sem limite"), e não 0: `new Date('x').getTime()` é NaN, e um
// NaN numa comparação é sempre falso — a regra sumiria do ar sem erro nenhum.
function instanteOuNulo(v) {
  if (v === null || v === undefined || v === '') return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function regraVale(regra, { diaSemana, minutos }, agoraMs = null) {
  if (!regra || regra.ativo === false) return false;
  // O período é conferido primeiro: fora dele, o dia da semana nem é olhado.
  if (agoraMs !== null && !periodoVale(regra, agoraMs)) return false;
  const dias = diasDe(regra);
  const ini = regra.inicioMin;
  const fim = regra.fimMin;
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || ini === fim) return false;
  if (cruzaMeiaNoite(regra)) {
    if (dias.includes(diaSemana) && minutos >= ini) return true;
    return dias.includes(diaAnterior(diaSemana)) && minutos < fim;
  }
  return dias.includes(diaSemana) && minutos >= ini && minutos < fim;
}

/* ── A resolução ────────────────────────────────────────────────────────────────────── */

/* Quando é a PRÓXIMA vez que a grade pode mudar?

   Varre os limites — começos e fins — de cada regra ativa nos próximos 8 dias locais e
   devolve o mais próximo que ainda está no futuro. Oito dias porque a grade é semanal: com
   sete bastaria, e o oitavo cobre a borda de uma regra que começa hoje mais tarde na semana
   seguinte.

   Os limites viram instantes UTC pelo caminho inverso, e não por soma de minutos: somar
   ignoraria uma virada de horário de verão no meio do intervalo, e a TV pediria a
   programação nova uma hora cedo (ou tarde) no dia da virada.

   É deliberadamente um limite de REGRA, não de playlist efetiva: se a troca resultar na
   mesma playlist, o player simplesmente não reinicia nada — e calcular "a próxima vez que a
   playlist REALMENTE muda" custaria simular a resolução em cada limite, para economizar uma
   requisição que não custa nada. */
export function proximaTroca({ agoraMs, fuso, regras }) {
  const tz = fusoOuPadrao(fuso);
  const ativas = (Array.isArray(regras) ? regras : []).filter((r) => r?.ativo !== false && r?.inicioMin !== r?.fimMin);
  if (!ativas.length) return null;
  const hoje = partesLocais(agoraMs, tz);
  let melhor = null;
  for (let d = 0; d <= 8; d += 1) {
    // A data local de hoje + d dias. `Date.UTC` aqui é só aritmética de calendário — o
    // resultado volta a ser hora de parede logo abaixo.
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d));
    const ano = base.getUTCFullYear();
    const mes = base.getUTCMonth() + 1;
    const dia = base.getUTCDate();
    const diaSemana = ((base.getUTCDay() + 6) % 7) + 1;   // 0=domingo → 7
    for (const r of ativas) {
      if (!diasDe(r).includes(diaSemana)) continue;
      const candidatos = [
        { ano, mes, dia, minutos: r.inicioMin },
        // O fim de uma janela que cruza a meia-noite cai no dia SEGUINTE ao marcado.
        cruzaMeiaNoite(r)
          ? { ...proximoDia(ano, mes, dia), minutos: r.fimMin }
          : { ano, mes, dia, minutos: r.fimMin },
      ];
      for (const c of candidatos) {
        const ts = instanteDeLocal(c, tz);
        // Um limite semanal FORA do período da regra não muda nada: a regra não vale ali.
        // Contá-lo faria a TV pedir a programação numa hora em que nada troca.
        if (ts > agoraMs && periodoVale(r, ts) && (melhor === null || ts < melhor)) melhor = ts;
      }
    }
  }
  /* Os limites do PERÍODO são trocas também — e são as que mais importam: é no instante em
     que "Dia dos Pais" começa a valer que a parede tem de mudar, mesmo que isso caia numa
     terça às 14:37, hora que nenhuma janela semanal marcaria. */
  for (const r of ativas) {
    for (const v of [r.validoDe, r.validoAte]) {
      const ts = instanteOuNulo(v);
      if (ts !== null && ts > agoraMs && (melhor === null || ts < melhor)) melhor = ts;
    }
  }
  return melhor;
}

function proximoDia(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/* A RESPOSTA. Uma função, um lugar — é o que impede a rota pública, o admin e o player de
   responderem coisas diferentes sobre o mesmo instante.

   `regras` chega ORDENADA (a ordem é a prioridade) e a PRIMEIRA elegível vence. Sobreposição
   é recurso, não erro: "Seg–Sex jantar" embaixo de "Terça em dobro" é exatamente como o
   gestor pensa, e a única regra que ele precisa entender é "a de cima ganha". */
export function resolverGrade({ agoraMs, fuso, regras, playlistPadraoId = null } = {}) {
  const tz = fusoOuPadrao(fuso);
  const agora = partesLocais(agoraMs, tz);
  const lista = Array.isArray(regras) ? regras : [];
  const vencedora = lista.find((r) => regraVale(r, agora, agoraMs)) ?? null;
  return {
    fuso: tz,
    playlistId: vencedora ? vencedora.playlistId : (playlistPadraoId ?? null),
    origem: vencedora ? ORIGEM_REGRA : ORIGEM_PADRAO,
    regraId: vencedora ? vencedora.id : null,
    proximaTrocaEm: proximaTroca({ agoraMs, fuso: tz, regras: lista }),
  };
}

/* ── Escrita ────────────────────────────────────────────────────────────────────────── */

/* Rigor ao escrever. Só os campos PRESENTES no corpo — um PUT parcial não apaga o que não
   mencionou. `ordem` NÃO entra: prioridade não é número digitado, é posição, e ela se muda
   pela rota de reordenação. */
export function validarEntradaRegra(bruto, { exigirTudo = false, playlists = null } = {}) {
  const corpo = (typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto)) ? bruto : {};
  const erros = [];
  const dados = {};

  if (corpo.dias !== undefined || exigirTudo) {
    const brutoDias = Array.isArray(corpo.dias) ? corpo.dias : [];
    // Normalizado e sem repetição: a mesma seleção sempre grava o mesmo array, e comparar
    // duas regras não depende da ordem em que alguém clicou nos dias.
    const dias = [...new Set(brutoDias.map((d) => Number(d)))].filter((d) => DIAS.includes(d)).sort((a, b) => a - b);
    // A comparação é contra o array CRU, não contra o conjunto já limpo: comparar com o
    // conjunto aceitaria `[1, 1]` calado (o conjunto tem um elemento, o filtrado também).
    // Repetição e valor fora da faixa são corpo malformado, e aceitar "o que dá" esconderia
    // um erro de quem chamou.
    if (!dias.length || dias.length !== brutoDias.length) erros.push({ campo: 'dias', motivo: MOTIVO_DIAS });
    else dados.dias = dias;
  }

  for (const [campo, chave] of [['horaInicio', 'inicioMin'], ['horaFim', 'fimMin']]) {
    if (corpo[campo] === undefined && !exigirTudo) continue;
    const min = minutosDeHora(corpo[campo]);
    if (min === null) erros.push({ campo, motivo: MOTIVO_HORA });
    else dados[chave] = min;
  }

  if (corpo.playlistId !== undefined || exigirTudo) {
    const id = Number(corpo.playlistId);
    if (!Number.isSafeInteger(id) || id <= 0) erros.push({ campo: 'playlistId', motivo: MOTIVO_PLAYLIST });
    // A playlist precisa ser DESTA empresa. Quem sabe disso é a rota (fez a consulta); aqui
    // só se confere contra o conjunto que ela entregou.
    else if (playlists instanceof Set && !playlists.has(id)) erros.push({ campo: 'playlistId', motivo: MOTIVO_PLAYLIST });
    else dados.playlistId = id;
  }

  if (corpo.ativo !== undefined) dados.ativo = corpo.ativo === true;

  /* O período: `null`/`''` LIMPA (o gestor apagou o campo); ausente NÃO MEXE (PUT parcial).
     Uma data que não parseia é erro, e não "sem limite": aceitar calado faria a regra
     valer para sempre quando o gestor quis um fim. */
  for (const campo of ['validoDe', 'validoAte']) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null || corpo[campo] === '') { dados[campo] = null; continue; }
    const ms = instanteOuNulo(corpo[campo]);
    if (ms === null) erros.push({ campo, motivo: MOTIVO_PERIODO });
    else dados[campo] = new Date(ms);
  }

  return { ok: erros.length === 0, dados, erros };
}

/* O período conferido contra o que JÁ ESTÁ salvo: mandar só `validoAte` numa regra que já
   tem `validoDe` pode inverter o período sem que o corpo, sozinho, denuncie. Um período
   invertido não é "nunca vale" — é erro, e é recusado. */
export function conferirPeriodo(dados, atual) {
  const de = instanteOuNulo('validoDe' in dados ? dados.validoDe : atual?.validoDe);
  const ate = instanteOuNulo('validoAte' in dados ? dados.validoAte : atual?.validoAte);
  if (de !== null && ate !== null && ate <= de) return { campo: 'validoAte', motivo: MOTIVO_PERIODO };
  return null;
}

/* A janela conferida contra o que JÁ ESTÁ salvo: mandar só `horaFim` numa regra que já tem
   início pode produzir uma janela nula sem que o corpo, sozinho, denuncie. */
export function conferirJanela(dados, atual) {
  const ini = 'inicioMin' in dados ? dados.inicioMin : atual?.inicioMin;
  const fim = 'fimMin' in dados ? dados.fimMin : atual?.fimMin;
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) return { campo: 'horaInicio', motivo: MOTIVO_HORA };
  // Início igual a fim: recusado, e de propósito. "24 horas" e "zero minutos" são leituras
  // igualmente defensáveis do mesmo dado, e uma grade não pode ter duas leituras.
  return ini === fim ? { campo: 'horaFim', motivo: MOTIVO_JANELA_NULA } : null;
}

/* Duas regras da mesma TV podem se cruzar? Isto NÃO bloqueia nada — serve para o admin
   avisar "a de cima ganha" no momento em que o gestor cria a segunda. */
export function cruzaCom(a, b) {
  if (!a || !b) return false;
  // Períodos que não se tocam nunca disputam um instante — "Dia dos Pais" e "Natal" podem
  // ter a mesma janela semanal sem que uma ganhe da outra.
  const [de1, ate1, de2, ate2] = [a.validoDe, a.validoAte, b.validoDe, b.validoAte].map(instanteOuNulo);
  if (de1 !== null && ate2 !== null && de1 >= ate2) return false;
  if (de2 !== null && ate1 !== null && de2 >= ate1) return false;
  const faixas = (r) => (cruzaMeiaNoite(r)
    ? diasDe(r).flatMap((d) => [[d, r.inicioMin, MINUTOS_NO_DIA], [d === 7 ? 1 : d + 1, 0, r.fimMin]])
    : diasDe(r).map((d) => [d, r.inicioMin, r.fimMin]));
  for (const [dia, i1, f1] of faixas(a)) {
    for (const [dia2, i2, f2] of faixas(b)) {
      if (dia === dia2 && i1 < f2 && i2 < f1) return true;
    }
  }
  return false;
}

/* ── Saída para o admin ─────────────────────────────────────────────────────────────── */

export function regraParaAdmin(r) {
  return {
    id: r.id,
    dispositivoId: r.dispositivoId,
    playlistId: r.playlistId,
    playlistNome: r.playlist?.nome ?? null,
    ativo: r.ativo !== false,
    dias: diasDe(r),
    horaInicio: horaDeMinutos(r.inicioMin),
    horaFim: horaDeMinutos(r.fimMin),
    cruzaMeiaNoite: cruzaMeiaNoite(r),
    ordem: r.ordem ?? 0,
    validoDe: r.validoDe ? new Date(r.validoDe).toISOString() : null,
    validoAte: r.validoAte ? new Date(r.validoAte).toISOString() : null,
  };
}
