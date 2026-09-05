// Balcão (atendente) — busca um código e dá baixa. Público por token secreto.
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const DESTINO_LABEL = { SALAO: 'Salão', DELIVERY: 'Delivery' }
const TIPO_LABEL = { INDICACAO: 'Cupom de indicação', RECOMPENSA: 'Recompensa do promotor' }
const STATUS_LABEL = { DISPONIVEL: 'Disponível', USADO: 'Já utilizado', CANCELADO: 'Cancelado' }

export default function IndicacaoAtendente() {
  const { token } = useParams()
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [cupom, setCupom] = useState(null)
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [ok, setOk] = useState(null) // { titulo, novasRecompensas }
  const [usadoPor, setUsadoPor] = useState('')

  async function buscar(e) {
    e?.preventDefault?.()
    const c = codigo.trim().toUpperCase()
    setErro(''); setCupom(null); setOk(null)
    if (!c) return setErro('Digite um código.')
    setBuscando(true)
    try {
      const r = await api.get(`/public/indicacao/atendente/${token}/cupom`, { params: { codigo: c } })
      setCupom(r.data)
    } catch (e2) { setErro(e2?.response?.data?.error ?? 'Cupom não encontrado.') }
    finally { setBuscando(false) }
  }

  async function darBaixa() {
    if (!cupom) return
    setBaixando(true); setErro('')
    try {
      const r = await api.post(`/public/indicacao/atendente/${token}/baixa`, { codigo: cupom.codigo, usadoPor })
      setOk({ titulo: cupom.titulo, novasRecompensas: r.data.novasRecompensas ?? [] })
      setCupom(null); setCodigo(''); setUsadoPor('')
    } catch (e) { setErro(e?.response?.data?.error ?? 'Não foi possível dar baixa.') }
    finally { setBaixando(false) }
  }

  return (
    <div className="pub-page">
      <div className="pub-card">
        <div className="pub-header">
          <div className="pub-empresa">Balcão</div>
          <div className="pub-titulo">Dar baixa em cupom</div>
          <div className="ind-sub">Digite o código que o cliente apresentou.</div>
        </div>

        <form className="ind-busca" onSubmit={buscar}>
          <input className="form-input ind-busca-input" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código do cupom" autoFocus />
          <button type="submit" className="btn btn-primary" disabled={buscando}>{buscando ? '…' : 'Buscar'}</button>
        </form>

        {erro && <div className="pub-erro-msg" style={{ color: '#dc2626', margin: '6px 0' }}>{erro}</div>}

        {ok && (
          <div className="ind-baixa-ok">
            <div className="pub-sucesso-icone">✓</div>
            <div className="pub-sucesso-titulo">Baixa registrada!</div>
            <div className="pub-sucesso-msg">{ok.titulo}</div>
            {ok.novasRecompensas.length > 0 && (
              <div className="ind-novas">
                <div className="ind-novas-titulo">🎉 Recompensa(s) desbloqueada(s) para o promotor:</div>
                {ok.novasRecompensas.map((r) => (
                  <div key={r.codigo} className="ind-nova">{r.titulo} — <strong>{r.codigo}</strong> ({DESTINO_LABEL[r.destino] ?? r.destino})</div>
                ))}
              </div>
            )}
          </div>
        )}

        {cupom && (
          <div className="ind-cupom-card">
            <div className="ind-cupom-card-top">
              <div>
                <div className="ind-cupom-card-tipo">{TIPO_LABEL[cupom.tipo] ?? cupom.tipo}</div>
                <div className="ind-cupom-card-titulo">{cupom.titulo}</div>
              </div>
              <span className={'badge ' + (cupom.status === 'DISPONIVEL' ? 'badge-green' : 'badge-gray')}>{STATUS_LABEL[cupom.status] ?? cupom.status}</span>
            </div>
            <div className="ind-cupom-card-linha">Para: <strong>{cupom.para}</strong></div>
            <div className="ind-cupom-card-linha">Válido: {DESTINO_LABEL[cupom.destino] ?? cupom.destino}</div>
            {cupom.status === 'DISPONIVEL' ? (
              <>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Atendente (opcional)</label>
                  <input className="form-input" value={usadoPor} onChange={(e) => setUsadoPor(e.target.value)} placeholder="Quem está dando baixa" />
                </div>
                <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={baixando} onClick={darBaixa}>{baixando ? 'Dando baixa…' : 'Dar baixa'}</button>
              </>
            ) : (
              <div className="ind-hint" style={{ textAlign: 'center', marginTop: 8 }}>Este cupom não está mais disponível.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
