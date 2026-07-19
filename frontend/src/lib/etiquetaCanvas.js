// Desenha a etiqueta ANVISA num canvas. Só desenha — não conecta Bluetooth, não imprime,
// não busca dados no backend. A prévia da tela (Config) e o bitmap que vai para a
// impressora (niimbotB1.imprimir, que lê o MESMO canvas via canvas.toBlob) chamam esta
// função: o que o usuário vê na tela é literalmente o que sai no papel, porque é o mesmo
// desenho — não uma reimplementação paralela que pode divergir.
import { LARGURA_PX } from './niimbotB1.js'
import { matrizQr } from './qr.js'

// A B1 imprime a 203 dpi, que arredonda para 8 dots por mm (203/25.4 ≈ 7.99 — a lib usa 8
// redondo, ver niimbotB1.js). A largura é sempre LARGURA_PX (fixa na cabeça de impressão);
// a altura depende do rolo (config.alturaMm) — por isso só ela entra nesta conta.
const DOTS_POR_MM = 8

// dd/mm/aa hh:mm — formato curto de propósito: a etiqueta é térmica de 48mm de largura,
// não sobra espaço para ano por extenso nem para segundos.
const fmt = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Corta o texto com reticências até caber em `max` px, na fonte já setada no ctx no
// momento da chamada. Sem isso um nome de item comprido vaza da área da etiqueta ou
// empurra o resto do layout — nenhuma das duas é aceitável numa impressão térmica de
// área fixa (ao contrário de uma página web, aqui não tem para onde "rolar").
function ajustar(ctx, texto, max) {
  let t = String(texto || '')
  if (ctx.measureText(t).width <= max) return t
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

// Fonte térmica: a B1 a 203dpi não puxa traço fino pequeno (o texto miúdo não-negrito sai
// falhado). Então TODA fonte passa por aqui: garante um piso de tamanho e força NEGRITO em
// tudo que for pequeno (< ~16px), que é onde o traço fino falha. Texto grande (título/data)
// já sai bem e mantém o peso pedido no `bold` explícito.
const FONTE_MIN = 10
function setFonte(ctx, px, k, { bold = false } = {}) {
  const tam = Math.max(FONTE_MIN, Math.round(px * k))
  const peso = bold || tam < 16 ? 'bold ' : ''
  ctx.font = `${peso}${tam}px monospace`
}

// Traça o caminho de um retângulo de cantos arredondados (selo "MANIPULADO", faixa de
// conservação). Só monta o path — quem chama decide fill() ou stroke(). arcTo é suportado
// em todo navegador (mais que ctx.roundRect, que é recente).
function caminhoRR(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// Dimensões finais do canvas para um `config` de rolo. Exportada separada de
// desenharEtiqueta porque quem monta a UI (prévia, canvas de impressão) precisa saber o
// tamanho ANTES de desenhar, para criar/redimensionar o elemento <canvas>.
export function dimensoes(config) {
  return { largura: LARGURA_PX, altura: Math.round((config?.alturaMm || 30) * DOTS_POR_MM) }
}

// Normaliza `config.campos` (Json? — pode vir null/undefined/objeto incompleto de um
// registro salvo antes desta feature) com os MESMOS defaults do contrato sanitizado no
// backend (server.js, PUT /etiquetas/config): conservacao/responsavel/lote/cnpj default
// TRUE — retrocompat, uma loja sem `campos` continua mostrando tudo, como sempre mostrou —
// e instrucoes default FALSE. Chamada no início de cada `desenhar*` abaixo, para os 4
// modelos lerem o mesmo objeto normalizado em vez de cada um reimplementar os defaults.
// Exportada porque a tela de Config (Etiquetas.jsx, card "Campos impressos") também
// precisa ler `config.campos` com os mesmos defaults, pros toggles refletirem o que já
// está de fato desenhado — reusar em vez de duplicar a lógica dos defaults nos dois lados.
export function camposDe(config) {
  const c = config?.campos && typeof config.campos === 'object' ? config.campos : {}
  return {
    conservacao: c.conservacao !== false,
    responsavel: c.responsavel !== false,
    lote: c.lote !== false,
    cnpj: c.cnpj !== false,
    instrucoes: c.instrucoes === true,
    instrucoesTexto: typeof c.instrucoesTexto === 'string' ? c.instrucoesTexto : '',
  }
}

// Os 4 modelos selecionáveis (Config › Modelo e prévia). `id` é o valor gravado em
// EtiquetaConfig.modelo; `nome`/`descr` são só para a UI (cartões do seletor).
export const MODELOS = [
  { id: 'CLASSICO', nome: 'Clássico', descr: 'Cabeçalho + campos em lista' },
  { id: 'VALIDADE', nome: 'Validade em destaque', descr: 'Data de validade em destaque' },
  { id: 'LATERAL_QR', nome: 'Faixa lateral + QR', descr: 'Faixa por conservação + QR' },
  { id: 'COMPACTO', nome: 'Compacto', descr: 'Minimalista p/ etiquetas pequenas' },
]

// dados: { nomeItem, tempLabel, conservacaoLabel, manipuladoEm: Date, validoAte: Date,
//          responsavelNome, lote, qr? }
// config: { alturaMm, razaoSocial, cnpj, sif, sie, modelo, fonte }
//
// `qr` é OPCIONAL e é um texto (não uma imagem): só o modelo LATERAL_QR usa, gerando a
// matriz de módulos na hora via `matrizQr` (Task 1, lib/qr.js) — sem imagem pré-carregada,
// sem servidor. Sem `qr` o próprio modelo monta um payload legível a partir de `dados`
// (ver `textoPadraoQr`, abaixo).
export function desenharEtiqueta(canvas, dados, config) {
  const dims = dimensoes(config)
  canvas.width = dims.largura
  canvas.height = dims.altura
  const ctx = canvas.getContext('2d')

  // Fundo branco opaco: impressão térmica 1-bit não tem transparência, e é o mesmo fundo
  // que niimbotB1.canvasParaBitmap (e a lib, na hora de imprimir de verdade) esperam para
  // compor antes do threshold — ver o comentário de canvasParaBitmap em niimbotB1.js.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, dims.largura, dims.altura)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  // Escala de fonte: GRANDE lê melhor de longe (etiqueta colada num pote na prateleira),
  // ao custo de truncar nomes mais cedo — por isso cada `desenhar*` reaplica `k` em toda
  // fonte (via Math.round) em vez de crescer só uma parte do layout.
  const k = config?.fonte === 'GRANDE' ? 1.18 : 1

  const fn = {
    CLASSICO: desenharClassico,
    VALIDADE: desenharValidade,
    LATERAL_QR: desenharLateralQr,
    COMPACTO: desenharCompacto,
  }[config?.modelo] || desenharClassico
  fn(ctx, dados, config, dims, k)
}

// CLASSICO — o estilo da referência: cabeçalho (razão social + CNPJ à esquerda, selo
// "MANIPULADO" arredondado à direita) → régua → nome do produto → campos com rótulo à
// esquerda e valor alinhado à direita → faixa preta arredondada com a conservação → rodapé
// RDC centralizado. Fonte monospace (térmica 1-bit, sem antialias útil).
function desenharClassico(ctx, dados, config, dims, k) {
  const { largura } = dims
  const campos = camposDe(config)
  const M = 12
  const dir = largura - M // borda direita útil (para valores alinhados à direita)
  let y = M

  // --- Cabeçalho: razão social + CNPJ (esq) · selo "MANIPULADO" (dir) ---
  ctx.textAlign = 'left'
  setFonte(ctx, 12, k, { bold: true })
  ctx.fillText(ajustar(ctx, (config?.razaoSocial || '').toUpperCase(), largura * 0.6), M, y + Math.round(2 * k))
  // selo arredondado (contorno), no topo direito, alinhado com a razão social
  const selo = 'MANIPULADO'
  setFonte(ctx, 8, k, { bold: true })
  const selH = Math.round(15 * k)
  const selW = ctx.measureText(selo).width + Math.round(16 * k)
  caminhoRR(ctx, dir - selW, y, selW, selH, selH / 2)
  ctx.lineWidth = Math.max(1, Math.round(1 * k))
  ctx.strokeStyle = '#000'
  ctx.stroke()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(selo, dir - selW / 2, y + selH / 2)
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  y += Math.round(17 * k)
  // CNPJ (+ SIF/SIE se houver) numa linha miúda — a linha inteira é togláve por `campos.cnpj`
  // (SIF/SIE andam junto do CNPJ no contrato, não têm toggle próprio).
  if (campos.cnpj) {
    const idLinha = [config?.cnpj ? `CNPJ ${config.cnpj}` : null, config?.sif ? `SIF ${config.sif}` : null,
      config?.sie ? `SIE ${config.sie}` : null].filter(Boolean).join(' · ')
    if (idLinha) { setFonte(ctx, 9, k); ctx.fillText(ajustar(ctx, idLinha, largura - M * 2), M, y); y += Math.round(14 * k) }
  }

  // --- régua separadora ---
  y += Math.round(5 * k)
  ctx.fillRect(M, y, largura - M * 2, 1)
  y += Math.round(11 * k)

  // --- Nome do produto — o que a cozinha lê de longe ---
  setFonte(ctx, 20, k, { bold: true })
  ctx.fillText(ajustar(ctx, (dados.nomeItem || '').toUpperCase(), largura - M * 2), M, y)
  y += Math.round(30 * k)

  // --- Campos: rótulo à esquerda, valor alinhado à direita ---
  const linha = (rotulo, valor) => {
    ctx.textAlign = 'left'
    setFonte(ctx, 9, k)
    ctx.fillText(rotulo, M, y + Math.round(2 * k))
    ctx.textAlign = 'right'
    setFonte(ctx, 11, k, { bold: true })
    ctx.fillText(ajustar(ctx, valor, largura * 0.5), dir, y + Math.round(1 * k))
    ctx.textAlign = 'left'
    y += Math.round(19 * k)
  }
  linha('MANIPULAÇÃO', fmt(dados.manipuladoEm))
  linha('VALIDADE', fmt(dados.validoAte))
  // LOTE/RESPONSÁVEL são opcionais: como `linha()` só avança `y` quando é chamada, pular a
  // chamada já faz o reflow sozinho — sem buraco no layout sequencial.
  if (campos.lote) linha('LOTE', dados.lote)
  if (campos.responsavel) linha('RESPONSÁVEL', dados.responsavelNome)

  // --- Faixa preta arredondada: conservação · temperatura (branco, centralizado) ---
  if (campos.conservacao) {
    y += Math.round(6 * k)
    const bandaH = Math.round(26 * k)
    caminhoRR(ctx, M, y, largura - M * 2, bandaH, Math.round(6 * k))
    ctx.fillStyle = '#000'; ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    setFonte(ctx, 12, k, { bold: true })
    ctx.fillText(ajustar(ctx, `${(dados.conservacaoLabel || '').toUpperCase()} · ${(dados.tempLabel || '').toUpperCase()}`, largura - M * 2 - 14), largura / 2, y + bandaH / 2)
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    y += bandaH + Math.round(9 * k)
  } else {
    y += Math.round(6 * k) // mesmo respiro antes do rodapé, sem a faixa
  }

  // --- Rodapé RDC, centralizado ---
  setFonte(ctx, 8, k)
  ctx.textAlign = 'center'
  ctx.fillText('Conforme RDC 216/2004 (ANVISA)', largura / 2, y)
  ctx.textAlign = 'left'

  // --- Instruções de conservação (opcional): uma linha centralizada logo abaixo do
  // rodapé RDC — como o layout aqui é sequencial (y sempre cresce), basta continuar
  // avançando `y`, sem risco de sobrepor o que já foi desenhado.
  if (campos.instrucoes && campos.instrucoesTexto) {
    y += Math.round(12 * k)
    setFonte(ctx, 8, k)
    ctx.textAlign = 'center'
    ctx.fillText(ajustar(ctx, campos.instrucoesTexto, largura - M * 2), largura / 2, y)
    ctx.textAlign = 'left'
  }
}

// VALIDADE — a data de validade é o dado mais importante desta etiqueta (é a pergunta que
// o cozinheiro faz olhando o pote: "ainda posso usar isso?"), então ela ganha a fonte
// maior de todo o desenho, centralizada no meio da etiqueta.
function desenharValidade(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const campos = camposDe(config)
  const M = 8
  let y = M

  // topo: razão social (miúda, à esquerda) + selo de conservação (à direita, opcional)
  setFonte(ctx, 10, k)
  ctx.textAlign = 'left'
  ctx.fillText(ajustar(ctx, config?.razaoSocial || '', largura * 0.6), M, y)
  if (campos.conservacao) {
    setFonte(ctx, 10, k, { bold: true })
    ctx.textAlign = 'right'
    ctx.fillText(String(dados.conservacaoLabel || '').toUpperCase(), largura - M, y)
    ctx.textAlign = 'left'
  }
  y += Math.round(16 * k)

  // centro: "VÁLIDO ATÉ" + data/hora em destaque
  ctx.textAlign = 'center'
  setFonte(ctx, 11, k)
  ctx.fillStyle = '#555'
  ctx.fillText('VÁLIDO ATÉ', largura / 2, y)
  ctx.fillStyle = '#000'
  y += Math.round(15 * k)
  setFonte(ctx, 28, k, { bold: true })
  ctx.fillText(fmt(dados.validoAte), largura / 2, y)
  y += Math.round(36 * k)

  // nome do item, abaixo da validade
  setFonte(ctx, 16, k, { bold: true })
  ctx.fillText(ajustar(ctx, dados.nomeItem, largura - M * 2), largura / 2, y)
  ctx.textAlign = 'left'

  // rodapé: manipulação (sempre) + lote/responsável (opcionais), numa linha só, ancorado
  // na base
  const rodapePartes = [`Manip ${fmt(dados.manipuladoEm)}`]
  if (campos.lote) rodapePartes.push(`Lote ${dados.lote}`)
  if (campos.responsavel) rodapePartes.push(dados.responsavelNome)
  const rodape = rodapePartes.join(' · ')
  const rodapeY = altura - M - Math.round(11 * k)
  setFonte(ctx, 10, k)
  ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, rodapeY)

  // Instruções de conservação (opcional): uma linha acima do rodapé de base.
  if (campos.instrucoes && campos.instrucoesTexto) {
    setFonte(ctx, 8, k)
    ctx.fillText(ajustar(ctx, campos.instrucoesTexto, largura - M * 2), M, rodapeY - Math.round(12 * k))
  }
}

// LATERAL_QR — faixa preta vertical à esquerda com a conservação (texto girado, lida
// virando a etiqueta de lado — comum em faixas de identificação de prateleira/caixa),
// campos em 2 colunas para caber mais dado na área que sobra, e QR no canto inferior
// direito com o mesmo conteúdo em texto (payload offline, sem servidor de rastreio).
function desenharLateralQr(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const campos = camposDe(config)
  const M = 10
  // Faixa preta lateral: só existe quando `campos.conservacao` está ligado. Desligada, o
  // conteúdo usa a largura CHEIA da etiqueta (FAIXA=0, xConteudo=M) — sem a faixa a
  // etiqueta não tem mais como comunicar a conservação, então não faz sentido reservar o
  // espaço vazio dela.
  const FAIXA = campos.conservacao ? 38 : 0 // largura da faixa preta lateral
  const xConteudo = campos.conservacao ? FAIXA + 14 : M // ≈52 c/ faixa; sem ela, cola na margem

  if (campos.conservacao) {
    // faixa preta vertical + conservação girada -90° e CENTRALIZADA no meio da faixa
    // (translate para o centro da faixa/altura + textAlign center + baseline middle).
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, FAIXA, altura)
    ctx.save()
    ctx.fillStyle = '#fff'
    setFonte(ctx, 13, k, { bold: true })
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.translate(Math.round(FAIXA / 2), Math.round(altura / 2))
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(ajustar(ctx, String(dados.conservacaoLabel || '').toUpperCase(), altura - 24), 0, 0)
    ctx.restore()
    ctx.fillStyle = '#000'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }

  const larguraConteudo = largura - xConteudo - M
  let y = M + Math.round(2 * k)

  // cabeçalho: razão social · CNPJ (CNPJ opcional, `campos.cnpj`)
  setFonte(ctx, 9, k)
  ctx.fillText(ajustar(ctx, [config?.razaoSocial, (campos.cnpj && config?.cnpj) ? `CNPJ ${config.cnpj}` : null].filter(Boolean).join(' · '), larguraConteudo), xConteudo, y)
  y += Math.round(17 * k)

  // nome do item
  setFonte(ctx, 17, k, { bold: true })
  ctx.fillText(ajustar(ctx, dados.nomeItem, larguraConteudo), xConteudo, y)
  y += Math.round(23 * k)

  // separador (dá respiro entre o nome e os campos)
  ctx.fillRect(xConteudo, y, larguraConteudo, 1)
  y += Math.round(13 * k)

  // campos em 2 colunas, bem espaçados: VALIDADE/MANIPULAÇÃO à esquerda, RESPONSÁVEL/LOTE à direita
  const colEsqX = xConteudo
  const colDirX = xConteudo + Math.round(larguraConteudo * 0.52)
  const larguraColEsq = Math.round(larguraConteudo * 0.52) - 10
  const larguraColDir = larguraConteudo - Math.round(larguraConteudo * 0.52) - 4
  const campo = (x, yy, rotulo, valor, wmax) => {
    setFonte(ctx, 9, k, { bold: true })
    ctx.fillText(rotulo, x, yy)
    setFonte(ctx, 12, k)
    ctx.fillText(ajustar(ctx, valor, wmax), x, yy + Math.round(13 * k))
  }
  const rowGap = Math.round(33 * k)
  // VALIDADE/MANIPULAÇÃO (esquerda) são sempre desenhadas; RESPONSÁVEL/LOTE (direita) são
  // opcionais — como as 2 colunas são independentes (não é lista sequencial), desligar um
  // campo só deixa a célula da direita vazia, sem precisar reflow.
  campo(colEsqX, y, 'VALIDADE', fmt(dados.validoAte), larguraColEsq)
  if (campos.responsavel) campo(colDirX, y, 'RESPONSÁVEL', dados.responsavelNome, larguraColDir)
  y += rowGap
  campo(colEsqX, y, 'MANIPULAÇÃO', fmt(dados.manipuladoEm), larguraColEsq)
  if (campos.lote) campo(colDirX, y, 'LOTE', dados.lote, larguraColDir)

  // QR no canto inferior direito — payload explícito (`dados.qr`) ou o padrão montado a
  // partir dos próprios dados. Na impressão térmica 203dpi o calor ESPALHA o ponto: se a
  // célula do módulo for fracionária/pequena (<3px) os módulos grudam e o QR fica
  // ilegível. Por isso: (1) a célula é INTEIRA (Math.floor) para os quadrados caírem no
  // grid de dots sem antialias; (2) reservamos "quiet zone" (borda branca de 1 módulo) que
  // todo leitor exige; (3) o payload padrão é curto (ver textoPadraoQr) para o QR ter
  // poucos módulos e a célula sobrar grande. O tamanho é o maior que cabe sem encostar nos
  // campos acima.
  const m = matrizQr(dados.qr || textoPadraoQr(dados, config))
  const n = m.length
  const alvo = Math.min(100, Math.max(60, Math.round(altura * 0.4)))
  // +2 = a quiet zone (1 módulo de cada lado). Célula inteira, mínimo 2px.
  const cel = Math.max(2, Math.floor(alvo / (n + 2)))
  const quiet = cel
  const bloco = n * cel + quiet * 2 // QR + quiet zone dos dois lados
  const bx = largura - M - bloco
  const by = altura - M - bloco
  // Fundo branco do bloco inteiro = quiet zone garantida (contraste mesmo sobre qualquer
  // coisa desenhada antes).
  ctx.fillStyle = '#fff'
  ctx.fillRect(bx, by, bloco, bloco)
  ctx.fillStyle = '#000'
  const qrX = bx + quiet
  const qrY = by + quiet
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) ctx.fillRect(qrX + c * cel, qrY + r * cel, cel, cel)
    }
  }

  // Instruções de conservação (opcional): uma linha à esquerda do QR, embaixo, truncada
  // na largura disponível até o QR (`qrX - xConteudo`). Este é o modelo mais apertado dos
  // 4 — a faixa lateral já come largura à esquerda (quando ligada) e o QR já ocupa o canto
  // inferior direito — então, se não sobrar espaço horizontal utilizável (< ~40px) ou
  // vertical (a linha cairia por cima da última linha de campos, em `y`), OMITIMOS a
  // instrução em vez de desenhar algo ilegível/sobreposto.
  if (campos.instrucoes && campos.instrucoesTexto) {
    const larguraDisp = qrX - xConteudo - 6
    const yInstr = altura - M - Math.round(10 * k)
    if (larguraDisp > 40 && yInstr > y + Math.round(20 * k)) {
      setFonte(ctx, 8, k)
      ctx.fillText(ajustar(ctx, campos.instrucoesTexto, larguraDisp), xConteudo, yInstr)
    }
  }
}

// Payload legível do QR quando `dados.qr` não vem explícito: qualquer leitor de QR comum
// (câmera de celular) lê este texto direto, sem internet e sem página de rastreabilidade
// (decisão da Fatia A — ver docs/superpowers/specs/2026-07-16-etiquetas-modelos-config-design.md).
// Payload CURTO de propósito: numa etiqueta térmica de 48mm, um QR só é escaneável com
// poucos módulos (célula ≥3px). Enfiar 8 linhas (nome+datas+conservação+lote+responsável+
// loja+CNPJ) faz o QR passar de ~50 módulos e virar borrão. Ficam os 3 dados de
// rastreabilidade essenciais (item, validade, lote); o resto já está impresso em texto na
// própria etiqueta, ao lado do QR.
function textoPadraoQr(dados, config) { // eslint-disable-line no-unused-vars
  return [
    dados.nomeItem,
    `Val ${fmt(dados.validoAte)}`,
    dados.lote ? `Lote ${dados.lote}` : null,
  ].filter(Boolean).join('\n')
}

// COMPACTO — pensado para rolos pequenos (30mm): nome centralizado, datas em 2 colunas,
// faixa de conservação e um rodapé de uma linha só. Sem "PREP."/"VAL." por extenso, sem
// espaço sobrando.
function desenharCompacto(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const campos = camposDe(config)
  const M = 6
  let y = M

  // nome, centralizado
  ctx.textAlign = 'center'
  setFonte(ctx, 14, k, { bold: true })
  ctx.fillText(ajustar(ctx, dados.nomeItem, largura - M * 2), largura / 2, y)
  ctx.textAlign = 'left'
  y += Math.round(20 * k)

  // régua
  ctx.fillRect(M, y, largura - M * 2, 1)
  y += Math.round(6 * k)

  // 2 colunas: MANIP | VALIDADE
  const colDirX = largura / 2 + 4
  const larguraCol = largura / 2 - M - 4
  setFonte(ctx, 9, k, { bold: true })
  ctx.fillText('MANIP', M, y)
  ctx.fillText('VALIDADE', colDirX, y)
  y += Math.round(11 * k)
  setFonte(ctx, 12, k)
  ctx.fillText(ajustar(ctx, fmt(dados.manipuladoEm), larguraCol), M, y)
  ctx.fillText(ajustar(ctx, fmt(dados.validoAte), larguraCol), colDirX, y)
  y += Math.round(18 * k)

  // faixa preta: conservação · temperatura (opcional). O rodapé abaixo é ANCORADO na base
  // (independente de `y`), então pular a faixa aqui não deixa buraco em cima dele — só
  // sobra o mesmo espaço em branco que já haveria com o campo ligado numa etiqueta alta.
  if (campos.conservacao) {
    const alturaFaixa = Math.round(16 * k)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, y, largura, alturaFaixa)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    setFonte(ctx, 11, k, { bold: true })
    ctx.fillText(ajustar(ctx, `${dados.conservacaoLabel} · ${dados.tempLabel}`, largura - M * 2), largura / 2, y + Math.round(3 * k))
    ctx.textAlign = 'left'
    ctx.fillStyle = '#000'
  }

  // rodapé: loja · CNPJ (opcional) · lote (opcional) · responsável (opcional), numa linha
  // só, ancorado na base. Instruções (opcional) são uma 2ª linha abaixo dele — como o
  // rodapé é ancorado na base (não sequencial a partir de `y`), pra abrir espaço pra essa
  // 2ª linha SEM sobrepor a margem inferior a gente sobe o próprio rodapé (rodapeY) em vez
  // de tentar empurrar algo para "além" da margem, que sairia do canvas.
  const rodapePartes = [config?.razaoSocial || '']
  if (campos.cnpj && config?.cnpj) rodapePartes.push(`CNPJ ${config.cnpj}`)
  if (campos.lote) rodapePartes.push(`Lote ${dados.lote}`)
  if (campos.responsavel) rodapePartes.push(dados.responsavelNome)
  const rodape = rodapePartes.filter(Boolean).join(' · ')
  const temInstrucoes = campos.instrucoes && campos.instrucoesTexto
  const rodapeY = altura - M - Math.round(9 * k) - (temInstrucoes ? Math.round(10 * k) : 0)
  setFonte(ctx, 8, k)
  ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, rodapeY)
  if (temInstrucoes) {
    ctx.textAlign = 'center'
    ctx.fillText(ajustar(ctx, campos.instrucoesTexto, largura - M * 2), largura / 2, rodapeY + Math.round(10 * k))
    ctx.textAlign = 'left'
  }
}

// Amostra fictícia para a prévia da Config e o teste de impressão: nenhuma das duas tem
// (ou deveria depender de) um item real selecionado. Data fixa (não `Date.now()`) de
// propósito — uma prévia que muda a cada render/minuto é ruído visual, e o teste do Step 6
// precisa de determinismo.
export function dadosExemplo() {
  const agora = new Date(2026, 5, 17, 14, 30) // fixo: sem Date.now() para prévia estável
  return {
    nomeItem: 'Molho especial da casa', tempLabel: '0 a 4 °C', conservacaoLabel: 'Resfriado',
    manipuladoEm: agora, validoAte: new Date(2026, 5, 22, 14, 30), responsavelNome: 'Diego Alves',
    lote: 'MOL-170626-01', qr: null,
  }
}
