// Único arquivo do projeto que sabe que a impressora é uma Niimbot B1. Se um dia
// trocar de modelo, é aqui que mexe — o resto do app só conhece
// bluetoothDisponivel / conectar / conectado / desconectar / imprimir.
//
// A B1 não recebe texto (não fala TSPL/ZPL/ESC-POS): ela recebe bitmap 1-bit por um
// protocolo proprietário (v3), engenharia-reversado pela comunidade. 203 dpi, cabeça
// de 384 px = 48 mm.
//
// Web Bluetooth só existe em Chrome/Edge (Android e desktop) sobre HTTPS ou localhost.
// No iPhone NÃO tem: a Apple obriga todo navegador do iOS a usar o WebKit, então nem o
// Chrome do iOS serve. É limitação da plataforma, não do driver — a UI deve avisar.
//
// A lib `niimbot-web-bluetooth` NÃO exporta nada (nem ESM, nem CommonJS): é um script
// clássico que se instala em `window.Niimbot` via IIFE. Por isso o import abaixo é só
// pelo efeito colateral e a API é lida do global.
//
// O import é ESTÁTICO de propósito: conectar() precisa chamar requestDevice() ainda
// dentro do gesto do usuário, e esperar um chunk baixar (import dinâmico) no meio do
// caminho pode estourar o gesto e o navegador recusa abrir o seletor de dispositivos.
import 'niimbot-web-bluetooth'

// Cabeça de impressão da B1: 384 px = 48 mm a 203 dpi. A etiqueta é desenhada nessa
// largura exata; a altura varia com o tamanho do rolo.
export const LARGURA_PX = 384

const DPI_B1 = 203

// Espelha a entrada "b1" do registry.json da lib. Não importamos o registry.json
// porque `density` é escolha nossa (depende do rolo/etiqueta que a loja usa), e não
// um parâmetro para herdar cegamente da lib.
//   name_prefixes: filtra o seletor do navegador pelo nome anunciado no BLE
//   task "b1":     sequência de comandos da linha B1 (protocolo 3), != "v4" do B1 Pro
//   density 1-5:   3 é o padrão validado pela lib
const MODELO_B1 = {
  name_prefixes: ['B1'],
  task: 'b1',
  density: 3,
  label_type: 1,
  speed: 1,
}

// Pega a API global instalada pelo import acima.
function niimbot() {
  const api = globalThis.Niimbot
  if (!api) throw new Error('O driver da impressora não carregou. Recarregue a página.')
  return api
}

export function bluetoothDisponivel() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth
}

// Precisa ser chamado a partir de um gesto do usuário (clique) — exigência do
// navegador para abrir o seletor de dispositivos.
export async function conectar() {
  if (!bluetoothDisponivel()) {
    throw new Error('Este navegador não tem Bluetooth. Use o Chrome no Android.')
  }
  // identify() conecta e pergunta o modelo à impressora SEM imprimir nada.
  const info = await niimbot().identify(MODELO_B1)

  // A B1 e a B1 Pro anunciam o MESMO nome no BLE ("B1…"), então o usuário consegue
  // escolher a errada no seletor e só descobriria na hora de imprimir. A B1 Pro é 300
  // dpi e usa outra sequência de comandos: a etiqueta sairia no tamanho errado. Aqui
  // recusamos na hora da conexão, com mensagem clara.
  // Impressora não identificada (task/dpi nulos) passa: a lib confia no chamador e nós
  // também — não dá para saber se é incompatível.
  const incompativel =
    (info?.task != null && info.task !== 'b1') ||
    (info?.dpi != null && info.dpi !== DPI_B1)
  if (incompativel) {
    desconectar()
    throw new Error(
      `A impressora escolhida é uma ${info.label} (${info.dpi} dpi) e este sistema imprime na Niimbot B1 (203 dpi). Conecte a B1.`,
    )
  }

  return { nome: info?.label || info?.deviceName || 'Niimbot B1' }
}

// ATENÇÃO: `Niimbot.printer` só é zerado por disconnect(). Se a impressora for
// desligada ou sair de alcance, a lib zera a característica BLE mas não o printer —
// então isto responde "já identificamos uma impressora nesta sessão", não "o link BLE
// está vivo agora". A confirmação real só vem ao imprimir.
export function conectado() {
  return !!globalThis.Niimbot?.printer
}

export function desconectar() {
  // disconnect() é async na lib mas nunca rejeita (trata tudo internamente); não há o
  // que esperar, então mantemos a assinatura síncrona.
  try {
    globalThis.Niimbot?.disconnect()
  } catch {
    /* já caiu */
  }
}

// Canvas → 1-bit, MSB-first, uma linha por entrada. Threshold fixo em 128 e sem
// dithering: é o que o protocolo espera, e dithering em etiqueta de 203dpi vira
// borrão ilegível.
//
// NOTA: quem converte o bitmap de verdade na hora de imprimir é a própria lib
// (imageToPacked), com a mesma regra (luminância < 128 = preto, MSB-first). Esta
// função é lógica NOSSA, mantida exportada porque é a única parte do driver testável
// sem a impressora na mão — e é a especificação viva do que esperamos da lib.
export function canvasParaBitmap(canvas) {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, width, height)
  const bytesPorLinha = Math.ceil(width / 8)
  const linhas = []
  for (let y = 0; y < height; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Luminância padrão; alfa 0 conta como branco (fundo não impresso).
      const lum = data[i + 3] === 0 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (lum < 128) linha[x >> 3] |= 0x80 >> (x & 7) // MSB-first
    }
    linhas.push(linha)
  }
  return { largura: width, altura: height, linhas }
}

// A lib busca a imagem por URL (fetch → blob → createImageBitmap), então entregamos o
// canvas como blob: URL. PNG porque é sem perdas: artefato de JPEG perto do threshold
// de 128 viraria pixel preto/branco trocado na etiqueta.
function canvasParaBlobPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem da etiqueta.'))),
      'image/png',
    )
  })
}

// `copias` são declaradas uma vez e a imagem sobe UMA vez — a impressora repete
// sozinha. Muito mais rápido do que mandar N vezes.
// `deslocamentoY` empurra a impressão para baixo (px, eixo do papel); serve para
// calibrar a posição quando a etiqueta sai torta/deslocada no rolo real.
export async function imprimir(canvas, { copias = 1, deslocamentoY = 0 } = {}) {
  // A lib conecta sozinha se preciso, mas aí o seletor de dispositivos abriria fora de
  // um gesto do usuário e o navegador recusaria com um erro críptico. Exigimos conectar()
  // antes para que a falha seja clara.
  if (!conectado()) throw new Error('Impressora não conectada.')
  if (canvas.width !== LARGURA_PX) {
    throw new Error(`A etiqueta precisa ter ${LARGURA_PX}px de largura (a cabeça da B1 tem 48mm).`)
  }
  if (!canvas.height) throw new Error('A etiqueta está vazia (altura zero).')

  const blob = await canvasParaBlobPng(canvas)
  const url = URL.createObjectURL(blob)
  try {
    await niimbot().printImage(url, {
      model: MODELO_B1,
      // size é a geometria em pixels da etiqueta. dpi vai junto para a lib abortar
      // antes de imprimir se a impressora conectada não for de 203 dpi.
      size: { w_px: canvas.width, h_px: canvas.height, dpi: DPI_B1 },
      copies: copias,
      offsetY: deslocamentoY,
    })
  } finally {
    // Sem isto o blob fica preso na memória até a aba fechar — num quiosque que imprime
    // o dia inteiro, vaza.
    URL.revokeObjectURL(url)
  }
}
