// "Falta escolher: BEBIDA, ACOMPANHAMENTO" — a resposta para a pergunta que o
// combo levantava e a tela antiga não respondia: por que o botão não libera?
// Cada chip leva direto ao grupo, então também é atalho, não só diagnóstico.
export default function ChipsPendentes({ pendentes, temObrigatorio, aoFocar }) {
  if (!temObrigatorio) return null
  return (
    <div className="tq-pendencias">
      <span className="tq-pend-rot tq-rotulo">{pendentes.length ? 'Falta escolher' : 'Tudo escolhido'}</span>
      {pendentes.length
        ? pendentes.map((g) => (
          <button key={g.id} type="button" className="tq-pend" onClick={() => aoFocar(g.id)}>{g.nome}</button>
        ))
        : <span className="tq-pend ok">Pronto para adicionar</span>}
    </div>
  )
}
