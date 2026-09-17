// O MENU BOARD desenhado — o MESMO componente na parede e na prévia do admin.
//
// Isto é uma decisão de produto, não de reuso: se o admin desenhasse por um caminho e a TV
// por outro, o gestor aprovaria uma tela e a loja mostraria outra. Aqui existe UMA
// definição de cada layout, e a prévia é o board em tamanho real reduzido por `scale` —
// mesmo recorte de foto, mesma quebra de nome, mesma proporção de preço.
//
// ── COMO A ESCALA FUNCIONA ────────────────────────────────────────────────────────────
// O board é desenhado SEMPRE em 1920 × 1080 px absolutos e o contêiner o encolhe com
// `transform: scale(...)`. Não é truque: é o que faz "o card cabe?" ter uma resposta só.
// Com layout fluido, o admin em 600 px de largura tomaria decisões de quebra diferentes
// das da TV, e o gestor descobriria a diferença pela parede.
//
// ── O QUE ELE RECEBE ──────────────────────────────────────────────────────────────────
// Um board JÁ RESOLVIDO pelo servidor: `{ layout, titulo, produtos[], destaqueId }`, com
// preço, promoção e selo prontos. A TV não conhece nenhuma regra do Cardápio Web — quem
// resolveu foi o backend, contra o catálogo vivo.
//
// ── IDENTIDADE ────────────────────────────────────────────────────────────────────────
// A paleta do canal, escrita por CSSOM sobre os tokens `--tvmb-*` da folha. Ela vem da
// APARÊNCIA do TV Indoor (TV Indoor › Aparência), que é própria: nada de `TotemConfiguracao`
// e nada de `--tq-*`. Os canais dividem a técnica, não a identidade.
//
// `tokens` é opcional: sem ele, a folha manda — e é por isso que a TV desenha igual no cold
// start, com a rede caindo ou com a aparência corrompida.
import { useEffect, useRef, useState } from 'react'
import { aplicar as aplicarTemaTv } from '../tvIndoorTema'
// A aritmética da fila do Carrossel vive fora daqui, num módulo puro, porque é a parte
// que dá para testar de verdade — e é a parte que já derrubou a parede uma vez.
import { indiceEmCena, msPorPasso, precisaRecuar } from './carrosselFila.js'
import '../../styles/tvMenuBoard.css'

const moeda = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null)

// A foto do produto vem do CATÁLOGO, por URL — bytes nenhum foi copiado para o PDV. Se ela
// não abrir (link velho, CDN fora), o produto CONTINUA na tela com nome e preço: perder o
// item inteiro por causa de uma imagem seria deixar um buraco por um detalhe.
function Foto({ src, alt }) {
  const [quebrou, setQuebrou] = useState(false)
  if (!src || quebrou) return <span className="tvmb-foto tvmb-foto-vazia" aria-hidden="true" />
  return <img className="tvmb-foto" src={src} alt={alt ?? ''} onError={() => setQuebrou(true)} />
}

/* O SELO do produto, com a cor que vem resolvida do servidor — a mesma paleta do HUB.

   A cor da fita NÃO é sobrescrita pelo tema da TV, e isso é deliberado: "Mais pedido" tem a
   mesma cor em todo lugar do sistema porque a fita é metadado editorial compartilhado, não
   decoração da parede. O que é próprio da TV é a apresentação — etiqueta reta no canto. */
const Selo = ({ selo, mostrar = true }) => (mostrar && selo?.texto
  ? <span className="tvmb-selo" style={{ background: selo.cor }}>{selo.texto}</span>
  : null)

/* A descrição, cortada. Um item com três linhas de texto desalinha a fileira inteira, e o
   corte por CSS (`-webkit-line-clamp`) mantém a altura previsível sem truncar no meio de uma
   palavra como um `slice` faria. */
const Descricao = ({ texto, className = '' }) => (texto
  ? <p className={'tvmb-desc ' + className}>{texto}</p>
  : null)

/* O PREÇO, e a razão de ele ser um componente: a regra "nome e preço têm importância
   equivalente" e "o preço anterior não pode ficar quase invisível" precisa valer igual nos
   três layouts. Uma cópia por layout divergiria no primeiro ajuste.

   Com promoção: o anterior riscado e o selo de % na mesma linha, o preço atual embaixo —
   o mesmo desenho que o card do totem passou a usar. */
function Preco({ produto, className = '' }) {
  const tem = typeof produto?.precoAnterior === 'number'
  return (
    <span className={'tvmb-preco ' + className}>
      {tem ? (
        <span className="tvmb-preco-antes">
          <span className="tvmb-preco-de">{moeda(produto.precoAnterior)}</span>
          {typeof produto.descontoPercentual === 'number' && produto.descontoPercentual > 0
            ? <span className="tvmb-desconto">-{produto.descontoPercentual}%</span>
            : null}
        </span>
      ) : null}
      <span className={'tvmb-preco-valor' + (tem ? ' promo' : '')}>{moeda(produto?.preco) ?? '—'}</span>
    </span>
  )
}

// ── Os três layouts ─────────────────────────────────────────────────────────

/* GRADE — 4 × 2. Para cardápio visual: a foto é o que vende, o nome confirma e o preço
   fecha. Com menos de 8 produtos a grade NÃO estica os cards para preencher: ela centraliza
   o que há, porque um card de 900 px ao lado de um de 440 lê como defeito. */
const Grade = ({ produtos, ex }) => (
  <div className="tvmb-grade">
    {produtos.map((p) => (
      <article className="tvmb-card" key={p.id}>
        <div className="tvmb-card-midia">
          <Foto src={p.imagemUrl} alt="" />
          <Selo selo={p.selo} mostrar={ex.fita} />
        </div>
        <div className="tvmb-card-txt">
          <h3 className="tvmb-card-nome">{p.nome}</h3>
          {ex.descricao ? <Descricao texto={p.descricao} className="tvmb-desc-card" /> : null}
          <Preco produto={p} />
        </div>
      </article>
    ))}
  </div>
)

/* VITRINE — três produtos, e cada um recebe um terço da tela. É a Grade levada ao extremo
   oposto: menos itens, muito mais área por item. Serve a lançamento e combo, onde o que
   vende é a foto grande e não a quantidade de opções. */
const Vitrine = ({ produtos, ex }) => (
  <div className="tvmb-vitrine">
    {produtos.slice(0, 3).map((p) => (
      <article className="tvmb-vt" key={p.id}>
        <div className="tvmb-vt-midia">
          <Foto src={p.imagemUrl} alt="" />
          <Selo selo={p.selo} mostrar={ex.fita} />
        </div>
        <div className="tvmb-vt-txt">
          <h3 className="tvmb-vt-nome">{p.nome}</h3>
          {ex.descricao ? <Descricao texto={p.descricao} className="tvmb-desc-vt" /> : null}
          <Preco produto={p} className="tvmb-preco-vt" />
        </div>
      </article>
    ))}
  </div>
)

/* OFERTA — um produto só, em composição de campanha.

   A foto ocupa a metade esquerda e o texto respira na direita. É o único template em que o
   preço pode crescer, porque ele É a mensagem — mas mesmo aqui o nome do produto continua
   grande o bastante para disputar o olhar: um preço gigante sozinho vende desconto, não
   produto. */
function Oferta({ produtos, ex }) {
  const p = produtos[0]
  if (!p) return null
  return (
    <article className="tvmb-of">
      <div className="tvmb-of-midia">
        <Foto src={p.imagemUrl} alt="" />
        <Selo selo={p.selo} mostrar={ex.fita} />
      </div>
      <div className="tvmb-of-txt">
        <h3 className="tvmb-of-nome">{p.nome}</h3>
        {ex.descricao ? <Descricao texto={p.descricao} className="tvmb-desc-of" /> : null}
        <Preco produto={p} className="tvmb-preco-of" />
      </div>
    </article>
  )
}

/* LISTA — o menu tradicional, com a linha pontilhada ligando nome e preço. Sem foto: este
   layout existe justamente para o cardápio que não tem fotografia de todos os itens, e uma
   coluna de marcadores "sem imagem" seria pior do que nenhuma imagem. */
const Lista = ({ produtos, ex }) => (
  <ul className={'tvmb-lista' + (ex.imagem ? ' com-foto' : '')}>
    {produtos.map((p) => (
      <li className="tvmb-linha" key={p.id}>
        {/* A miniatura é OPCIONAL neste template: ele existe para o cardápio que não tem
            fotografia de todos os itens, e uma coluna de marcadores "sem imagem" seria pior
            do que nenhuma imagem. Quando ligada, o produto sem foto recebe o mesmo bloco
            neutro dos outros templates — a linha não desalinha. */}
        {ex.imagem ? <span className="tvmb-linha-midia"><Foto src={p.imagemUrl} alt="" /></span> : null}
        <span className="tvmb-linha-txt">
          <span className="tvmb-linha-nome">
            {p.nome}
            <Selo selo={p.selo} mostrar={ex.fita} />
          </span>
          {/* A descrição só entra quando existe: linha vazia embaixo do nome desalinha a
              lista inteira. */}
          {ex.descricao && p.descricao ? <span className="tvmb-linha-desc">{p.descricao}</span> : null}
        </span>
        <span className="tvmb-pontilhado" aria-hidden="true" />
        <Preco produto={p} className="tvmb-preco-linha" />
      </li>
    ))}
  </ul>
)

/* DESTAQUE + GRADE — um produto grande à esquerda e até quatro à direita. O destaque é o
   que o gestor escolheu; se ele ficou indisponível, o primeiro que sobrou assume (quem
   decide isso é o servidor, em `resolverMenuBoard`). */
function Destaque({ produtos, destaqueId, ex }) {
  const principal = produtos.find((p) => p.id === destaqueId) ?? produtos[0]
  const resto = produtos.filter((p) => p !== principal).slice(0, 4)
  if (!principal) return null
  return (
    <div className="tvmb-destaque">
      <article className="tvmb-hero">
        <div className="tvmb-hero-midia">
          <Foto src={principal.imagemUrl} alt="" />
          <Selo selo={principal.selo} mostrar={ex.fita} />
        </div>
        <div className="tvmb-hero-txt">
          <h3 className="tvmb-hero-nome">{principal.nome}</h3>
          {/* Só o produto GRANDE tem espaço para a descrição. Os quatro secundários não — e
              essa assimetria é a composição do template, não uma opção que alguém desligou. */}
          {ex.descricao && principal.descricao ? <p className="tvmb-hero-desc">{principal.descricao}</p> : null}
          <Preco produto={principal} className="tvmb-preco-hero" />
        </div>
      </article>
      <div className="tvmb-secundarios">
        {resto.map((p) => (
          <article className="tvmb-card" key={p.id}>
            <div className="tvmb-card-midia">
              <Foto src={p.imagemUrl} alt="" />
              <Selo selo={p.selo} mostrar={ex.fita} />
            </div>
            <div className="tvmb-card-txt">
              <h3 className="tvmb-card-nome">{p.nome}</h3>
              <Preco produto={p} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

/* CARROSSEL — o único template em MOVIMENTO, e o único que não mostra tudo de uma vez.

   Ele é MONTRA, não cardápio. Quem quer consultar preço tem o tablet; esta parede existe
   para fazer a pessoa olhar. Por isso não substitui Grade nem Lista: num cardápio geral,
   esconder itens seria defeito — aqui é a proposta.

   ── A COMPOSIÇÃO ────────────────────────────────────────────────────────────────────
   Os produtos ficam lado a lado numa pista que desliza, e o do MEIO é o que está em
   cena: maior, nítido, com nome e preço embaixo. Os vizinhos aparecem menores dos dois
   lados, e os das pontas são cortados pela borda da tela — é esse corte que diz "a
   fileira continua", e é o que faz o olho esperar o próximo em vez de achar que acabou.

   ── O TEMPO VEM DO BOARD, NÃO DE UMA CONFIGURAÇÃO NOVA ──────────────────────────────
   O board fica no ar por `duracaoSegundos` e depois a playlist troca. Se o passo tivesse
   um tempo fixo, seis produtos a 4 s dariam 24 s dentro de um board de 20 s: os dois
   últimos nunca chegariam ao meio, e ninguém entenderia por quê — nem o gestor, que no
   editor vê a pista girando em laço, sem a troca que corta o ciclo na parede. Dividindo
   o tempo do board pelos produtos, cada um passa pelo centro uma vez e o ciclo fecha
   quando o board sai.

   O PISO existe para o caso extremo: 5 s (o mínimo) com seis produtos daria 833 ms por
   passo, rápido demais para ler de longe. Aí o ciclo não fecha e os últimos não chegam ao
   centro — preferível a uma fileira que ninguém acompanha. O editor avisa quando isso
   vai acontecer.

   ── POR QUE A PISTA INTEIRA EXISTE DE UMA VEZ ───────────────────────────────────────
   Todos os cards ficam montados e o que muda é o deslocamento da pista. Renderizar só os
   visíveis obrigaria a montar o próximo no instante da troca, com a foto ainda
   carregando — e o que se veria na parede seria um buraco entrando em cena. */
export const MS_MINIMO_SLIDE = 1600
// Quanto dura o deslize. Vive aqui porque o JS precisa do mesmo número que o CSS para
// saber quando a transição acabou — e é nesse instante que a pista se reposiciona.
export const MS_DESLIZE = 760

function Carrossel({ produtos, ex, duracaoSegundos }) {
  const itens = produtos.slice(0, 10)
  const n = itens.length
  /* `passo` só CRESCE, de 0 a n, e volta a 0 sem que ninguém veja. Ele não é o índice do
     produto: é a posição na pista. */
  const [passo, setPasso] = useState(0)
  const [deslizando, setDeslizando] = useState(true)
  const ativo = indiceEmCena(passo, n)
  const emCena = itens[ativo]

  useEffect(() => {
    if (n < 2) return undefined
    const ms = msPorPasso(duracaoSegundos, n, MS_MINIMO_SLIDE)
    const t = setInterval(() => { setDeslizando(true); setPasso((v) => v + 1) }, ms)
    return () => clearInterval(t)
  }, [n, duracaoSegundos])

  if (!n) return null

  /* ── A FILA CONTÍNUA ────────────────────────────────────────────────────────────────
     A lista é desenhada TRÊS vezes e a pista fica sempre no bloco do meio. É o que tira
     os dois vazios: no primeiro produto já existem dez cards à esquerda, e no último,
     dez à direita. Sem isso, a tela abria com metade da fila e terminava com a outra
     metade faltando.

     A volta é invisível de graça, e por uma coincidência que vale explicar: a posição
     `n + n` mostra exatamente o mesmo que a posição `n`, porque a lista é a mesma. Então,
     assim que o deslize até lá termina, a pista recua n posições SEM transição — e o que
     está na tela não muda um pixel. Nenhum fade, nenhuma pausa, nenhum truque de opacidade.

     O gatilho é `onTransitionEnd`, e não um timer: assim o recuo acontece quando a
     animação realmente acabou, inclusive se o navegador da TV atrasar um quadro. */
  const aoFimDoDeslize = (e) => {
    /* ⚠️ `transitionend` BORBULHA. Os trinta cards da trilha também transicionam
       (`transform` e `opacity`), então sem este filtro o recuo rodava dezenas de vezes a
       cada passo — e cada chamada subtraía `n` outra vez. O passo despencava para
       negativo, o produto em cena virava `undefined` e a TV ficava branca.

       Duas condições, e as duas importam: `target === currentTarget` descarta os cards, e
       a propriedade descarta o `opacity` da própria pista caso alguém a anime um dia. */
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    if (!precisaRecuar(passo, n)) return
    setDeslizando(false)
    setPasso((v) => v - n)
  }

  const trilha = [...itens, ...itens, ...itens]

  return (
    <div className="tvmb-cr">
      {/* O HALO atrás do produto em cena. A `key` é o id do produto, e é ela que faz a luz
          reacender a cada troca: o nó é outro, então a animação recomeça do zero. Sem a
          key, o elemento continuaria o mesmo e a animação rodaria uma vez só, na montagem
          — o fundo acenderia no primeiro produto e ficaria parado para sempre.

          E ela não roda em laço de propósito: a animação termina num estado de repouso e
          para. Numa parede ligada doze horas por dia, um brilho pulsando sozinho cobra GPU
          o tempo inteiro sem ninguém estar olhando — a vida vem de reagir ao que já
          acontece, não de se mexer por conta própria.

          ⚠️ Ele fica FORA do palco. Dentro, o `overflow: hidden` que corta os cards nas
          pontas cortava o halo junto, e o que era para ser uma sombra se esvaindo
          terminava numa linha reta atravessando a tela. */}
      <span className="tvmb-cr-halo" key={'halo-' + emCena.id} aria-hidden="true" />
      <div className="tvmb-cr-palco">
        <div
          className={'tvmb-cr-pista' + (deslizando ? '' : ' parada')}
          style={{ '--tvmb-cr-i': n + passo }}
          onTransitionEnd={aoFimDoDeslize}
        >
          {trilha.map((p, i) => (
            <article
              // A lista se repete, então o id sozinho não identifica o nó.
              key={i + '-' + p.id}
              className={'tvmb-cr-card' + (i === n + passo ? ' ativo' : '')}
              aria-hidden={i !== n + passo}
            >
              <Foto src={p.imagemUrl} alt="" />
              <Selo selo={p.selo} mostrar={ex.fita} />
            </article>
          ))}
        </div>
      </div>
      {/* Nome e preço ficam FORA do card, embaixo do que está em cena. Dentro, eles
          disputariam com a foto do produto — que neste template é o argumento inteiro.
          A `key` troca o nó a cada produto, e é isso que faz o texto entrar junto com a
          pista em vez de aparecer trocado no card antigo. */}
      <div className="tvmb-cr-legenda" key={emCena.id}>
        <h3 className="tvmb-cr-nome">{emCena.nome}</h3>
        {ex.descricao ? <Descricao texto={emCena.descricao} className="tvmb-desc-cr" /> : null}
        <Preco produto={emCena} className="tvmb-preco-cr" />
      </div>
      {/* Os pontos não são navegação — ninguém toca numa parede. Eles dizem quanto falta,
          que é o que segura o olhar de quem chegou no meio da rodada. */}
      {n > 1 ? (
        <div className="tvmb-cr-pontos" aria-hidden="true">
          {itens.map((p, i) => (
            <span key={p.id} className={i === ativo ? 'ativo' : undefined} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

const TEMPLATES = ['GRADE', 'DESTAQUE', 'LISTA', 'VITRINE', 'OFERTA', 'CARROSSEL']

/* O que a tela mostra. Vem RESOLVIDO do servidor (`exibicaoDoBoard`) — o renderer não
   responde "a Lista mostra descrição?", ele desenha o que lhe disseram. Sem isto, a pergunta
   teria uma resposta no editor, outra no player e uma terceira no domínio.

   O fallback existe para o board que chega de um servidor anterior ao V2: ele reproduz os
   defaults do V1, e a parede continua igual em vez de ficar sem nada. */
function exibicaoDe(board, template) {
  const ex = board?.exibicao
  if (ex && typeof ex === 'object') return ex
  return {
    logo: false,
    fita: true,
    imagem: template !== 'LISTA',
    descricao: template === 'LISTA' || template === 'DESTAQUE',
    // (CARROSSEL nasceu depois deste fallback; board antigo nunca tem esse layout.)
    descricaoSoNoDestaque: template === 'DESTAQUE',
  }
}

/* A TELA do board, em 1920 × 1080 absolutos. Quem encolhe é quem monta (a prévia). */
export function MenuBoardTela({ board, logo }) {
  const produtos = Array.isArray(board?.produtos) ? board.produtos : []
  const template = TEMPLATES.includes(board?.layout) ? board.layout : 'GRADE'
  const ex = exibicaoDe(board, template)
  const temCabeca = ex.logo || board?.titulo || board?.subtitulo
  return (
    /* O modificador é `tvmb-tpl-*`, e NÃO `tvmb-<template>`.
       A versão anterior gerava `tvmb-tela tvmb-grade` — exatamente a classe do CORPO da
       grade. As duas regras caíam no mesmo elemento e a do corpo vencia: o artboard virava
       um grid 4 × 2, o cabeçalho caía na célula (1,1) com 419px (o título "à esquerda") e o
       corpo na célula vizinha, espremido. A colisão existia desde o V1 e era inofensiva
       porque `.tvmb-tela` era `display: flex`, e flex ignora `grid-template-*`; ela acordou
       quando o artboard virou grid. */
    <div className={'tvmb-tela tvmb-tpl-' + template.toLowerCase()}>
      {/* O CABEÇALHO só existe quando tem o que dizer. Um bloco vazio com altura fixa
          empurraria a composição para baixo em todo board sem título — e a diferença
          apareceria na parede, não aqui. */}
      {temCabeca ? (
        <header className="tvmb-cabeca">
          {/* A logo vem da APARÊNCIA do canal (própria do TV Indoor, com fallback na marca
              da empresa). Não há upload de logo dentro do board: uma marca, uma fonte. */}
          {ex.logo && logo ? <img className="tvmb-logo" src={logo} alt="" /> : null}
          {board?.titulo || board?.subtitulo ? (
            <div className="tvmb-cabeca-txt">
              {board?.titulo ? <h2 className="tvmb-titulo">{board.titulo}</h2> : null}
              {board?.subtitulo ? <p className="tvmb-subtitulo">{board.subtitulo}</p> : null}
            </div>
          ) : null}
        </header>
      ) : null}
      <div className="tvmb-corpo">
        {template === 'LISTA' ? <Lista produtos={produtos} ex={ex} /> : null}
        {template === 'GRADE' ? <Grade produtos={produtos} ex={ex} /> : null}
        {template === 'VITRINE' ? <Vitrine produtos={produtos} ex={ex} /> : null}
        {template === 'OFERTA' ? <Oferta produtos={produtos} ex={ex} /> : null}
        {template === 'DESTAQUE' ? <Destaque produtos={produtos} destaqueId={board?.destaqueId} ex={ex} /> : null}
        {template === 'CARROSSEL'
          ? <Carrossel produtos={produtos} ex={ex} duracaoSegundos={board?.duracaoSegundos} />
          : null}
      </div>
    </div>
  )
}

/* O board ENCAIXADO num espaço qualquer: a tela de 1920 × 1080 reduzida por `scale`, dentro
   de uma caixa 16:9. É assim que a prévia do admin mostra exatamente o que a parede mostra,
   e é assim que o player preenche a TV seja qual for a resolução dela.

   ── POR QUE A ESCALA É MEDIDA EM JS ─────────────────────────────────────────────────
   `scale()` precisa de um número puro, e CSS não sabe dividir um comprimento por outro:
   `calc(100% / 1920px)` não existe. `cqw` resolveria, e está fora — WebView de TV de loja é
   velha, e um layout que depende de recurso recente é um layout que falha justamente no
   aparelho que importa.
   Então: `ResizeObserver` mede a caixa e escreve a escala numa variável CSS. É pouco código,
   é exato, e funciona em qualquer navegador que a TV tenha.

   O observer escreve DIRETO no nó (`style.setProperty`), sem passar por estado do React: a
   TV redimensiona uma vez na vida, e um `setState` a cada quadro de resize remontaria o
   board inteiro à toa. */
export default function MenuBoard({ board, tokens, logo }) {
  const caixaRef = useRef(null)

  // A paleta entra por `style.setProperty`, uma propriedade conhecida de cada vez — nunca
  // uma `<style>` montada com string. O adaptador (`tvIndoorTema`) é o único que sabe
  // traduzir chave de domínio em nome de custom property, e ele recusa o que não conhece.
  useEffect(() => { aplicarTemaTv(caixaRef.current, tokens) }, [tokens])

  useEffect(() => {
    const el = caixaRef.current
    if (!el) return undefined
    /* Medir é só escrever uma VARIÁVEL e uma classe. Nada de `width`/`height` em pixel:
       mexer em dimensão aqui provocaria layout dentro do palco, e o ponto do artboard fixo é
       que a composição não muda quando o contêiner muda — só a escala muda.

       A classe `medido` libera a pintura. Enquanto ela não existe, o palco fica invisível em
       vez de aparecer em tamanho real dentro de uma caixa pequena. */
    const medir = () => {
      const largura = el.clientWidth
      if (largura <= 0) return
      el.style.setProperty('--tvmb-escala', String(largura / 1920))
      el.classList.add('medido')
    }
    medir()
    /* `ResizeObserver` já cobre o caso de nascer com largura ZERO: ele dispara na observação
       inicial (mesmo em 0×0) e de novo assim que o elemento ganha dimensão — que é o que
       acontece quando o modal do editor abre. Por isso NÃO há polling nem `requestAnimationFrame`
       aqui: seria trabalho repetido para um evento que o navegador já entrega.

       A WebView bem antiga pode não ter o observer: aí vale a medição inicial mais o
       `resize` da janela, que é o caso que realmente acontece numa TV. */
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="tvmb-caixa" ref={caixaRef}>
      <div className="tvmb-palco">
        <MenuBoardTela board={board} logo={logo} />
      </div>
    </div>
  )
}
