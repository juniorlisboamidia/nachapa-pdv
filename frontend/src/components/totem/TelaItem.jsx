import { useCallback, useEffect, useRef } from 'react'
import Foto from './Foto'
import Preco from './Preco'
import Stepper from './Stepper'
import ChipsPendentes from './ChipsPendentes'
import BlocoGrupo from './BlocoGrupo'
import BlocoObservacao from './BlocoObservacao'
import { moeda } from './formato'
import { destinoDeRolagem } from '../totemFoco'

// Detalhe do produto: identidade em cima, escolhas no meio, ação no rodapé.
//
// A lista de grupos chega JÁ FILTRADA por quem chama (`gruposRenderizaveis`): o
// grupo principal da vitrine não pode reaparecer aqui — ele é a identidade do
// produto, escolhida no card, e mostrá-lo deixaria o cliente trocar o X BURGUER
// por um X BACON dentro da tela do X BURGUER. Trocar de produto é voltar ao grid.
//
// O preço do cabeçalho e o do botão são O MESMO número, vindo pronto de
// `precoDoCabecalho`: enquanto faltar escolha obrigatória, é o piso do card
// ("a partir de R$ 27,90"), nunca um subtotal parcial abaixo do menor valor que
// dá para pagar.
export default function TelaItem({
  nome, descricao, imagem,
  grupos, selecoes, pendentes, temObrigatorio,
  preco, pronto, podePedir, qtd, observacao, ehEdicao, foco,
  aoTocarOpcao, aoMenosOpcao, aoMudarQtd, aoMudarObservacao, aoAdicionar,
}) {
  const conteudoRef = useRef(null)

  // Posição do alvo DENTRO do container rolável. `offsetTop` não serve aqui: o
  // `offsetParent` dos blocos é `.tq-raiz` (o único ancestral posicionado), então
  // ele vem somado à altura do cabeçalho — a conta erraria por ~96px e a tela
  // pararia depois do nome do grupo, que é justamente o que o cliente precisa ler.
  const rolar = useCallback((alvo, permitirVoltar) => {
    const caixa = conteudoRef.current
    if (!alvo || !caixa) return
    const topoRelativo = alvo.getBoundingClientRect().top - caixa.getBoundingClientRect().top
    const destino = destinoDeRolagem({
      topoRelativo,
      alturaAlvo: alvo.offsetHeight,
      scrollAtual: caixa.scrollTop,
      alturaVisivel: caixa.clientHeight,
      permitirVoltar,
    })
    if (destino === null) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    caixa.scrollTo({ top: destino, behavior: suave ? 'smooth' : 'auto' })
  }, [])

  // Toque explícito num chip "falta escolher": pode voltar, porque foi o cliente
  // que pediu para ir até lá.
  const rolarParaGrupo = useCallback((grupoId) => {
    rolar(document.getElementById(`tq-g-${grupoId}`), true)
  }, [rolar])

  // Avanço automático (spec §8). Quem decide SE avança e PARA ONDE é o módulo
  // puro `totemFoco`, no orquestrador; aqui só se executa a rolagem — e sem
  // nunca voltar, para a tela não brigar com quem já rolou adiante.
  useEffect(() => {
    if (!foco) return
    const caixa = conteudoRef.current
    if (!caixa) return
    if (foco.tipo === 'CTA') {
      // Último grupo concluído: o destino é o fim do conteúdo, onde está o botão.
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      caixa.scrollTo({ top: caixa.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
      return
    }
    rolar(document.getElementById(`tq-g-${foco.id}`), false)
  }, [foco, rolar])

  return (
    <>
      <div className="tq-conteudo" ref={conteudoRef}>
        {/* Foto e faixa formam uma peça só: a identidade do produto e o preço
            ficam sobre o preto, logo abaixo da imagem, com o peso de placa de
            cardápio — em vez de título e preço soltos sobre o fundo claro. */}
        <div className="tq-det-capa">
          <Foto src={imagem} alt="" className="tq-hero" tamIcone={72} />
          <div className="tq-det-faixa">
            <div className="tq-det-faixa-txt">
              <h1 className="tq-det-nome tq-disp tq-disp-forte">{nome}</h1>
              {descricao ? <p className="tq-det-desc">{descricao}</p> : null}
            </div>
            <Preco
              className="tq-det-preco"
              valor={preco.valor}
              valorPromocional={preco.valorPromocional}
              aPartirDe={preco.aPartirDe}
            />
          </div>
        </div>

        <div className="tq-det">
          {!podePedir.ok ? (
            <div className="tq-aviso-bloco">
              {podePedir.motivo === 'GRUPO_EM_FALTA'
                ? 'Indisponível no momento: falta um ingrediente obrigatório deste item. Escolha outro ou chame um atendente.'
                : 'Este item acabou. Escolha outro ou chame um atendente.'}
            </div>
          ) : null}

          <ChipsPendentes pendentes={pendentes} temObrigatorio={temObrigatorio} aoFocar={rolarParaGrupo} />

          {grupos.map((g) => (
            <BlocoGrupo
              key={g.id}
              grupo={g}
              selecao={selecoes[g.id]}
              aoTocar={aoTocarOpcao}
              aoMenos={aoMenosOpcao}
            />
          ))}

          <BlocoObservacao valor={observacao} aoMudar={aoMudarObservacao} />
        </div>
      </div>

      <footer className="tq-rodape">
        <Stepper
          valor={qtd}
          rotulo="Quantidade"
          aoMenos={() => aoMudarQtd(-1)}
          aoMais={() => aoMudarQtd(1)}
        />
        <button
          type="button"
          key={foco?.tipo === 'CTA' ? `cta-${foco.seq}` : 'cta'}
          className={'tq-btn tq-btn-primario tq-btn-largo' + (foco?.tipo === 'CTA' ? ' tq-cta-pulso' : '')}
          disabled={!pronto.ok || !podePedir.ok}
          onClick={aoAdicionar}
        >
          {podePedir.ok
            ? <>{ehEdicao ? 'Salvar item' : 'Adicionar'} · {preco.aPartirDe ? 'a partir de ' : ''}{moeda(preco.valorPromocional ?? preco.valor)}</>
            : 'Indisponível no momento'}
        </button>
      </footer>
    </>
  )
}
