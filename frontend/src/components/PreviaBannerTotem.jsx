import useCarrossel from './totem/useCarrossel'

// Prévia do que o cliente vê, ao lado da lista de banners (Totem › Banners).
//
// ── POR QUE NÃO É O QUIOSQUE DE VERDADE ───────────────────────────────────────────────
// Seria possível montar aqui o `Cabecalho` real e importar o `totem.css`. Não é o que este
// arquivo faz, por dois motivos:
//
//   · `totem.css` são ~1200 regras e três arquivos de fonte, pensados para uma tela de
//     1080 × 1920 tocada em pé. Trazer isso para dentro do admin para desenhar um retângulo
//     de 400px é peso puro no bundle de quem só queria trocar uma arte;
//   · o cabeçalho real tem um Cancelar que apaga o pedido em dois toques. Numa prévia, um
//     botão que faz alguma coisa é armadilha.
//
// O que este arquivo é: um WIREFRAME com as proporções certas. A faixa é 3:1, a coluna da
// esquerda tem a mesma fatia que a coluna de categorias tem no aparelho, e as cores e a
// logo são as que a loja configurou em Personalização. O que está desenhado como bloco
// neutro — categorias, cards — é contexto, e se apresenta como esboço de propósito: o que
// esta tela precisa mostrar com fidelidade é a ARTE dentro da faixa.
//
// ── A ROTAÇÃO É A DE VERDADE ──────────────────────────────────────────────────────────
// `useCarrossel` é o MESMO hook que o quiosque usa. Não é uma animação imitando o
// comportamento: é a elegibilidade real (ativo + agenda), a ordem real e a duração real de
// cada arte. Uma capa agendada para amanhã não aparece aqui, porque não aparece lá.
//
// Sem `agoraServidor`: no admin o relógio que vale é o do gestor, que é quem está olhando.
// O desvio existe para o tablet da loja, que erra a hora — o navegador de quem configura
// não tem esse problema.

const PADRAO = {
  fundo: '#000000',
  cartao: '#131211',
  texto: '#ffffff',
  textoApoio: '#d79e00',
  acaoFundo: '#d79e00',
  acaoTexto: '#000000',
}

export default function PreviaBannerTotem({
  tipo = 'CAPA', itens, cores, logoUrl, inicial = '?', posicaoCategorias = 'esquerda',
}) {
  const { atual, total, indice, marcarFalha } = useCarrossel({ itens, tipo })
  const c = (k) => cores?.[k] || PADRAO[k]

  // Muda de arte → o `key` remonta a imagem → a animação de entrada roda de novo. É o
  // mesmo mecanismo do quiosque, e por isso a transição que se vê aqui é a de lá.
  const arte = atual
    ? (
      <img
        key={atual.id}
        className="ttm-pv-arte"
        src={atual.imagemUrl}
        alt={atual.nome || ''}
        onError={() => marcarFalha(atual.id)}
      />
    )
    : null

  return (
    <div className="ttm-pv-painel">
      <div className="ttm-pv-cab">
        <h2 className="ttm-pv-tit">Prévia</h2>
        <span className="ttm-pv-conta">
          {total === 0
            ? (tipo === 'CAPA' ? 'Nada no ar — a faixa mostra o título' : 'Nada no ar — a tela institucional')
            : total === 1
              ? '1 no ar'
              : `${indice + 1} de ${total} · ${atual?.duracaoSegundos ?? 6}s cada`}
        </span>
      </div>

      {tipo === 'CAPA' ? (
        <div className="ttm-pv ttm-pv-topo-corte" style={{ background: c('fundo') }}>
          {/* A faixa: logo à esquerda, capa preenchendo o resto — a mesma divisão do
              aparelho, na mesma proporção. */}
          <div className="ttm-pv-faixa">
            <div className="ttm-pv-marca" style={{ background: c('fundo') }}>
              {logoUrl
                ? <img src={logoUrl} alt="" />
                : <span className="ttm-pv-inicial" style={{ background: c('acaoFundo'), color: c('acaoTexto') }}>{inicial}</span>}
            </div>
            <div className="ttm-pv-banda" style={{ background: c('cartao') }}>
              {arte ?? <span className="ttm-pv-banda-tit" style={{ color: c('texto') }}>Escolha seu lanche</span>}
              {/* O Cancelar entra porque ele fica POR CIMA da arte: é a única coisa que
                  disputa espaço com a capa, e quem desenha a arte precisa saber disso. */}
              <span className="ttm-pv-cancelar">Cancelar</span>
            </div>
          </div>

          {/* Um pedaço do catálogo, cortado: o suficiente para a faixa não flutuar no
              vazio. Some num degradê porque a tela continua — fingir um fim seria mentira
              sobre onde a capa está. */}
          <div className={'ttm-pv-corpo' + (posicaoCategorias === 'direita' ? ' invertido' : '')}>
            <div className="ttm-pv-lado">
              {['Tradicionais', 'Artesanais', 'Bebidas', 'Sobremesas'].map((n, i) => (
                <span
                  key={n}
                  className="ttm-pv-cat"
                  style={i === 0
                    ? { background: c('acaoFundo'), color: c('acaoTexto') }
                    : { color: c('textoApoio') }}
                >
                  {n}
                </span>
              ))}
            </div>
            <div className="ttm-pv-grade">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="ttm-pv-card" style={{ background: c('cartao') }}>
                  <div className="ttm-pv-foto" />
                  <div className="ttm-pv-linha" style={{ background: c('texto') }} />
                  <div className="ttm-pv-linha curta" style={{ background: c('textoApoio') }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* A espera é a tela INTEIRA — aqui a prévia é o aparelho todo, em 9:16. */
        <div className="ttm-pv ttm-pv-tela" style={{ background: c('fundo') }}>
          {arte ?? (
            <div className="ttm-pv-institucional">
              {logoUrl
                ? <img src={logoUrl} alt="" />
                : <span className="ttm-pv-inicial grande" style={{ background: c('acaoFundo'), color: c('acaoTexto') }}>{inicial}</span>}
            </div>
          )}
          <span className="ttm-pv-toque" style={{ background: c('acaoFundo'), color: c('acaoTexto') }}>
            Toque para começar
          </span>
        </div>
      )}
    </div>
  )
}
