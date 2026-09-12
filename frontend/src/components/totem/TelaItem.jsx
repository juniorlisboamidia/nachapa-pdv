import { useCallback, useRef } from 'react'
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
  preco, pronto, podePedir, qtd, observacao, ehEdicao,
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
          className="tq-btn tq-btn-primario tq-btn-largo"
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
