import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import Toast from '../Toast'
import { brl, brlExato } from '../relatorios/formatos'

// Seção "Contagem de estoque" do CMV Global (Task 6): tabela dos insumos
// ativos com quantidade lançada pelo usuário → valor (qtd × custoUnitario,
// calculado no cliente só para exibição). A soma vira o estoque final do mês;
// PUT /api/cmv/contagem persiste (o backend recalcula o valor de cada item).
//
// `dados` é a resposta de GET /api/cmv já carregada pela página (CmvGlobal):
// usamos dados.ano/dados.mes (não os do seletor) para salvar sempre no mês
// cuja contagem está realmente em tela, mesmo numa troca de mês em trânsito.
export default function ContagemEstoque({ dados, recarregar }) {
  const [insumos, setInsumos] = useState([])
  const [carregandoInsumos, setCarregandoInsumos] = useState(true)
  const [erroInsumos, setErroInsumos] = useState(null)
  // Quantidade digitada por insumo: { [insumoId]: '12.5' }
  const [quantidades, setQuantidades] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)

  // Busca os insumos ativos uma única vez (o componente não é remontado nas
  // trocas de mês — só reagimos a elas no efeito de pré-preenchimento abaixo).
  useEffect(() => {
    let ativo = true
    setCarregandoInsumos(true)
    api
      .get('/insumos')
      .then((r) => { if (ativo) setInsumos(Array.isArray(r.data) ? r.data : []) })
      .catch((err) => {
        if (!ativo) return
        setErroInsumos(
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro ao carregar os insumos.')
        )
      })
      .finally(() => { if (ativo) setCarregandoInsumos(false) })
    return () => { ativo = false }
  }, [])

  // Pré-preenche as quantidades a partir da contagem já salva do mês em tela,
  // mas SÓ ao trocar de mês (deps = só ano/mes, não a identidade de
  // dados.contagemFinal): um recarregar() do MESMO mês — disparado por
  // Compras/Faturamento após salvar — não deve descartar quantidades já
  // digitadas e ainda não salvas nesta seção.
  useEffect(() => {
    const itens = dados?.contagemFinal?.itens ?? []
    const mapa = {}
    for (const item of itens) {
      if (item?.insumoId !== null && item?.insumoId !== undefined) {
        mapa[String(item.insumoId)] = String(item.quantidade ?? '')
      }
    }
    setQuantidades(mapa)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados?.ano, dados?.mes])

  const setQuantidade = useCallback((insumoId, valor) => {
    setQuantidades((prev) => ({ ...prev, [String(insumoId)]: valor }))
  }, [])

  const linhas = useMemo(
    () => insumos.map((insumo) => {
      const bruto = quantidades[String(insumo.id)]
      const quantidadeNum = bruto === undefined || bruto === '' ? 0 : Number(bruto)
      const quantidadeValida = Number.isFinite(quantidadeNum) ? quantidadeNum : 0
      const custo = Number(insumo.custoUnitario) || 0
      return {
        insumo,
        quantidadeBruta: bruto ?? '',
        quantidadeNum: quantidadeValida,
        valor: quantidadeValida * custo
      }
    }),
    [insumos, quantidades]
  )

  const estoqueFinalCalculado = useMemo(
    () => linhas.reduce((acc, l) => acc + l.valor, 0),
    [linhas]
  )

  function handleSalvar() {
    const ano = dados?.ano
    const mes = dados?.mes
    if (!Number.isInteger(ano) || !Number.isInteger(mes)) return

    const itens = linhas
      .filter((l) => l.quantidadeNum > 0)
      .map((l) => ({
        insumoId: l.insumo.id,
        nome: l.insumo.nome,
        unidade: l.insumo.unidade ?? null,
        custoUnitario: Number(l.insumo.custoUnitario) || 0,
        quantidade: l.quantidadeNum
      }))

    setSalvando(true)
    api
      .put('/cmv/contagem', { ano, mes, itens })
      .then(() => recarregar())
      .then(() => setToast({ message: 'Contagem de estoque salva com sucesso.', type: 'success' }))
      .catch((err) => {
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar a contagem de estoque.',
          type: 'error'
        })
      })
      .finally(() => setSalvando(false))
  }

  return (
    <>
      <div className="section-title">Contagem de estoque</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

        {carregandoInsumos ? (
          <div className="loading-state">Carregando insumos…</div>
        ) : erroInsumos ? (
          <div className="alert alert-red">
            <div className="alert-msg clr-red">{erroInsumos}</div>
          </div>
        ) : insumos.length === 0 ? (
          <div className="empty-state">
            Nenhum insumo ativo cadastrado ainda. Cadastre os insumos em <strong>Insumos</strong> para
            lançar a contagem de estoque deste mês.
          </div>
        ) : (
          <>
            {!dados?.temContagemAnterior && (
              <div className="alert alert-gray" style={{ marginBottom: 12 }}>
                <div className="alert-msg">
                  É o primeiro mês — esta contagem serve de abertura (estoque inicial).
                </div>
              </div>
            )}

            <div className="table-card">
              <table className="hb-table">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Unidade</th>
                    <th>Custo</th>
                    <th style={{ width: 140 }}>Quantidade</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ insumo, quantidadeBruta, valor }) => (
                    <tr key={insumo.id}>
                      <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{insumo.nome}</td>
                      <td>{insumo.unidade}</td>
                      <td>{brl(insumo.custoUnitario)}</td>
                      <td>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={quantidadeBruta}
                          onChange={(e) => setQuantidade(insumo.id, e.target.value)}
                          placeholder="0"
                          style={{ width: 110 }}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>{brlExato(valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--app-text-2)' }}>
                Estoque inicial (herdado do mês anterior):{' '}
                <strong style={{ color: 'var(--app-text)' }}>{brl(dados?.estoqueInicial)}</strong>
              </div>
              <div style={{ fontSize: 14, color: 'var(--app-text-2)' }}>
                Estoque final (esta contagem):{' '}
                <strong style={{ color: 'var(--app-text)', fontSize: 16 }}>{brlExato(estoqueFinalCalculado)}</strong>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar contagem'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
