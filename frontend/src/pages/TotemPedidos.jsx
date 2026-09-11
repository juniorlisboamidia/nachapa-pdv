// Ferramentas › Totem › Pedidos — a auditoria do outbox `PedidoTotemEnvio` (spec §5.5).
//
// Esta tela NÃO reprocessa pedido e não edita valor: ela conta o que aconteceu e oferece
// as três decisões que só um humano pode tomar quando a máquina não conseguiu resolver:
//   • Reconciliar agora — procura o pedido no Cardápio Web de novo (a única saída automática);
//   • Confirmar criado — o admin viu o pedido no painel do CW e informa o número de lá; o
//     servidor confere que aquele pedido é ESTE (external_order_id) antes de aceitar;
//   • Encerrar: não criado — o admin confirmou que o pedido não existe. Exige motivo.
// Nada aqui reenvia POST: AMBIGUO/REVISAO_MANUAL nunca viram falha sozinhos nem liberam
// um segundo envio (§5.3).
import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const DIAS = [
  { valor: 1, label: 'Hoje' },
  { valor: 7, label: '7 dias' },
  { valor: 30, label: '30 dias' },
]

// Cor = urgência, não estética. REVISAO_MANUAL é a única linha que grita: é a que só
// anda se alguém olhar esta tela.
const STATUS = {
  CRIADO: { label: 'Criado', badge: 'badge-green' },
  ENVIANDO: { label: 'Enviando', badge: 'badge-blue' },
  AMBIGUO: { label: 'Sem confirmação', badge: 'badge-yellow' },
  REVISAO_MANUAL: { label: 'Revisar agora', badge: 'ttm-badge-revisao' },
  REJEITADO: { label: 'Recusado', badge: 'badge-gray' },
  ENCERRADO_MANUAL: { label: 'Encerrado', badge: 'badge-gray' },
}
const MODO = { onsite: 'Comer aqui', takeout: 'Levar' }

const ERROS_ADMIN = {
  PEDIDO_NAO_CORRESPONDE: 'Esse número do Cardápio Web é de outro pedido. Confira no painel e tente de novo.',
  ESTADO_NAO_PERMITE_ACAO: 'O estado deste pedido não permite essa ação.',
  ESTADO_MUDOU: 'O pedido mudou de estado enquanto você decidia. A lista foi atualizada.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo (pelo menos 3 caracteres).',
  CW_ORDER_ID_OBRIGATORIO: 'Informe o número do pedido no Cardápio Web.',
  CLIENTE_SEM_CW: 'Esta loja não está ligada ao Cardápio Web.',
  PEDIDO_NAO_ENCONTRADO: 'Pedido não encontrado.',
  JANELA_RECONCILIACAO_EXPIRADA: 'Passou da janela de 24 h em que o Cardápio Web permite a busca. Decida manualmente.',
}
const erroDe = (e, fallback) => {
  const d = e?.response?.data
  return ERROS_ADMIN[d?.erro] ?? d?.error ?? d?.erro ?? fallback
}

const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const encurtar = (s, n = 60) => (!s ? '' : (s.length > n ? `${s.slice(0, n)}…` : s))

// Modal de entrada (número do CW / motivo). Fecha SÓ por botão, como todo modal do
// projeto — nada de clique no overlay.
function ModalEntrada({ aberto, titulo, descricao, children, confirmLabel, confirmDesabilitado, loading, onConfirm, onCancel }) {
  if (!aberto) return null
  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog" role="dialog" aria-modal="true">
        <div className="confirm-title">{titulo}</div>
        {descricao && <div className="confirm-message">{descricao}</div>}
        <div style={{ marginTop: 12 }}>{children}</div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={loading || confirmDesabilitado}>
            {loading ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TotemPedidos() {
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [toast, setToast] = useState(null)
  const [dias, setDias] = useState(7)
  const [status, setStatus] = useState('')
  const [agindo, setAgindo] = useState(false)
  const [confirmReconciliar, setConfirmReconciliar] = useState(null) // pedido
  const [modalCriado, setModalCriado] = useState(null)               // { pedido, cwOrderId }
  const [modalEncerrar, setModalEncerrar] = useState(null)            // { pedido, motivo }

  const notify = (message, type = 'success') => setToast({ message, type })

  function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true)
    api.get('/totem/pedidos', { params: { dias, ...(status ? { status } : {}) } })
      .then((r) => setPedidos(Array.isArray(r.data?.pedidos) ? r.data.pedidos : []))
      .catch((e) => { if (!silencioso) notify(erroDe(e, 'Não foi possível carregar os pedidos do totem.'), 'error') })
      .finally(() => setCarregando(false))
  }

  // Sem Promise no useEffect (regra do projeto): a função chama e o efeito só devolve o
  // clean-up do intervalo. Recarrega ao trocar filtro e a cada 60 s (o mesmo passo do job).
  useEffect(() => {
    carregar()
    const t = setInterval(() => carregar(true), 60_000)
    return () => clearInterval(t)
  }, [dias, status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reconciliar() {
    const pedido = confirmReconciliar
    setAgindo(true)
    try {
      const { data } = await api.post(`/totem/pedidos/${pedido.id}/reconciliar`)
      notify(data?.encontrado
        ? 'Pedido encontrado no Cardápio Web e marcado como criado.'
        : 'Ainda não encontrado no Cardápio Web. O robô continua tentando.',
        data?.encontrado ? 'success' : 'info')
      setConfirmReconciliar(null)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível reconciliar agora.'), 'error')
      setConfirmReconciliar(null)
    } finally {
      setAgindo(false)
    }
  }

  async function confirmarCriado() {
    const { pedido, cwOrderId } = modalCriado
    setAgindo(true)
    try {
      await api.post(`/totem/pedidos/${pedido.id}/confirmar-criado`, { cwOrderId: Number(cwOrderId) })
      notify('Pedido confirmado como criado no Cardápio Web.')
      setModalCriado(null)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível confirmar.'), 'error')
      carregar(true)
    } finally {
      setAgindo(false)
    }
  }

  async function encerrar() {
    const { pedido, motivo } = modalEncerrar
    setAgindo(true)
    try {
      await api.post(`/totem/pedidos/${pedido.id}/encerrar`, { motivo: motivo.trim() })
      notify('Pedido encerrado como não criado.')
      setModalEncerrar(null)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível encerrar.'), 'error')
      carregar(true)
    } finally {
      setAgindo(false)
    }
  }

  const podeReconciliar = (p) => ['AMBIGUO', 'REVISAO_MANUAL', 'ENVIANDO'].includes(p.status)
  const podeConfirmar = (p) => ['AMBIGUO', 'REVISAO_MANUAL'].includes(p.status)
  const podeEncerrar = (p) => p.status === 'REVISAO_MANUAL'

  const emRevisao = pedidos.filter((p) => p.status === 'REVISAO_MANUAL').length
  const cwIdValido = modalCriado ? /^\d{1,12}$/.test(String(modalCriado.cwOrderId).trim()) && Number(modalCriado.cwOrderId) > 0 : false
  const motivoValido = modalEncerrar ? modalEncerrar.motivo.trim().length >= 3 : false

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pedidos do totem</h1>
          <div className="page-header-sub">
            Tudo que o totem enviou ao Cardápio Web. As linhas em <strong>“Revisar agora”</strong> são as que a máquina
            não conseguiu resolver: alguém precisa abrir o painel do Cardápio Web e dizer se o pedido existe ou não.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {emRevisao > 0 && (
        <div className="ttm-alerta-admin">
          <strong>{emRevisao === 1 ? '1 pedido aguarda sua decisão' : `${emRevisao} pedidos aguardam sua decisão`}.</strong>{' '}
          Confira no painel do Cardápio Web e use “Confirmar criado” ou “Encerrar”.
        </div>
      )}

      <div className="ttm-filtros">
        <div className="wz-seg" role="group" aria-label="Período">
          {DIAS.map((d) => (
            <button
              key={d.valor}
              type="button"
              className={'wz-seg-btn' + (dias === d.valor ? ' ttm-seg-on' : '')}
              aria-pressed={dias === d.valor}
              onClick={() => setDias(d.valor)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <select className="form-input" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {Object.entries(STATUS).map(([valor, s]) => <option key={valor} value={valor}>{s.label}</option>)}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => carregar()}>Atualizar</button>
      </div>

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : pedidos.length === 0 ? (
        <div className="empty-state">
          Nenhum pedido do totem neste período. Quando um cliente confirmar um pedido no totem, ele aparece aqui com o número do Cardápio Web.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Aparelho</th>
                <th>Modo</th>
                <th>Nº no cardápio</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Situação</th>
                <th>Detalhes</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const s = STATUS[p.status] ?? { label: p.status, badge: 'badge-slate' }
                return (
                  <tr key={p.id} className={p.status === 'REVISAO_MANUAL' ? 'ttm-linha-revisao' : undefined}>
                    <td className="ttm-nowrap">{dataHora(p.tentadoEm)}</td>
                    <td>{p.aparelho?.nome ?? '—'}</td>
                    <td>{MODO[p.orderType] ?? p.orderType}</td>
                    <td className="ttm-display">{p.cwDisplayId ? `#${p.cwDisplayId}` : (p.status === 'CRIADO' ? 'gerando…' : '—')}</td>
                    <td style={{ textAlign: 'right' }}>{moeda(p.totalCalculado)}</td>
                    <td><span className={'badge ' + s.badge}>{s.label}</span></td>
                    <td>
                      <div className="ttm-ref">ref. {p.displayIdEnviado}</div>
                      {p.erroCodigo && (
                        <div className="ttm-erro" title={p.erroDetalhe || p.erroCodigo}>
                          {p.erroCodigo}{p.erroDetalhe ? ` · ${encurtar(p.erroDetalhe)}` : ''}
                        </div>
                      )}
                      {p.decisaoJson && (
                        <div className="ttm-decisao" title={p.decisaoJson.motivo || ''}>
                          {p.decisaoJson.acao === 'encerrar' ? 'encerrado' : 'confirmado'} por {p.decisaoJson.usuarioId} em {dataHora(p.decisaoJson.em)}
                          {p.decisaoJson.motivo ? ` · ${encurtar(p.decisaoJson.motivo, 40)}` : ''}
                        </div>
                      )}
                      {p.revisaoEm && !p.decisaoJson && <div className="ttm-decisao">em revisão desde {dataHora(p.revisaoEm)}</div>}
                    </td>
                    <td>
                      <div className="ttm-acoes">
                        {podeReconciliar(p) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReconciliar(p)}>Reconciliar</button>
                        )}
                        {podeConfirmar(p) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalCriado({ pedido: p, cwOrderId: '' })}>Confirmar criado</button>
                        )}
                        {podeEncerrar(p) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalEncerrar({ pedido: p, motivo: '' })}>Encerrar</button>
                        )}
                        {!podeReconciliar(p) && !podeConfirmar(p) && <span className="ttm-meta-txt">—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmReconciliar}
        loading={agindo}
        title="Procurar este pedido no Cardápio Web agora?"
        message={confirmReconciliar ? `Referência ${confirmReconciliar.displayIdEnviado}` : ''}
        description="Nada é enviado de novo: o sistema só procura, no Cardápio Web, um pedido com esta referência. Se achar, a linha vira “Criado”."
        confirmLabel="Reconciliar agora"
        cancelLabel="Cancelar"
        onConfirm={reconciliar}
        onCancel={() => setConfirmReconciliar(null)}
      />

      <ModalEntrada
        aberto={!!modalCriado}
        titulo="Confirmar que o pedido foi criado"
        descricao={modalCriado
          ? `Abra o painel do Cardápio Web, encontre o pedido da referência ${modalCriado.pedido.displayIdEnviado} e informe o número (ID) dele. O sistema confere que aquele pedido é este antes de aceitar.`
          : ''}
        confirmLabel="Confirmar criado"
        confirmDesabilitado={!cwIdValido}
        loading={agindo}
        onConfirm={confirmarCriado}
        onCancel={() => setModalCriado(null)}
      >
        <label className="form-label" htmlFor="ttm-cwid">Número do pedido no Cardápio Web</label>
        <input
          id="ttm-cwid"
          className="form-input"
          inputMode="numeric"
          placeholder="Ex.: 1843277"
          value={modalCriado?.cwOrderId ?? ''}
          onChange={(e) => setModalCriado((m) => ({ ...m, cwOrderId: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
        />
        {!cwIdValido && <div className="ttm-dica">Só números, como aparece no painel.</div>}
      </ModalEntrada>

      <ModalEntrada
        aberto={!!modalEncerrar}
        titulo="Encerrar como NÃO criado"
        descricao={modalEncerrar
          ? `Use isto só depois de confirmar no painel do Cardápio Web que o pedido da referência ${modalEncerrar.pedido.displayIdEnviado} realmente não existe. A decisão fica registrada com o seu usuário.`
          : ''}
        confirmLabel="Encerrar pedido"
        confirmDesabilitado={!motivoValido}
        loading={agindo}
        onConfirm={encerrar}
        onCancel={() => setModalEncerrar(null)}
      >
        <label className="form-label" htmlFor="ttm-motivo">Motivo</label>
        <textarea
          id="ttm-motivo"
          className="form-input"
          rows={3}
          maxLength={300}
          placeholder="Ex.: conferido no painel, o pedido não chegou ao Cardápio Web."
          value={modalEncerrar?.motivo ?? ''}
          onChange={(e) => setModalEncerrar((m) => ({ ...m, motivo: e.target.value }))}
        />
        {!motivoValido && <div className="ttm-dica">Escreva pelo menos 3 caracteres.</div>}
      </ModalEntrada>
    </div>
  )
}
