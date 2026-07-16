// Desenha a etiqueta ANVISA num canvas. Só desenha — não conecta Bluetooth, não imprime,
// não busca dados no backend. A prévia da tela (quiosque) e o bitmap que vai para a
// impressora (niimbotB1.imprimir, que lê o MESMO canvas via canvas.toBlob) chamam esta
// função: o que o usuário vê na tela é literalmente o que sai no papel, porque é o mesmo
// desenho — não uma reimplementação paralela que pode divergir.
import { LARGURA_PX } from './niimbotB1'

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

// dados: { nomeItem, tempLabel, conservacaoLabel, manipuladoEm: Date, validoAte: Date,
//          responsavelNome, lote, qrImg? }
// config: { alturaMm, razaoSocial, cnpj, sif, sie }
//
// QR — FICOU PARA A v2: hoje nada nesta base passa `qrImg`, não existe gerador de QR no
// projeto (a dep `qrcode` foi removida por não ter uso) e a consulta pública por lote que
// o QR abriria saiu do backend junto. O que sobrou aqui é só o encaixe, de propósito: é
// inerte sem `qrImg` e já está testado, então a v2 liga o QR sem remexer no desenho.
//
// O contrato, para quando isso voltar: `qrImg` é OPCIONAL e precisa chegar já CARREGADO
// (um HTMLImageElement/ImageBitmap pronto para ctx.drawImage — ex.: `new Image()` com
// `await` no `onload`, ou `createImageBitmap`). Este módulo não gera QR nem decide o que
// ele codifica — isso é de quem CHAMA desenharEtiqueta, depois de gerar a imagem por
// fora. Sem `qrImg` o espaço simplesmente não é reservado: o texto usa a largura inteira
// da etiqueta, em vez de deixar um vão em branco.
export function desenharEtiqueta(canvas, dados, config) {
  const { largura, altura } = dimensoes(config)
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')

  // Fundo branco opaco: impressão térmica 1-bit não tem transparência, e é o mesmo fundo
  // que niimbotB1.canvasParaBitmap (e a lib, na hora de imprimir de verdade) esperam para
  // compor antes do threshold — ver o comentário de canvasParaBitmap em niimbotB1.js.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const M = 8 // margem — nada encosta na borda do rolo
  const qr = dados?.qrImg ? 64 : 0 // lado do QR, só reservado quando já há imagem pronta
  const larguraTexto = largura - M * 2 - (qr ? qr + 6 : 0)
  let y = M

  // Nome do item — o que a cozinha lê de longe, com a etiqueta colada num pote ou saco.
  // Fonte grande e em negrito de propósito: é térmica 1-bit, sem antialias útil — fonte
  // pequena demais vira borrão ilegível no vapor da cozinha.
  ctx.font = 'bold 22px monospace'
  ctx.fillText(ajustar(ctx, dados.nomeItem, larguraTexto), M, y)
  y += 26

  // Conservação (ex.: "Resfriado · 0-4°C")
  ctx.font = 'bold 13px monospace'
  ctx.fillText(ajustar(ctx, `${dados.conservacaoLabel} · ${dados.tempLabel}`, larguraTexto), M, y)
  y += 18

  // Datas — o motivo da etiqueta existir: ANVISA exige preparo e validade legíveis no
  // alimento manipulado.
  ctx.font = '14px monospace'
  ctx.fillText(`PREP.: ${fmt(dados.manipuladoEm)}`, M, y)
  y += 17
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`VAL.:  ${fmt(dados.validoAte)}`, M, y)
  y += 19

  // Responsável + lote. O lote é a chave de rastreabilidade: liga a etiqueta impressa ao
  // registro gravado no banco (backend/etiquetas.js, Task 1).
  ctx.font = '11px monospace'
  ctx.fillText(ajustar(ctx, `RESP: ${dados.responsavelNome} · LOTE ${dados.lote}`, larguraTexto), M, y)
  // (sem `y += ` aqui: é o último bloco que usa `y` — o rodapé abaixo se ancora em
  // `altura`, não empilha a partir daqui. Um `y +=` morto reprovava o eslint
  // no-useless-assignment.)

  // Rodapé: identificação do estabelecimento, ancorado na BASE do canvas (calculado a
  // partir de `altura`, não empilhado depois do conteúdo acima) — assim a posição não
  // pula conforme o texto de cima varia em tamanho.
  const rodape = [config?.razaoSocial, config?.cnpj ? `CNPJ ${config.cnpj}` : null,
    config?.sif ? `SIF ${config.sif}` : null, config?.sie ? `SIE ${config.sie}` : null]
    .filter(Boolean).join(' · ')
  if (rodape) {
    ctx.font = '10px monospace'
    ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, altura - M - 11)
  }

  // QR no canto superior direito — só desenha se `qrImg` já chegou carregado (ver
  // comentário da assinatura, acima). Nunca tenta carregar nada por conta própria.
  if (dados?.qrImg) {
    ctx.drawImage(dados.qrImg, largura - M - qr, M, qr, qr)
  }
}
