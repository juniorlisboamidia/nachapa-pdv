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

// Espelha os campos de IMPRESSORA da entrada "models.b1" do registry.json da lib. Não
// importamos o registry.json porque `density` é escolha nossa (depende do rolo/etiqueta
// que a loja usa), e não um parâmetro para herdar cegamente da lib.
//   name_prefixes: VAZIO de propósito. Com prefixo, a lib filtra o seletor por NOME
//     (`namePrefix`), que no Web Bluetooth do Android é frágil — depende de o nome vir no
//     pacote de anúncio, e alguns Chrome/Android NÃO captam (o celular achava a B1, o
//     tablet não). Vazio, a lib cai no filtro por SERVIÇO (`{ services: [SVC_UUID] }`), e o
//     UUID da Niimbot vem sempre no anúncio → acha a B1 em qualquer aparelho. A distinção
//     B1 × B1 Pro deixa de ser pelo nome e passa a ser a checagem de task/dpi pós-conexão
//     (abaixo, em conectar()), que já existia e é o filtro que de fato importa.
//   task "b1":     sequência de comandos da linha B1 (protocolo 3), != "v4" do B1 Pro
//   density 1-5:   3 é o padrão validado pela lib
// A GEOMETRIA da etiqueta NÃO mora aqui: no registry ela é uma entrada separada
// ("sizes.T50x30_b1"), e o que precisamos dela está em OFFSET_Y_PX, abaixo.
const MODELO_B1 = {
  name_prefixes: [], // vazio → filtra por SERVIÇO (SVC_UUID), robusto no Android — ver comentário acima
  task: 'b1',
  density: 3,
  label_type: 1,
  speed: 1,
}

// Calibração vertical do rolo, copiada da entrada "sizes.T50x30_b1" do registry.json da
// lib — que é EXATAMENTE a nossa geometria: { w_px: 384, h_px: 240, offset_y_px: 4 },
// 50×30mm na B1 a 203 dpi (o README da lib documenta essa combinação).
//
// Por que herdar este número em vez de zero: a lib mede o offset por modelo+tamanho em
// hardware real (o registry diz "All models/sizes here are validated on real hardware")
// porque a posição em que a cabeça começa a queimar não bate com a borda física da
// etiqueta. 4px a 203dpi = 0,5mm; sem isso a impressão sai deslocada para cima no rolo e
// o rodapé (CNPJ/SIF/SIE, que é exigência sanitária) é o primeiro a ser cortado.
const OFFSET_Y_PX = 4

// Calibração da impressão POR APARELHO (localStorage): densidade térmica (1–5, quanto
// maior mais escuro) e um ajuste vertical fino em px, somado ao OFFSET_Y_PX base. Vive no
// navegador porque depende do rolo/impressora física daquele aparelho — não é preferência
// da loja (por isso não vai para o EtiquetaConfig do banco). Todo print (teste, item,
// sequência) lê daqui quando o chamador não passa valor explícito.
const CAL_KEY = 'etq-calibracao'
const DENSIDADE_PADRAO = 4
function clampDensidade(d) {
  const n = Math.round(Number(d))
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : DENSIDADE_PADRAO
}
export function calibracao() {
  try {
    const c = JSON.parse(localStorage.getItem(CAL_KEY) || '{}')
    return {
      densidade: clampDensidade(c.densidade ?? DENSIDADE_PADRAO),
      ajusteY: Number.isFinite(c.ajusteY) ? Math.trunc(c.ajusteY) : 0,
    }
  } catch {
    return { densidade: DENSIDADE_PADRAO, ajusteY: 0 }
  }
}
export function setCalibracao({ densidade, ajusteY } = {}) {
  try {
    localStorage.setItem(
      CAL_KEY,
      JSON.stringify({
        densidade: clampDensidade(densidade),
        ajusteY: Number.isFinite(Number(ajusteY)) ? Math.trunc(Number(ajusteY)) : 0,
      }),
    )
  } catch {
    /* localStorage indisponível (aba privada) — segue no padrão, sem quebrar */
  }
}

// Pega a API global instalada pelo import acima.
function niimbot() {
  const api = globalThis.Niimbot
  if (!api) throw new Error('O driver da impressora não carregou. Recarregue a página.')
  return api
}

// Os erros que a lib levanta são em inglês e falam de protocolo — o assertSelection
// dela, por exemplo, devolve coisas como `Connected printer is Niimbot B1 (task "b1",
// 203 dpi)…`. "task" e dpi são exatamente o detalhe que este arquivo existe para
// conter, e quem lê a mensagem é um cozinheiro com o celular no meio do serviço, não
// um dev. Então traduzimos para uma frase que diz O QUE FAZER e guardamos o original
// em `cause`: nada é engolido, o dev acha tudo no console.
function erroAmigavel(e, mensagem) {
  // NotFoundError = o usuário fechou o seletor sem escolher nada, ou nenhuma B1
  // apareceu na lista. É o caminho mais comum deste fluxo e o Chrome o descreve em
  // inglês ("User cancelled the requestDevice() chooser.").
  if (e?.name === 'NotFoundError') {
    return new Error(
      'Nenhuma impressora foi escolhida. Confira se a etiquetadora está ligada e perto do celular, e toque em conectar de novo.',
      { cause: e },
    )
  }
  return new Error(mensagem, { cause: e })
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
  // Alguns Chrome/Android NÃO captam o nome NEM o serviço da B1 no anúncio BLE — ela
  // aparece no seletor só pelo endereço (MAC), como "Dispositivo desconhecido". A lib
  // filtra o seletor por nome/serviço, então nesses aparelhos o seletor fica VAZIO e trava
  // (confirmado no tablet do cliente; no celular, que capta o nome, o filtro funcionava).
  // Solução: SÓ durante o identify, forçamos o requestDevice a listar TODOS os aparelhos
  // (acceptAllDevices) — a B1 aparece, o usuário escolhe, e a checagem de task/dpi abaixo
  // rejeita se não for uma B1 de verdade. requestDevice PRECISA rodar dentro do gesto do
  // usuário, então a troca é síncrona (sem await antes); restauramos no finally.
  const bt = navigator.bluetooth
  const requestDeviceOrig = bt.requestDevice
  let trocou = false
  try {
    bt.requestDevice = function (opts) {
      return requestDeviceOrig.call(bt, { acceptAllDevices: true, optionalServices: (opts && opts.optionalServices) || [] })
    }
    trocou = true
  } catch {
    /* requestDevice não-gravável neste navegador: segue com o filtro padrão da lib */
  }
  // identify() conecta e pergunta o modelo à impressora SEM imprimir nada.
  let info
  try {
    info = await niimbot().identify(MODELO_B1)
  } catch (e) {
    throw erroAmigavel(
      e,
      'Não foi possível conectar na etiquetadora. Confira se ela está ligada e perto do celular, e tente de novo.',
    )
  } finally {
    if (trocou) { try { bt.requestDevice = requestDeviceOrig } catch { /* ok */ } }
  }

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
// está vivo agora". A confirmação real só vem ao imprimir. (`printer` é getter sem
// setter: o driver não tem como corrigir a mentira por fora da lib.)
//
// CONSEQUÊNCIA PARA A UI, que é o motivo deste aviso existir: com o link caído, o
// imprimir() seguinte cai no connect() da lib, que tenta reabrir o seletor de
// dispositivos FORA de um gesto do usuário — o Chrome recusa com um erro críptico.
// Ou seja: tentar imprimir de novo sozinha não recupera. Depois de uma falha de
// impressão a UI precisa oferecer um botão "reconectar" (o toque é o gesto que o
// navegador exige) em vez de reimprimir automaticamente.
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

// DIAGNÓSTICO: abre o seletor SEM filtro nenhum (`acceptAllDevices`), pra descobrir por que
// a B1 não aparece num aparelho específico. Devolve o que o usuário escolher (nome + id) —
// NÃO conecta, é só pra ver o que o Chrome daquele aparelho enxerga de Bluetooth. Se a B1
// aparecer aqui mas não no fluxo normal, o problema é o filtro; se nem aqui aparecer, o
// Chrome do aparelho não está enxergando ela (permissão/anúncio/ocupada).
export async function escanearDiagnostico() {
  if (!bluetoothDisponivel()) {
    throw new Error('Este navegador não tem Bluetooth. Use o Chrome no Android.')
  }
  const d = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'], // serviço da Niimbot (se der pra ler depois)
  })
  return { nome: d?.name || '(sem nome)', id: d?.id || '(sem id)' }
}

// Canvas → 1-bit, MSB-first, uma linha por entrada. Threshold fixo em 128 e sem
// dithering: é o que o protocolo espera, e dithering em etiqueta de 203dpi vira
// borrão ilegível.
//
// O QUE ESTA FUNÇÃO É: uma prévia/conferência do bitmap que a lib vai gerar. Ela NÃO
// está no caminho da impressão — quem converte de verdade é a `imageToPacked` da lib,
// dentro de printImage(). Existe porque é a única parte do driver que dá para exercitar
// sem a impressora na mão (ver niimbotB1.test.js) e porque permite conferir na tela o
// que vai sair no papel.
//
// Por isso ela ESPELHA a imageToPacked, passo a passo, e só vale enquanto espelhar:
// a implementação está em node_modules/niimbot-web-bluetooth/src/niimbot.js (busque
// "imageToPacked") e PRECISA ser reconferida a cada bump de versão da lib — a lib não
// tem tipagem nem changelog que avise de mudança de regra.
//
// Os passos da lib, na ordem (niimbot.js): fillRect branco opaco → drawImage por cima,
// deslocado dy linhas → luminância 0.299/0.587/0.114 → `< 128` vira bit 1 (preto).
// Duas consequências que já nos morderam:
//   1. O alfa é RESOLVIDO na composição, não no threshold. Depois do fillRect+drawImage
//      todo pixel tem alfa 255, então o `alpha > 32` que existe na lib é código morto —
//      quem decide é a cor JÁ COMPOSTA sobre o branco. Preto com alfa 64 compõe em ~191
//      e sai BRANCO. (A versão antiga daqui thresholdava o RGB cru e dizia preto:
//      divergia da lib em todo alfa 1..254.)
//   2. `deslocamentoY` empurra a arte para baixo: as dy primeiras linhas saem brancas e
//      as dy últimas caem para fora da página. Mesmo default (0) e mesmo `| 0` da lib.
export function canvasParaBitmap(canvas, { deslocamentoY = 0 } = {}) {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, width, height)
  const bytesPorLinha = Math.ceil(width / 8)
  const dy = deslocamentoY | 0
  const linhas = []
  for (let y = 0; y < height; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    // Linha da arte que cai nesta linha do papel. Fora do intervalo = fundo branco
    // (as de cima empurradas pelo offset; as de baixo que saíram da página).
    const origem = y - dy
    if (origem >= 0 && origem < height) {
      for (let x = 0; x < width; x++) {
        const i = (origem * width + x) * 4
        // Compõe sobre branco opaco ANTES de thresholdar, como o fillRect+drawImage da
        // lib: cor * a + 255 * (1 - a), por canal. O Math.round não é enfeite: o canvas
        // da lib guarda o resultado em 8 bits, então quem cai na fronteira (ex.: 128.49
        // → 128 → luminância 127.999… → preto) só bate com a lib se arredondarmos
        // igual. Sem ele, divergíamos nesse pixel.
        const a = data[i + 3] / 255
        const branco = 255 * (1 - a)
        const r = Math.round(data[i] * a + branco)
        const g = Math.round(data[i + 1] * a + branco)
        const b = Math.round(data[i + 2] * a + branco)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        if (lum < 128) linha[x >> 3] |= 0x80 >> (x & 7) // MSB-first
      }
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
// calibrar a posição quando a etiqueta sai torta/deslocada no rolo real. NÃO tem default
// aqui de propósito — ver o `offsetY` lá embaixo: omitir é o que deixa a calibração da
// lib (OFFSET_Y_PX) valer. Um `= 0` aqui a anularia em toda chamada.
export async function imprimir(canvas, { copias = 1, deslocamentoY } = {}) {
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
      // antes de imprimir se a impressora conectada não for de 203 dpi. offset_y_px é a
      // calibração do rolo (ver OFFSET_Y_PX): é DAQUI que a lib a lê.
      size: { w_px: canvas.width, h_px: canvas.height, dpi: DPI_B1, offset_y_px: OFFSET_Y_PX },
      copies: copias,
      // A lib resolve assim: `opts.offsetY != null ? opts.offsetY : size.offset_y_px`.
      // Ou seja, QUALQUER número aqui — inclusive 0 — descarta a calibração acima. Por
      // isso `deslocamentoY` chega undefined quando o chamador não pede offset nenhum:
      // undefined cai no `!= null` e a lib usa o offset_y_px do size. Quem passar um
      // valor explícito (calibração manual do rolo) continua vencendo, que é a intenção.
      offsetY: deslocamentoY,
    })
  } catch (e) {
    // Erro daqui para baixo é da lib (BLE caiu, impressora desligou, seleção errada).
    // A saída para o usuário é sempre a mesma: reconectar num toque — ver o aviso em
    // conectado() sobre por que tentar imprimir de novo sozinho não resolve.
    throw erroAmigavel(
      e,
      'Não foi possível imprimir a etiqueta. Confira se a etiquetadora está ligada, com etiqueta e perto do celular, e conecte de novo.',
    )
  } finally {
    // Sem isto o blob fica preso na memória até a aba fechar — num quiosque que imprime
    // o dia inteiro, vaza.
    URL.revokeObjectURL(url)
  }
}
