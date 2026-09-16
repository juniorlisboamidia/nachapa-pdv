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

const TEMPLATES = ['GRADE', 'DESTAQUE', 'LISTA', 'VITRINE', 'OFERTA']

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
    <div className={'tvmb-tela tvmb-' + template.toLowerCase()}>
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
    const medir = () => {
      const largura = el.clientWidth
      if (largura > 0) el.style.setProperty('--tvmb-escala', String(largura / 1920))
    }
    medir()
    // `ResizeObserver` pode não existir numa WebView bem antiga: aí vale a medição inicial
    // mais o `resize` da janela, que é o caso que realmente acontece numa TV.
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
