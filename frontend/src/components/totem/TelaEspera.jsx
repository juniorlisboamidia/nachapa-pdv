import useCarrossel from './useCarrossel'

// Tela de ESPERA — o repouso do totem, e a única tela sem sessão.
//
// É ela que fica horas no vidro chamando quem passa. Tem dois rostos:
//
//   COM banner elegível  → a arte da loja ocupa a tela, com a chamada por cima.
//   SEM banner           → a VITRINE, que é o PADRÃO.
//
// A vitrine não é o caso degradado: ela é a tela de espera do totem, e o banner é que passa
// na frente quando existe um no ar. A composição é em duas metades:
//
//   em cima   foto de fundo (opcional), título, subtítulo e o botão;
//   embaixo   duas esteiras de produtos andando em sentidos contrários.
//
// A LOGO SAIU. Ela era o centro da tela institucional antiga, e nada mais. O título
// personalizável passou a ser a voz da loja e a foto de fundo carrega a identidade — menos
// elementos disputando a metade de cima, e um a menos que a loja não controlava.
//
// ── A TELA INTEIRA É O ALVO, nos dois rostos ──────────────────────────────────────────
// Quem passa na frente não vai mirar: encosta a mão em qualquer lugar. Continua sendo um
// `<button>` de verdade — o elemento certo para "isto responde ao toque", e o único que
// funciona com teclado e leitor de tela sem gambiarra de `role`.
//
// A ESTEIRA NÃO É TOCÁVEL por conta própria: tocar num produto faz o mesmo que tocar em
// qualquer outro lugar, que é começar uma sessão. Pular para aquele produto seria um SEGUNDO
// caminho de sessão, e a spec §12 fecha essa porta.
//
// ── OS TIMERS DAQUI NÃO SÃO DE SESSÃO ─────────────────────────────────────────────────
// O carrossel gira imagem numa tela onde, por definição, não existe sessão. Ociosidade,
// MS_AMBIGUO e o relógio capturado são outro domínio e não se encostam. Este componente só
// existe enquanto `tela === 'espera'`: sair desmonta e limpa tudo, voltar remonta.
export default function TelaEspera({ banners, chamada, titulo, subtitulo, destaques, aoTocar }) {
  /* O texto do botão vem de Personalização, já resolvido pelo servidor. O literal aqui é
     a última rede: bootstrap de uma versão anterior não manda o campo, e um botão sem
     texto na tela que fica horas no vidro seria o pior lugar possível para descobrir. */
  const texto = (typeof chamada === 'string' && chamada.trim()) || 'Toque para começar'

  // O rodízio é o mesmo da capa do catálogo e mora num lugar só: `useCarrossel`. Este
  // componente só decide o DESENHO.
  const { atual, total, indice, lista, marcarFalha } = useCarrossel({
    itens: banners?.itens, agoraServidor: banners?.agoraServidor, tipo: 'ESPERA',
  })
  // A foto de fundo da vitrine é outro TIPO de arte, com a mesma mecânica de ativo, agenda e
  // rodízio — por isso ela é um banner e não uma coluna de imagem na configuração. Só a
  // primeira elegível é usada: um fundo trocando atrás de um título parado seria inquietação
  // sem propósito, e a metade de baixo já tem movimento de sobra.
  const fundo = useCarrossel({ itens: banners?.itens, agoraServidor: banners?.agoraServidor, tipo: 'FUNDO' })

  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const produtos = Array.isArray(destaques) ? destaques : []
  // Duas fileiras a partir de QUATRO produtos. Com menos, a segunda ficaria com uma ou duas
  // fotos andando sozinhas num vão largo — uma fileira cheia lê melhor que duas vazias.
  const meio = Math.ceil(produtos.length / 2)
  const filas = produtos.length >= 4 ? [produtos.slice(0, meio), produtos.slice(meio)] : [produtos]

  return (
    <button
      type="button"
      className={'tq-espera' + (atual ? ' com-banner' : ' vitrine')}
      onClick={aoTocar}
      aria-label={texto}
    >
      {atual ? (
        <>
          {/* `key` por banner: trocar o src do MESMO elemento deixaria a imagem anterior
              visível até a nova decodificar. Com key, cada arte é um elemento próprio. */}
          <img
            key={atual.id}
            className={'tq-espera-arte' + (reduzido ? '' : ' entrando')}
            src={atual.imagemUrl}
            alt={atual.nome || ''}
            onError={() => marcarFalha(atual.id)}
          />
          {/* A chamada NÃO pode depender da arte que o lojista enviou: um degradê próprio
              garante que ela continue legível sobre uma foto branca, preta ou poluída. */}
          <div className="tq-espera-veu" aria-hidden="true" />
          <div className="tq-espera-chamada">
            <span className="tq-disp tq-disp-forte">{texto}</span>
          </div>
        </>
      ) : (
        <>
          {/* ── METADE DE CIMA ─────────────────────────────────────────────── */}
          <div className="tq-vit-alto">
            {fundo.atual ? (
              <>
                <img
                  className="tq-vit-fundo"
                  src={fundo.atual.imagemUrl}
                  alt=""
                  onError={() => fundo.marcarFalha(fundo.atual.id)}
                />
                {/* Mesmo véu do banner, e pelo mesmo motivo: o título tem de continuar
                    legível sobre uma foto que a loja escolheu e que ninguém revisou. */}
                <div className="tq-vit-veu" aria-hidden="true" />
              </>
            ) : null}

            <div className="tq-vit-txt">
              {/* Título e subtítulo são OPCIONAIS, e a ausência é composição válida: a loja
                  que só quer a foto e o botão não precisa inventar frase. */}
              {titulo ? <h1 className="tq-vit-tit tq-disp tq-disp-forte">{titulo}</h1> : null}
              {subtitulo ? <p className="tq-vit-sub">{subtitulo}</p> : null}
              <span className="tq-espera-chamada">
                <span className="tq-disp tq-disp-forte">{texto}</span>
              </span>
            </div>
          </div>

          {/* ── METADE DE BAIXO: as esteiras ───────────────────────────────────
              Cada fileira é a lista DUPLICADA, e o deslocamento vai até -50%: é o que faz o
              laço fechar sem salto, porque a segunda cópia chega na posição exata em que a
              primeira começou. Sem duplicar, a fileira acabaria e voltaria com um pulo.

              `aria-hidden` porque é apetite, não conteúdo: quem usa leitor de tela já tem o
              rótulo do botão dizendo o que a tela faz, e ouvir doze nomes de lanche antes
              disso seria ruído. */}
          {produtos.length ? (
            <div className="tq-vit-baixo" aria-hidden="true">
              {filas.map((fila, i) => (
                <div className="tq-vit-trilho" key={i}>
                  <div
                    className={'tq-vit-fila' + (i % 2 ? ' volta' : '')}
                    // A duração cresce com a quantidade para a VELOCIDADE ser a mesma em
                    // toda loja: seis produtos e doze passam no mesmo ritmo, o que um tempo
                    // fixo não daria — com doze, o dobro da distância no mesmo tempo é o
                    // dobro da velocidade.
                    style={{ '--tq-fila-dur': `${Math.max(18, fila.length * 6)}s` }}
                  >
                    {[...fila, ...fila].map((p, j) => (
                      <span className="tq-vit-card" key={`${p.id}-${j}`}>
                        <img src={p.imagem} alt="" />
                        <span className="tq-vit-nome">{p.nome}</span>
                        {typeof p.preco === 'number' ? (
                          <span className="tq-vit-preco tq-num">
                            {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* Marcadores só com dois ou mais: com um banner eles seriam enfeite. */}
      {total > 1 && (
        <div className="tq-espera-pontos" aria-hidden="true">
          {lista.map((b, i) => <span key={b.id} className={i === indice ? 'ativo' : undefined} />)}
        </div>
      )}
    </button>
  )
}
