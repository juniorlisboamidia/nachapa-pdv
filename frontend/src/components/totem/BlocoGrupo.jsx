import { podeAdicionarOpcao, grupoSatisfeito } from '../totemCarrinho'
import { regraDoGrupo, qtdDaOpcao, somaDaSelecao, modoDeOpcoes } from '../totemLayout'
import CardOpcao from './CardOpcao'

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
  const grade = modoDeOpcoes(grupo) === 'GRADE'
  const escolhidas = somaDaSelecao(sel)
  const noLimite = grupo.max !== null && grupo.max !== undefined && escolhidas >= Number(grupo.max)

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
        <div className="tq-grupo-contagem tq-num">{escolhidas} de {grupo.max}</div>
      ) : null}
      {/* Limite atingido se explica no cabeçalho do grupo. As opções que sobraram
          apagam, mas nenhuma desaparece: sumir daria a impressão de cardápio
          diferente a cada toque. */}
      {noLimite && !somavel && Number(grupo.max) > 1
        ? <div className="tq-grupo-limite">Limite de {grupo.max} escolhas atingido.</div>
        : null}

      <div className={'tq-opcoes' + (grade ? ' grade' : '')}>
        {(grupo.opcoes ?? []).map((op) => {
          const qtd = qtdDaOpcao(sel, op.id)
          return (
            <CardOpcao
              key={op.id}
              opcao={op}
              comFoto={grade}
              somavel={somavel}
              emFalta={!!(op.status && op.status !== 'ACTIVE')}
              marcado={qtd > 0}
              qtd={qtd}
              podeMais={podeAdicionarOpcao(grupo, sel, op).ok}
              aoTocar={() => aoTocar(grupo, op)}
              aoMenos={() => aoMenos(grupo, op)}
            />
          )
        })}
      </div>

      {!grupoSatisfeito(grupo, sel) && regra.obrigatorio
        ? <div className="tq-grupo-falta">Escolha para continuar</div>
        : null}
    </section>
  )
}
