// Painel privado do promotor (link secreto). Progresso + recompensas. Sem Layout.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import BotaoCopiar from '../components/BotaoCopiar'

const DESTINO_LABEL = { SALAO: 'Salão', DELIVERY: 'Delivery' }
const STATUS_LABEL = { DISPONIVEL: 'Disponível', USADO: 'Utilizada', CANCELADO: 'Cancelada' }

export default function PainelPromotor() {
  const { token } = useParams()
  const [estado, setEstado] = useState('loading') // loading | erro | ok
  const [erro, setErro] = useState('')
  const [d, setD] = useState(null)

  useEffect(() => {
    api.get(`/public/indicacao/painel/${token}`)
      .then((r) => { setD(r.data); setEstado('ok') })
      .catch((e) => { setErro(e?.response?.data?.error ?? 'Painel não encontrado.'); setEstado('erro') })
  }, [token])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const linkAmigo = d ? `${origin}/i/${d.promotor.codigo}` : ''

  const pct = d && d.proxima ? Math.min(100, Math.round((d.validadas / d.proxima.meta) * 100)) : (d && d.tiers.length ? 100 : 0)

  return (
    <div className="pub-page">
      <div className="pub-card pub-card-wide">
        {estado === 'loading' && <div className="pub-instrucao" style={{ textAlign: 'center' }}>Carregando…</div>}

        {estado === 'erro' && (
          <div className="pub-erro"><div className="pub-erro-titulo">Ops…</div><div className="pub-erro-msg">{erro}</div></div>
        )}

        {estado === 'ok' && d && (
          <>
            <div className="pub-header">
              <div className="pub-empresa">{d.empresa.nome}</div>
              <div className="pub-titulo">Olá, {d.promotor.nome.split(' ')[0]}</div>
              <div className="ind-sub">Seu painel de indicações</div>
            </div>

            <div className="ind-stats">
              <div className="ind-stat"><div className="ind-stat-num">{d.validadas}</div><div className="ind-stat-label">Validadas</div></div>
              <div className="ind-stat"><div className="ind-stat-num">{d.pendentes}</div><div className="ind-stat-label">Pendentes</div></div>
            </div>

            {d.proxima ? (
              <div className="ind-prox">
                <div className="ind-prox-top"><span>Próxima: <strong>{d.proxima.titulo}</strong></span><span>{d.validadas}/{d.proxima.meta}</span></div>
                <div className="ind-bar"><div className="ind-bar-fill" style={{ width: `${pct}%` }} /></div>
                <div className="ind-hint">Faltam {d.proxima.faltam} indicação(ões) validada(s).</div>
              </div>
            ) : d.tiers.length > 0 ? (
              <div className="ind-hint" style={{ textAlign: 'center', margin: '8px 0' }}>Você desbloqueou todas as recompensas! 🎉</div>
            ) : null}

            {d.recompensas.length > 0 && (
              <div className="ind-secao">
                <div className="ind-secao-titulo">Suas recompensas</div>
                {d.recompensas.map((r) => (
                  <div key={r.codigo} className={'ind-recompensa' + (r.status !== 'DISPONIVEL' ? ' usada' : '')}>
                    <div><div className="ind-recompensa-titulo">{r.titulo}</div><div className="ind-recompensa-sub">{DESTINO_LABEL[r.destino] ?? r.destino}</div></div>
                    <div className="ind-recompensa-codigo">{r.status === 'DISPONIVEL' ? r.codigo : STATUS_LABEL[r.status]}</div>
                  </div>
                ))}
                <div className="ind-hint">Apresente o código no balcão para resgatar.</div>
              </div>
            )}

            {d.tiers.length > 0 && (
              <div className="ind-secao">
                <div className="ind-secao-titulo">Metas</div>
                {d.tiers.map((t) => (
                  <div key={t.meta} className={'ind-tier' + (t.atingido ? ' ok' : '')}>
                    <span className="ind-tier-check">{t.atingido ? '✓' : t.meta}</span>
                    <div className="ind-tier-info"><div>{t.titulo}</div><div className="ind-recompensa-sub">{t.meta} validadas · {DESTINO_LABEL[t.destino] ?? t.destino}</div></div>
                  </div>
                ))}
              </div>
            )}

            <div className="ind-linkbox">
              <div className="ind-linkbox-label">Seu link de indicação</div>
              <div className="ind-linkbox-url">{linkAmigo}</div>
              <BotaoCopiar className="btn btn-primary btn-copiar-inverso" style={{ width: '100%', justifyContent: 'center' }} label="Copiar link" texto={linkAmigo} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
