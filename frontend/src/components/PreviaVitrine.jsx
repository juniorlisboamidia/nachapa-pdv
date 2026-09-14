// Prévia da VITRINE — a tela de espera padrão do totem — para o admin.
//
// Usada em dois lugares, e por isso é um componente e não JSX repetido: em Personalização
// (onde a loja edita foto, título, subtítulo e botão, e precisa ver o resultado ao lado) e
// na prévia de Banners › Tela de espera (onde "nada no ar" significa que ESTA tela é o que
// o cliente vê, e não mais a logo no meio do preto).
//
// Mesma decisão da prévia da capa: é um WIREFRAME com as proporções do aparelho, não o
// quiosque real. Importar o totem.css para desenhar um retângulo de 300px seria peso no
// bundle de quem só veio trocar uma frase. A metade de baixo (a esteira) é desenhada como
// bloco neutro de propósito — os produtos dela se escolhem em outra tela, e o que ESTA
// prévia responde é "como fica a metade de cima com o que eu digitei".
//
// O `fundoUrl` chega com `?v=` de cache, então a foto só troca quando trocar de verdade.
const PADRAO = {
  fundo: '#0f0e0d',
  texto: '#ffffff',
  textoApoio: '#d79e00',
  acaoFundo: '#d79e00',
  acaoTexto: '#000000',
}

export default function PreviaVitrine({ cores, fundoUrl, titulo, subtitulo, chamada, fraseMeio, esteira = true }) {
  const c = (k) => cores?.[k] || PADRAO[k]
  const botao = (typeof chamada === 'string' && chamada.trim()) || 'Toque para começar'
  // Sobre a foto o texto é sempre branco, porque há um véu escuro por baixo — é o mesmo
  // véu do aparelho, e é ele que garante leitura sobre qualquer foto. Sem foto, o texto
  // segue a cor do template, como na tela.
  const tinta = fundoUrl ? '#ffffff' : c('texto')
  const apoio = fundoUrl ? 'rgba(255,255,255,.78)' : c('textoApoio')

  return (
    <div className="ttm-vit" style={{ background: c('fundo') }} aria-hidden="true">
      <div className="ttm-vit-alto">
        {fundoUrl ? (
          <>
            <img className="ttm-vit-foto" src={fundoUrl} alt="" />
            <span className="ttm-vit-veu" />
          </>
        ) : null}
        <div className="ttm-vit-txt">
          {titulo ? <strong className="ttm-vit-tit" style={{ color: tinta }}>{titulo}</strong> : null}
          {subtitulo ? <span className="ttm-vit-sub" style={{ color: apoio }}>{subtitulo}</span> : null}
          {/* Caixa alta porque é assim que o totem escreve o botão (text-transform na
              folha do quiosque). Sem isso o gestor digita em minúsculas e leva o susto. */}
          <span className="ttm-vit-botao" style={{ background: c('acaoFundo'), color: c('acaoTexto') }}>
            {botao.toUpperCase()}
          </span>
        </div>
      </div>
      {esteira ? (
        <div className="ttm-vit-faixa">
          <span>{((typeof fraseMeio === 'string' && fraseMeio.trim()) || 'Nossos produtos').toUpperCase()}</span>
        </div>
      ) : null}
      {esteira ? (
        <div className="ttm-vit-baixo">
          {[0, 1].map((fila) => (
            <div className="ttm-vit-fila" key={fila}>
              {[0, 1, 2, 3].map((i) => (
                <span className="ttm-vit-card" key={i}>
                  <span className="ttm-vit-card-foto" />
                  <span className="ttm-vit-card-linha" style={{ background: c('texto') }} />
                  <span className="ttm-vit-card-linha curta" style={{ background: c('acaoFundo') }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
