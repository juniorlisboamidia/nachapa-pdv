// Cadastro público de promotor (Programa de Indicação). Sem sidebar/Layout.
// Mostra os benefícios (recompensas) para converter melhor.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import BotaoCopiar from '../components/BotaoCopiar'
import { mascararTelefone } from '../utils/telefone'

const descontoAmigo = (tipo, valor) =>
  tipo === 'free_shipping' ? 'frete grátis'
    : tipo === 'flat_discount' ? `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')} de desconto`
      : `${valor || 0}% de desconto`

export default function SejaPromotor() {
  const { token } = useParams()
  const [estado, setEstado] = useState('loading') // loading | erro | form | enviado
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // { empresa:{nome,logo}, ativo, banner, recompensas, cupomAmigo }
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [resultado, setResultado] = useState(null) // { nome, codigo, painelToken }

  useEffect(() => {
    api.get(`/public/indicacao/promotor/${token}`)
      .then((r) => {
        setDados(r.data)
        if (r.data.ativo) setEstado('form')
        else { setErro('O programa de indicação está pausado no momento.'); setEstado('erro') }
      })
      .catch((e) => { setErro(e?.response?.data?.error ?? 'Programa não encontrado.'); setEstado('erro') })
  }, [token])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const linkAmigo = resultado ? `${origin}/i/${resultado.codigo}` : ''
  const linkPainel = resultado ? `${origin}/indicacao/painel/${resultado.painelToken}` : ''

  async function enviar() {
    setErroForm('')
    if (!nome.trim()) return setErroForm('Informe seu nome.')
    if (!whatsapp.replace(/\D/g, '')) return setErroForm('Informe seu WhatsApp.')
    setEnviando(true)
    try {
      const r = await api.post(`/public/indicacao/promotor/${token}`, { nome, whatsapp })
      setResultado(r.data); setEstado('enviado')
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setErroForm(e?.response?.data?.error ?? 'Não foi possível cadastrar. Tente novamente.') }
    finally { setEnviando(false) }
  }

  if (estado === 'loading') return <div className="pub-page"><div className="pub-card"><div style={{ textAlign: 'center' }}>Carregando…</div></div></div>
  if (estado === 'erro') return <div className="pub-page"><div className="pub-card"><div className="pub-erro"><div className="pub-erro-titulo">Ops…</div><div className="pub-erro-msg">{erro}</div></div></div></div>

  const empresa = dados?.empresa || {}
  const recompensas = dados?.recompensas || []
  const cupomAmigo = dados?.cupomAmigo

  return (
    <div className="pub-page">
      <div className="ind-amigo">
        {dados?.banner && <img className="ind-amigo-banner" src={dados.banner} alt="" />}
        {empresa.logo && <img className={'ind-amigo-logo' + (dados?.banner ? '' : ' ind-amigo-logo-solo')} src={empresa.logo} alt={empresa.nome} />}

        {estado === 'form' && (
          <>
            <div className="ind-amigo-card ind-amigo-hero">
              <div className="ind-amigo-titulo">Seja um promotor 🚀</div>
              <div className="ind-amigo-sub">Indique amigos e ganhe recompensas exclusivas da casa.</div>
              {cupomAmigo && <div className="sp-friend">🎁 E seus amigos ganham <strong>{descontoAmigo(cupomAmigo.tipoDesconto, cupomAmigo.valor)}</strong> de boas-vindas</div>}
            </div>

            <div className="ind-amigo-card">
              <div className="ind-amigo-formtitle" style={{ textAlign: 'center' }}>Como funciona</div>
              <div className="sp-steps">
                <div className="sp-step"><span className="sp-step-ico">📣</span><span>Compartilhe seu link exclusivo com amigos.</span></div>
                <div className="sp-step"><span className="sp-step-ico">🍔</span><span>Seu amigo se cadastra e faz o primeiro pedido.</span></div>
                <div className="sp-step"><span className="sp-step-ico">🏆</span><span>A cada meta atingida, você desbloqueia uma recompensa.</span></div>
              </div>
            </div>

            {recompensas.length > 0 && (
              <div className="ind-amigo-card">
                <div className="ind-amigo-formtitle" style={{ textAlign: 'center' }}>Recompensas por indicar</div>
                <div className="ind-amigo-formsub">Quanto mais amigos comprarem, mais você ganha.</div>
                <div className="sp-rewards">
                  {recompensas.map((r, i) => (
                    <div className="sp-reward" key={i}>
                      <div className="sp-reward-num">{r.meta}</div>
                      <span className="sp-reward-emoji">{r.emoji || '🎁'}</span>
                      <div className="sp-reward-txt">
                        <div className="sp-reward-titulo">{r.titulo}</div>
                        <div className="sp-reward-meta">Com {r.meta} {r.meta === 1 ? 'indicação' : 'indicações'}{r.tipo === 'BRINDE' ? ' · brinde' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ind-amigo-card">
              <div className="ind-amigo-formtitle">Quero participar</div>
              <div className="ind-amigo-formsub">Cadastre-se e receba seu link exclusivo agora.</div>
              <div className="form-group"><label className="form-label">Seu nome *</label>
                <input className="form-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></div>
              <div className="form-group"><label className="form-label">Seu WhatsApp *</label>
                <div className="ind-phone">
                  <span className="ind-phone-flag">🇧🇷 +55</span>
                  <input className="form-input ind-phone-input" inputMode="numeric" value={mascararTelefone(whatsapp)} onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              {erroForm && <div className="pub-erro-msg" style={{ color: '#dc2626', margin: '4px 0' }}>{erroForm}</div>}
              <button type="button" className="ind-cta ind-cta-orange" onClick={enviar} disabled={enviando}>{enviando ? 'Cadastrando…' : '🚀  Quero ser promotor'}</button>
            </div>
          </>
        )}

        {estado === 'enviado' && resultado && (
          <>
            <div className="ind-amigo-card" style={{ textAlign: 'center' }}>
              <div className="pub-sucesso-icone">✓</div>
              <div className="pub-sucesso-titulo">Tudo certo, {resultado.nome.split(' ')[0]}! 🎉</div>
              <div className="pub-sucesso-msg">Compartilhe seu link. Cada amigo que comprar te aproxima das recompensas.</div>
            </div>
            <div className="ind-amigo-card">
              <div className="ind-link">
                <div className="ind-link-ico ip-ico-orange">🔗</div>
                <div className="ind-link-body">
                  <div className="ind-link-title">Seu link de indicação</div>
                  <div className="ind-link-desc">Envie para seus amigos nas redes e no WhatsApp.</div>
                  <div className="ind-linkfield">
                    <span className="ind-linkfield-url">{linkAmigo}</span>
                    <BotaoCopiar className="ind-linkfield-copy" label="Copiar" texto={linkAmigo} />
                  </div>
                </div>
              </div>
              <div className="ind-link">
                <div className="ind-link-ico ip-ico-blue">📊</div>
                <div className="ind-link-body">
                  <div className="ind-link-title">Seu painel <span className="ind-link-tag">privado</span></div>
                  <div className="ind-link-desc">Acompanhe suas indicações e resgate recompensas. Guarde este link — é só seu.</div>
                  <div className="ind-linkfield">
                    <span className="ind-linkfield-url">{linkPainel}</span>
                    <BotaoCopiar className="ind-linkfield-copy" label="Copiar" texto={linkPainel} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
