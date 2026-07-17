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

// Dimensões finais do canvas para um `config` de rolo. Exportada separada de
// desenharEtiqueta porque quem monta a UI (prévia, canvas de impressão) precisa saber o
// tamanho ANTES de desenhar, para criar/redimensionar o elemento <canvas>.
export function dimensoes(config) {
  return { largura: LARGURA_PX, altura: Math.round((config?.alturaMm || 30) * DOTS_POR_MM) }
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

// CLASSICO — o layout original (era o único), só reorganizado em função própria e com a
// escala de fonte `k`: cabeçalho de nome → conservação/temperatura → datas → responsável/
// lote → rodapé com a identificação do estabelecimento, ancorado na base do canvas.
function desenharClassico(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const M = 8 // margem — nada encosta na borda do rolo
  const larguraTexto = largura - M * 2
  let y = M

  // Nome do item — o que a cozinha lê de longe, com a etiqueta colada num pote ou saco.
  // Fonte grande e em negrito de propósito: é térmica 1-bit, sem antialias útil — fonte
  // pequena demais vira borrão ilegível no vapor da cozinha.
  ctx.font = `bold ${Math.round(22 * k)}px monospace`
  ctx.fillText(ajustar(ctx, dados.nomeItem, larguraTexto), M, y)
  y += Math.round(26 * k)

  // Conservação (ex.: "Resfriado · 0-4°C")
  ctx.font = `bold ${Math.round(13 * k)}px monospace`
  ctx.fillText(ajustar(ctx, `${dados.conservacaoLabel} · ${dados.tempLabel}`, larguraTexto), M, y)
  y += Math.round(18 * k)

  // Datas — o motivo da etiqueta existir: ANVISA exige preparo e validade legíveis no
  // alimento manipulado.
  ctx.font = `${Math.round(14 * k)}px monospace`
  ctx.fillText(`PREP.: ${fmt(dados.manipuladoEm)}`, M, y)
  y += Math.round(17 * k)
  ctx.font = `bold ${Math.round(14 * k)}px monospace`
  ctx.fillText(`VAL.:  ${fmt(dados.validoAte)}`, M, y)
  y += Math.round(19 * k)

  // Responsável + lote. O lote é a chave de rastreabilidade: liga a etiqueta impressa ao
  // registro gravado no banco.
  ctx.font = `${Math.round(11 * k)}px monospace`
  ctx.fillText(ajustar(ctx, `RESP: ${dados.responsavelNome} · LOTE ${dados.lote}`, larguraTexto), M, y)

  // Rodapé: identificação do estabelecimento, ancorado na BASE do canvas (calculado a
  // partir de `altura`, não empilhado depois do conteúdo acima) — assim a posição não
  // pula conforme o texto de cima varia em tamanho.
  const rodape = [config?.razaoSocial, config?.cnpj ? `CNPJ ${config.cnpj}` : null,
    config?.sif ? `SIF ${config.sif}` : null, config?.sie ? `SIE ${config.sie}` : null]
    .filter(Boolean).join(' · ')
  if (rodape) {
    ctx.font = `${Math.round(10 * k)}px monospace`
    ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, altura - M - Math.round(11 * k))
  }
}

// VALIDADE — a data de validade é o dado mais importante desta etiqueta (é a pergunta que
// o cozinheiro faz olhando o pote: "ainda posso usar isso?"), então ela ganha a fonte
// maior de todo o desenho, centralizada no meio da etiqueta.
function desenharValidade(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const M = 8
  let y = M

  // topo: razão social (miúda, à esquerda) + selo de conservação (à direita)
  ctx.font = `${Math.round(10 * k)}px monospace`
  ctx.textAlign = 'left'
  ctx.fillText(ajustar(ctx, config?.razaoSocial || '', largura * 0.6), M, y)
  ctx.font = `bold ${Math.round(10 * k)}px monospace`
  ctx.textAlign = 'right'
  ctx.fillText(String(dados.conservacaoLabel || '').toUpperCase(), largura - M, y)
  ctx.textAlign = 'left'
  y += Math.round(16 * k)

  // centro: "VÁLIDO ATÉ" + data/hora em destaque
  ctx.textAlign = 'center'
  ctx.font = `${Math.round(11 * k)}px monospace`
  ctx.fillStyle = '#555'
  ctx.fillText('VÁLIDO ATÉ', largura / 2, y)
  ctx.fillStyle = '#000'
  y += Math.round(15 * k)
  ctx.font = `bold ${Math.round(28 * k)}px monospace`
  ctx.fillText(fmt(dados.validoAte), largura / 2, y)
  y += Math.round(36 * k)

  // nome do item, abaixo da validade
  ctx.font = `bold ${Math.round(16 * k)}px monospace`
  ctx.fillText(ajustar(ctx, dados.nomeItem, largura - M * 2), largura / 2, y)
  ctx.textAlign = 'left'

  // rodapé: manipulação/lote/responsável numa linha só, ancorado na base
  ctx.font = `${Math.round(10 * k)}px monospace`
  const rodape = `Manip ${fmt(dados.manipuladoEm)} · Lote ${dados.lote} · ${dados.responsavelNome}`
  ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, altura - M - Math.round(11 * k))
}

// LATERAL_QR — faixa preta vertical à esquerda com a conservação (texto girado, lida
// virando a etiqueta de lado — comum em faixas de identificação de prateleira/caixa),
// campos em 2 colunas para caber mais dado na área que sobra, e QR no canto inferior
// direito com o mesmo conteúdo em texto (payload offline, sem servidor de rastreio).
function desenharLateralQr(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const M = 8
  const FAIXA = 34 // largura da faixa preta lateral
  const xConteudo = FAIXA + 10 // ≈44 — onde a área útil começa

  // faixa preta vertical + conservação girada -90°
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, FAIXA, altura)
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.round(12 * k)}px monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.translate(Math.round(FAIXA / 2) + 4, altura - 8)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(String(dados.conservacaoLabel || '').toUpperCase(), 0, 0)
  ctx.restore()
  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  let y = M
  const larguraConteudo = largura - xConteudo - M

  // cabeçalho: razão social · CNPJ
  ctx.font = `${Math.round(10 * k)}px monospace`
  ctx.fillText(ajustar(ctx, `${config?.razaoSocial || ''} · CNPJ ${config?.cnpj || ''}`, larguraConteudo), xConteudo, y)
  y += Math.round(15 * k)

  // nome do item
  ctx.font = `bold ${Math.round(18 * k)}px monospace`
  ctx.fillText(ajustar(ctx, dados.nomeItem, largura - xConteudo - 8), xConteudo, y)
  y += Math.round(24 * k)

  // campos em 2 colunas: VALIDADE/MANIPULAÇÃO à esquerda, RESPONSÁVEL/LOTE à direita
  const colEsqX = xConteudo
  const colDirX = xConteudo + Math.round(larguraConteudo / 2)
  const larguraCol = Math.round(larguraConteudo / 2) - 6

  const campo = (x, yy, rotulo, valor) => {
    ctx.font = `bold ${Math.round(9 * k)}px monospace`
    ctx.fillText(rotulo, x, yy)
    ctx.font = `${Math.round(12 * k)}px monospace`
    ctx.fillText(ajustar(ctx, valor, larguraCol), x, yy + Math.round(12 * k))
  }
  campo(colEsqX, y, 'VALIDADE', fmt(dados.validoAte))
  campo(colDirX, y, 'RESPONSÁVEL', dados.responsavelNome)
  y += Math.round(26 * k)
  campo(colEsqX, y, 'MANIPULAÇÃO', fmt(dados.manipuladoEm))
  campo(colDirX, y, 'LOTE', dados.lote)

  // QR no canto inferior direito — payload explícito (`dados.qr`) ou o padrão montado a
  // partir dos próprios dados da etiqueta.
  const m = matrizQr(dados.qr || textoPadraoQr(dados, config))
  const n = m.length
  const lado = Math.min(96, altura / 2)
  const qrX = largura - M - lado
  const qrY = altura - M - lado
  const cel = lado / n
  ctx.fillStyle = '#000'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) ctx.fillRect(qrX + c * cel, qrY + r * cel, Math.ceil(cel), Math.ceil(cel))
    }
  }
}

// Payload legível do QR quando `dados.qr` não vem explícito: qualquer leitor de QR comum
// (câmera de celular) lê este texto direto, sem internet e sem página de rastreabilidade
// (decisão da Fatia A — ver docs/superpowers/specs/2026-07-16-etiquetas-modelos-config-design.md).
function textoPadraoQr(dados, config) {
  return [
    dados.nomeItem,
    `Validade: ${fmt(dados.validoAte)}`,
    `Manipulado: ${fmt(dados.manipuladoEm)}`,
    `Conservação: ${dados.conservacaoLabel}`,
    `Lote: ${dados.lote}`,
    `Responsável: ${dados.responsavelNome}`,
    config?.razaoSocial ? `Loja: ${config.razaoSocial}` : null,
    config?.cnpj ? `CNPJ: ${config.cnpj}` : null,
  ].filter(Boolean).join('\n')
}

// COMPACTO — pensado para rolos pequenos (30mm): nome centralizado, datas em 2 colunas,
// faixa de conservação e um rodapé de uma linha só. Sem "PREP."/"VAL." por extenso, sem
// espaço sobrando.
function desenharCompacto(ctx, dados, config, dims, k) {
  const { largura, altura } = dims
  const M = 6
  let y = M

  // nome, centralizado
  ctx.textAlign = 'center'
  ctx.font = `bold ${Math.round(14 * k)}px monospace`
  ctx.fillText(ajustar(ctx, dados.nomeItem, largura - M * 2), largura / 2, y)
  ctx.textAlign = 'left'
  y += Math.round(20 * k)

  // régua
  ctx.fillRect(M, y, largura - M * 2, 1)
  y += Math.round(6 * k)

  // 2 colunas: MANIP | VALIDADE
  const colDirX = largura / 2 + 4
  const larguraCol = largura / 2 - M - 4
  ctx.font = `bold ${Math.round(9 * k)}px monospace`
  ctx.fillText('MANIP', M, y)
  ctx.fillText('VALIDADE', colDirX, y)
  y += Math.round(11 * k)
  ctx.font = `${Math.round(12 * k)}px monospace`
  ctx.fillText(ajustar(ctx, fmt(dados.manipuladoEm), larguraCol), M, y)
  ctx.fillText(ajustar(ctx, fmt(dados.validoAte), larguraCol), colDirX, y)
  y += Math.round(18 * k)

  // faixa preta: conservação · temperatura
  const alturaFaixa = Math.round(16 * k)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, y, largura, alturaFaixa)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = `bold ${Math.round(11 * k)}px monospace`
  ctx.fillText(ajustar(ctx, `${dados.conservacaoLabel} · ${dados.tempLabel}`, largura - M * 2), largura / 2, y + Math.round(3 * k))
  ctx.textAlign = 'left'
  ctx.fillStyle = '#000'

  // rodapé: loja · CNPJ · lote · responsável, numa linha só, ancorado na base
  ctx.font = `${Math.round(8 * k)}px monospace`
  const rodape = `${config?.razaoSocial || ''} · CNPJ ${config?.cnpj || ''} · Lote ${dados.lote} · ${dados.responsavelNome}`
  ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, altura - M - Math.round(9 * k))
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
