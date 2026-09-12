import { useCallback, useEffect, useRef } from 'react'
import Foto from './Foto'
import Preco from './Preco'
import Stepper from './Stepper'
import ChipsPendentes from './ChipsPendentes'
import BlocoGrupo from './BlocoGrupo'
import BlocoObservacao from './BlocoObservacao'
import { moeda } from './formato'

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

  const rolarParaGrupo = useCallback((grupoId) => {
    const alvo = document.getElementById(`tq-g-${grupoId}`)
    const caixa = conteudoRef.current
    if (!alvo || !caixa) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    caixa.scrollTo({ top: Math.max(0, alvo.offsetTop - 16), behavior: suave ? 'smooth' : 'auto' })
  }, [])

  // Avanço automático (spec §8). Quem decide SE avança e PARA ONDE é o módulo
  // puro `totemFoco`, no orquestrador; aqui só se executa a rolagem — e com duas
  // restrições que evitam que a tela brigue com o cliente: nunca rola para trás,
  // e não rola se o alvo já está inteiro na área visível.
  useEffect(() => {
    if (!foco) return
    const caixa = conteudoRef.current
    if (!caixa) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (foco.tipo === 'CTA') {
      // Último grupo concluído: o destino é o fim do conteúdo, onde está o botão.
      caixa.scrollTo({ top: caixa.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
      return
    }
    const alvo = document.getElementById(`tq-g-${foco.id}`)
    if (!alvo) return
    const topo = Math.max(0, alvo.offsetTop - 16)
    const jaVisivel = alvo.offsetTop >= caixa.scrollTop && alvo.offsetTop + alvo.offsetHeight <= caixa.scrollTop + caixa.clientHeight
    if (jaVisivel || topo <= caixa.scrollTop) return
    caixa.scrollTo({ top: topo, behavior: suave ? 'smooth' : 'auto' })
  }, [foco])

  return (
    <>
      <div className="tq-conteudo" ref={conteudoRef}>
        <Foto src={imagem} alt="" className="tq-hero" tamIcone={72} />

        <div className="tq-det">
          {!podePedir.ok ? (
            <div className="tq-aviso-bloco">
              {podePedir.motivo === 'GRUPO_EM_FALTA'
                ? 'Indisponível no momento: falta um ingrediente obrigatório deste item. Escolha outro ou chame um atendente.'
                : 'Este item acabou. Escolha outro ou chame um atendente.'}
            </div>
          ) : null}

          <h1 className="tq-det-nome tq-disp tq-disp-forte">{nome}</h1>
          {descricao ? <p className="tq-det-desc">{descricao}</p> : null}
          <Preco
            className="tq-det-preco"
            valor={preco.valor}
            valorPromocional={preco.valorPromocional}
            aPartirDe={preco.aPartirDe}
          />

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
