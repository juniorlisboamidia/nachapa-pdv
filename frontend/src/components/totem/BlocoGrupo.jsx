import { podeAdicionarOpcao, grupoSatisfeito } from '../totemCarrinho'
import { regraDoGrupo, qtdDaOpcao, somaDaSelecao } from '../totemLayout'
import { moeda } from './formato'
import { Ico } from './icones'
import Stepper from './Stepper'

// Um grupo de complementos. Toda a régua de o que pode ser tocado continua vindo
// de totemCarrinho (`podeAdicionarOpcao`, `grupoSatisfeito`): aqui só se desenha.
//
// Obrigatório × opcional deixa de ser uma diferença de palavra e passa a ser de
// forma — barra amarela na borda do bloco —, porque num combo o cliente precisa
// enxergar de relance o que trava o pedido.
//
// Grupo MISSING continua NA TELA, apagado: sumir com ele faria o cliente achar
// que o item mudou de receita. Não aceita toque, e se for obrigatório o item
// inteiro já está travado por `itemOrdenavel`.
export default function BlocoGrupo({ grupo, selecao, aoTocar, aoMenos }) {
  const regra = regraDoGrupo(grupo)

  if (grupo.status === 'MISSING') {
    return (
      <section className="tq-grupo falta" id={`tq-g-${grupo.id}`} aria-disabled="true">
        <div className="tq-grupo-cab">
          <h2 className="tq-grupo-nome tq-disp">{grupo.nome}</h2>
          <span className="tq-grupo-regra tq-rotulo">{regra.obrigatorio ? 'obrigatório · ' : ''}em falta</span>
        </div>
        <p className="tq-grupo-indisponivel">Em falta — não dá para escolher agora.</p>
      </section>
    )
  }

  const sel = selecao ?? []
  const somavel = grupo.choiceType === 'SUMMABLE'

  return (
    <section
      className={'tq-grupo' + (regra.obrigatorio ? ' obrigatorio' : '')}
      id={`tq-g-${grupo.id}`}
    >
      <div className="tq-grupo-cab">
        <h2 className="tq-grupo-nome tq-disp">{grupo.nome}</h2>
        <span className="tq-grupo-regra tq-rotulo">
          {regra.obrigatorio ? 'obrigatório · ' : ''}{regra.texto}
        </span>
      </div>

      {somavel && grupo.max ? (
        <div className="tq-grupo-contagem tq-num">{somaDaSelecao(sel)} de {grupo.max}</div>
      ) : null}

      <div className="tq-opcoes">
        {(grupo.opcoes ?? []).map((op) => {
          const emFalta = op.status && op.status !== 'ACTIVE'
          const qtd = qtdDaOpcao(sel, op.id)
          const marcado = qtd > 0
          const podeMais = podeAdicionarOpcao(grupo, sel, op).ok

          if (somavel) {
            return (
              <div key={op.id} className={'tq-op' + (marcado ? ' on' : '') + (emFalta ? ' falta' : '')}>
                <span className="tq-op-txt">
                  <span className="tq-op-nome">{op.nome}</span>
                  {op.preco > 0 ? <span className="tq-op-preco tq-num">+ {moeda(op.preco)}</span> : null}
                </span>
                {emFalta ? <span className="tq-op-falta">Em falta</span> : (
                  qtd > 0
                    ? (
                      <Stepper
                        valor={qtd}
                        minimo={0}
                        rotulo={op.nome}
                        aoMenos={() => aoMenos(grupo, op)}
                        aoMais={() => aoTocar(grupo, op)}
                        maximoAtingido={!podeMais}
                      />
                    )
                    : (
                      <button type="button" className="tq-op-add" disabled={!podeMais} onClick={() => aoTocar(grupo, op)}>
                        Adicionar
                      </button>
                    )
                )}
              </div>
            )
          }

          return (
            <button
              key={op.id}
              type="button"
              className={'tq-op' + (emFalta ? ' falta' : '')}
              disabled={!!emFalta || (!marcado && !podeMais)}
              aria-pressed={marcado}
              onClick={() => aoTocar(grupo, op)}
            >
              <span className="tq-op-txt">
                <span className="tq-op-nome">{op.nome}</span>
                {op.preco > 0 ? <span className="tq-op-preco tq-num">+ {moeda(op.preco)}</span> : null}
              </span>
              {emFalta
                ? <span className="tq-op-falta">Em falta</span>
                : <span className="tq-op-marca" aria-hidden="true"><Ico nome="check" tam={18} traco={3} /></span>}
            </button>
          )
        })}
      </div>

      {!grupoSatisfeito(grupo, sel) && regra.obrigatorio
        ? <div className="tq-grupo-falta">Escolha para continuar</div>
        : null}
    </section>
  )
}
