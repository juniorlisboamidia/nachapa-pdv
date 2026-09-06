import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import Toast from '../Toast'
import ConfirmDialog from '../ConfirmDialog'
import InsumoAutocomplete from '../InsumoAutocomplete'
import InputMoeda from '../InputMoeda'
import { brlExato, fmtBR, ymd } from '../relatorios/formatos'

const round2 = (n) => Number((Number(n) || 0).toFixed(2))

function itemVazio() {
  return { insumoId: '', nome: '', custoUnitario: '', quantidade: '' }
}
// Default da data de uma compra NOVA: precisa cair dentro do mês em tela
// (dados.ano/dados.mes — é por eles que o backend agrega a compra). Se esse
// mês é o atual, hoje; senão dia 1 do mês selecionado — evita que, ao fechar
// um mês passado, a data sugerida caia fora dele. Edição de compra existente
// não passa por aqui (openEdit usa a data já salva).
function dataDefaultNovaCompra(ano, mes) {
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return ymd(new Date())
  const hoje = new Date()
  if (ano === hoje.getFullYear() && mes === hoje.getMonth() + 1) return ymd(hoje)
  return ymd(new Date(ano, mes - 1, 1))
}
function formVazio(ano, mes) {
  return {
    data: dataDefaultNovaCompra(ano, mes),
    valor: '',
    fornecedor: '',
    observacao: '',
    detalhar: false,
    itens: []
  }
}

// Seção "Compras do mês" do CMV Global (Task 7): tabela das compras já
// lançadas (dados.compras.lista, rodapé = dados.compras.total) + modal de
// adicionar/editar (data, valor, fornecedor, observação e, opcionalmente,
// detalhamento por insumo cujo valor vira Σ dos itens) + exclusão com
// confirmação. POST/PUT/DELETE /api/cmv/compra; sempre recarrega() no fim.
//
// `dados` é a resposta de GET /api/cmv já carregada pela página (CmvGlobal):
// usamos dados.ano/dados.mes (não os do seletor) para salvar sempre no mês
// cuja lista de compras está realmente em tela, mesmo numa troca de mês em
// trânsito (mesmo cuidado da Contagem de estoque, Task 6).
export default function Compras({ dados, recarregar }) {
  const [insumos, setInsumos] = useState([])
  const [erroInsumos, setErroInsumos] = useState(null)
  const [toast, setToast] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(formVazio)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [compraParaExcluir, setCompraParaExcluir] = useState(null)
  const [excluindoId, setExcluindoId] = useState(null)

  // Busca os insumos ativos uma única vez, para o seletor do "detalhar por
  // insumo" (falha silenciosa: sem eles o toggle simplesmente fica sem opções).
  useEffect(() => {
    let ativo = true
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
    return () => { ativo = false }
  }, [])

  const lista = dados?.compras?.lista ?? []
  const total = dados?.compras?.total ?? 0

  function openCreate() {
    setEditingId(null)
    setForm(formVazio(dados?.ano, dados?.mes))
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(compra) {
    const temItens = Array.isArray(compra.itens) && compra.itens.length > 0
    setEditingId(compra.id)
    setForm({
      data: String(compra.data).slice(0, 10),
      valor: compra.valor === null || compra.valor === undefined ? '' : String(compra.valor),
      fornecedor: compra.fornecedor ?? '',
      observacao: compra.observacao ?? '',
      detalhar: temItens,
      itens: temItens
        ? compra.itens.map((i) => ({
            insumoId: i.insumoId !== null && i.insumoId !== undefined ? String(i.insumoId) : '',
            nome: i.nome,
            custoUnitario: String(i.custoUnitario),
            quantidade: String(i.quantidade)
          }))
        : []
    })
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(formVazio(dados?.ano, dados?.mes))
    setFormError(null)
  }

  function addItemRow() {
    setForm((f) => ({ ...f, itens: [...f.itens, itemVazio()] }))
  }
  function removeItemRow(idx) {
    setForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }))
  }
  function setItemInsumo(idx, insumoIdStr) {
    const insumo = insumos.find((i) => String(i.id) === insumoIdStr)
    setForm((f) => ({
      ...f,
      itens: f.itens.map((it, i) => i !== idx ? it : {
        ...it,
        insumoId: insumoIdStr,
        nome: insumo ? insumo.nome : '',
        custoUnitario: insumo ? String(insumo.custoUnitario) : ''
      })
    }))
  }
  function setItemField(idx, field, value) {
    setForm((f) => ({ ...f, itens: f.itens.map((it, i) => i === idx ? { ...it, [field]: value } : it) }))
  }

  // Lista de opções do autocomplete de cada linha: normalmente os insumos
  // ativos, mas se a linha (vinda de uma edição) aponta para um insumo que
  // não está mais na lista ativa, injeta uma opção sintética com os dados já
  // salvos — evita que a busca apareça vazia e o nome se perca ao editar.
  function opcoesParaLinha(it) {
    if (it.insumoId === '' || insumos.some((i) => String(i.id) === it.insumoId)) return insumos
    return [...insumos, { id: it.insumoId, nome: it.nome, custoUnitario: Number(it.custoUnitario) || 0, unidade: '' }]
  }

  const itensComValor = useMemo(
    () => form.itens.map((it) => {
      const custo = Number(it.custoUnitario) || 0
      const qtd = Number(it.quantidade) || 0
      return { ...it, valorCalc: custo * qtd }
    }),
    [form.itens]
  )
  const somaItens = useMemo(
    () => itensComValor.reduce((acc, it) => acc + it.valorCalc, 0),
    [itensComValor]
  )
  // Linhas "tocadas" (insumo escolhido ou quantidade digitada) — linhas
  // adicionadas e deixadas em branco são ignoradas silenciosamente no envio.
  const itensPreenchidos = useMemo(
    () => itensComValor.filter((it) => it.insumoId !== '' || it.quantidade !== ''),
    [itensComValor]
  )
  const usaItens = form.detalhar && itensPreenchidos.length > 0

  function handleSubmit(e) {
    e.preventDefault()
    const ano = dados?.ano
    const mes = dados?.mes
    if (!Number.isInteger(ano) || !Number.isInteger(mes)) return

    if (!form.data) {
      setFormError('Data é obrigatória.')
      return
    }

    let itensPayload = null
    if (usaItens) {
      for (const it of itensPreenchidos) {
        if (it.insumoId === '') { setFormError('Selecione um insumo em todos os itens.'); return }
        const qtd = Number(it.quantidade)
        if (!Number.isFinite(qtd) || qtd <= 0) {
          setFormError(`Quantidade inválida para "${it.nome || 'um dos itens'}".`)
          return
        }
        const custo = Number(it.custoUnitario)
        if (!Number.isFinite(custo) || custo < 0) {
          setFormError(`Custo inválido para "${it.nome || 'um dos itens'}".`)
          return
        }
      }
      itensPayload = itensPreenchidos.map((it) => ({
        insumoId: it.insumoId === '' ? null : Number(it.insumoId),
        nome: it.nome,
        custoUnitario: Number(it.custoUnitario) || 0,
        quantidade: Number(it.quantidade) || 0
      }))
    } else {
      const valorNum = Number(form.valor)
      if (form.valor === '' || !Number.isFinite(valorNum) || valorNum < 0) {
        setFormError('Valor é obrigatório e deve ser maior ou igual a zero.')
        return
      }
    }

    setFormError(null)

    const payload = {
      ano,
      mes,
      data: form.data,
      valor: usaItens ? round2(somaItens) : round2(Number(form.valor)),
      fornecedor: form.fornecedor.trim() === '' ? null : form.fornecedor.trim(),
      observacao: form.observacao.trim() === '' ? null : form.observacao.trim()
    }
    if (usaItens) {
      // Só inclui a chave "itens" quando há itens de fato — o backend usa o
      // valor do body quando ela não é enviada (ou vem vazia).
      payload.itens = itensPayload
    } else if (editingId !== null) {
      // Edição com o toggle desligado/esvaziado: limpa itens antigos que
      // porventura existissem, para não deixar a compra com itens "fantasma"
      // que não batem mais com o valor manual.
      payload.itens = []
    }

    setSubmitting(true)
    const request = editingId === null
      ? api.post('/cmv/compra', payload)
      : api.put(`/cmv/compra/${editingId}`, payload)

    request
      .then(() => recarregar())
      .then(() => {
        setToast({
          message: editingId === null ? 'Compra registrada com sucesso.' : 'Compra atualizada com sucesso.',
          type: 'success'
        })
        closeModal()
      })
      .catch((err) => {
        setFormError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar a compra.')
      })
      .finally(() => setSubmitting(false))
  }

  function confirmExcluir() {
    const compra = compraParaExcluir
    if (!compra) return
    setExcluindoId(compra.id)
    api
      .delete(`/cmv/compra/${compra.id}`)
      .then(() => recarregar())
      .then(() => setToast({ message: 'Compra excluída com sucesso.', type: 'success' }))
      .catch((err) => {
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao excluir a compra.',
          type: 'error'
        })
      })
      .finally(() => {
        setExcluindoId(null)
        setCompraParaExcluir(null)
      })
  }

  return (
    <>
      <div className="section-title">Compras do mês</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

        <ConfirmDialog
          open={compraParaExcluir !== null}
          title="Excluir compra?"
          message={
            compraParaExcluir
              ? `Você está prestes a excluir a compra de ${brlExato(compraParaExcluir.valor)}${compraParaExcluir.fornecedor ? ` (${compraParaExcluir.fornecedor})` : ''}.`
              : ''
          }
          description="Esta ação não pode ser desfeita."
          confirmLabel="Excluir compra"
          cancelLabel="Cancelar"
          variant="danger"
          loading={excluindoId !== null}
          onConfirm={confirmExcluir}
          onCancel={() => setCompraParaExcluir(null)}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Nova compra
          </button>
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">Nenhuma compra lançada neste mês ainda.</div>
        ) : (
          <div className="table-card">
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtBR(String(c.data).slice(0, 10))}</td>
                    <td className={c.fornecedor ? '' : 'clr-muted'}>{c.fornecedor || 'Sem fornecedor'}</td>
                    <td style={{ textAlign: 'right' }}>{brlExato(c.valor)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => openEdit(c)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setCompraParaExcluir(c)}
                          disabled={excluindoId === c.id}
                        >
                          {excluindoId === c.id ? 'Excluindo…' : 'Excluir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 600, color: 'var(--app-text)' }}>Total do mês</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--app-text)' }}>{brlExato(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {editingId === null ? 'Nova compra' : 'Editar compra'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.data}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fornecedor (opcional)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={form.fornecedor}
                    onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                    placeholder="Ex.: Distribuidora Central"
                  />
                </div>
              </div>

              <div className="card" style={{ background: 'var(--app-surface-2)', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.detalhar}
                    onChange={(e) => setForm({ ...form, detalhar: e.target.checked })}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)' }}>
                      Detalhar por insumo
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#999', lineHeight: 1.5, marginTop: 2 }}>
                      Lance os itens comprados (insumo, quantidade e custo) — o valor da compra passa a
                      ser a soma dos itens.
                    </span>
                  </span>
                </label>

                {form.detalhar && (
                  <div style={{ marginTop: 12 }}>
                    {erroInsumos && (
                      <div className="alert alert-red" style={{ marginBottom: 8 }}>
                        <div className="alert-msg clr-red">{erroInsumos}</div>
                      </div>
                    )}

                    {form.itens.length > 0 && (
                      <div className="table-card table-card-form" style={{ marginBottom: 8 }}>
                        <table className="hb-table">
                          <thead>
                            <tr>
                              <th>Insumo</th>
                              <th style={{ width: 130 }}>Quantidade</th>
                              <th style={{ width: 140 }}>Custo unit.</th>
                              <th style={{ textAlign: 'right' }}>Valor</th>
                              <th style={{ width: 40 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.itens.map((it, idx) => (
                              <tr key={idx}>
                                <td>
                                  <InsumoAutocomplete
                                    insumos={opcoesParaLinha(it)}
                                    value={it.insumoId}
                                    onChange={(v) => setItemInsumo(idx, v)}
                                    placeholder="Buscar insumo..."
                                  />
                                </td>
                                <td>
                                  <input
                                    className="form-input"
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    value={it.quantidade}
                                    onChange={(e) => setItemField(idx, 'quantidade', e.target.value)}
                                    placeholder="0"
                                  />
                                </td>
                                <td>
                                  <InputMoeda
                                    className="form-input"
                                    valor={it.custoUnitario === '' ? '' : Number(it.custoUnitario)}
                                    onChange={(v) => setItemField(idx, 'custoUnitario', v === '' ? '' : String(v))}
                                    placeholder="0,00"
                                  />
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {brlExato((Number(it.custoUnitario) || 0) * (Number(it.quantidade) || 0))}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => removeItemRow(idx)}
                                    aria-label="Remover item"
                                    title="Remover item"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={addItemRow}>
                      + Adicionar item
                    </button>
                    {itensPreenchidos.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, color: 'var(--app-text-2)' }}>
                        Valor da compra (soma dos itens):{' '}
                        <strong style={{ color: 'var(--app-text)' }}>{brlExato(somaItens)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!usaItens && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Valor (R$)</label>
                  <InputMoeda
                    className="form-input"
                    valor={form.valor === '' ? '' : Number(form.valor)}
                    onChange={(v) => setForm({ ...form, valor: v === '' ? '' : String(v) })}
                    placeholder="0,00"
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Observação (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Ex.: Compra emergencial de fim de semana"
                />
              </div>

              {formError && (
                <div className="alert alert-red" style={{ marginBottom: 12 }}>
                  <div className="alert-msg clr-red">{formError}</div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando…' : 'Salvar compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
