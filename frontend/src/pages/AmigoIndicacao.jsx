// Página do amigo indicado (resgata o cupom). Sem sidebar/Layout.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { mascararTelefone } from '../utils/telefone'
import CupomTicket, { cupomBg } from '../components/CupomTicket'

const DESTINO_LABEL = { SALAO: 'Salão', DELIVERY: 'Delivery' }
const descontoAmigo = (tipo, valor) => {
  if (tipo === 'free_shipping') return 'Frete grátis'
  if (tipo === 'flat_discount') return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')} OFF`
  return `${valor}% OFF`
}

function Confetti() {
  const cores = ['#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6']
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const left = Math.random() * 100
    const delay = Math.random() * 0.6
    const dur = 2.4 + Math.random() * 1.8
    const size = 6 + Math.random() * 6
    const rot = Math.random() * 360
    return <span key={i} className="confetti-piece" style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s`, background: cores[i % cores.length], width: size, height: size, transform: `rotate(${rot}deg)` }} />
  })
  return <div className="confetti" aria-hidden="true">{pieces}</div>
}

export default function AmigoIndicacao() {
  const { codigo } = useParams()
  const [estado, setEstado] = useState('loading') // loading | erro | form | enviado
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // { empresa:{nome,logo,banner}, promotor, cupom }
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [cupom, setCupom] = useState(null) // { codigo, titulo, destino, repetido }

  useEffect(() => {
    api.get(`/public/indicacao/i/${codigo}`)
      .then((r) => { setDados(r.data); setEstado('form') })
      .catch((e) => { setErro(e?.response?.data?.error ?? 'Link inválido ou expirado.'); setEstado('erro') })
  }, [codigo])

  async function enviar() {
    setErroForm('')
    if (!nome.trim()) return setErroForm('Informe seu nome.')
    if (!whatsapp.replace(/\D/g, '')) return setErroForm('Informe seu WhatsApp.')
    const campos = dados?.campos || {}
    if (campos.email === 'obrigatorio' && !email.trim()) return setErroForm('Informe seu e-mail.')
    if (campos.nascimento === 'obrigatorio' && !nascimento) return setErroForm('Informe sua data de nascimento.')
    setEnviando(true)
    try {
      const r = await api.post(`/public/indicacao/i/${codigo}`, { nome, whatsapp, email, nascimento })
      setCupom(r.data); setEstado('enviado')
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setErroForm(e?.response?.data?.error ?? 'Não foi possível resgatar. Tente novamente.') }
    finally { setEnviando(false) }
  }

  if (estado === 'loading') return <div className="pub-page"><div className="pub-card"><div style={{ textAlign: 'center' }}>Carregando…</div></div></div>
  if (estado === 'erro') return <div className="pub-page"><div className="pub-card"><div className="pub-erro"><div className="pub-erro-titulo">Ops…</div><div className="pub-erro-msg">{erro}</div></div></div></div>

  const empresa = dados?.empresa || {}
  const bg = cupomBg(dados?.visual)
  const botaoCor = dados?.visual?.botaoCor
  const campos = dados?.campos || { email: 'opcional', nascimento: 'opcional' }
  const ctaStyle = botaoCor ? { background: botaoCor } : undefined
  return (
    <div className="pub-page">
      {estado === 'enviado' && <Confetti />}
      <div className="ind-amigo">
        {dados?.banner && <img className="ind-amigo-banner" src={dados.banner} alt="" />}
        {empresa.logo && <img className={'ind-amigo-logo' + (dados?.banner ? '' : ' ind-amigo-logo-solo')} src={empresa.logo} alt={empresa.nome} />}

        {estado === 'form' && (
          <>
            <div className="ind-amigo-card ind-amigo-hero">
              <div className="ind-amigo-eyebrow">Indique e Ganhe</div>
              <div className="ind-amigo-titulo">{dados.promotor.nome} te enviou um presente!</div>
              {dados.cupom.emoji && <div className="ind-amigo-gift">{dados.cupom.emoji}</div>}
              <div className="ind-amigo-sub">Você ganha um cupom ao aceitar a indicação.</div>
            </div>

            <div className="ind-amigo-card ind-ticket-card">
              <CupomTicket
                eyebrow={dados.cupom.titulo}
                value={descontoAmigo(dados.cupom.tipoDesconto, dados.cupom.valor)}
                caption="Presente exclusivo · o código aparece após o cadastro"
                bg={bg}
              />
            </div>

            <div className="ind-amigo-card">
              <div className="ind-amigo-formtitle">Resgate agora</div>
              <div className="ind-amigo-formsub">Preencha seus dados para garantir seu cupom</div>
              <div className="form-group"><label className="form-label">Nome *</label>
                <input className="form-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></div>
              <div className="form-group"><label className="form-label">WhatsApp *</label>
                <div className="ind-phone">
                  <span className="ind-phone-flag">🇧🇷 +55</span>
                  <input className="form-input ind-phone-input" inputMode="numeric" value={mascararTelefone(whatsapp)} onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              {campos.email !== 'nao' && (
                <div className="form-group"><label className="form-label">E-mail {campos.email === 'obrigatorio' ? '*' : '(opcional)'}</label>
                  <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
              )}
              {campos.nascimento !== 'nao' && (
                <div className="form-group"><label className="form-label">Data de nascimento {campos.nascimento === 'obrigatorio' ? '*' : '(opcional)'}</label>
                  <input className="form-input" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} /></div>
              )}
              {erroForm && <div className="pub-erro-msg" style={{ color: '#dc2626', margin: '4px 0' }}>{erroForm}</div>}
              <button type="button" className="ind-cta" style={ctaStyle} onClick={enviar} disabled={enviando}>{enviando ? 'Resgatando…' : '🎟️  Resgatar meu cupom'}</button>
            </div>
          </>
        )}

        {estado === 'enviado' && cupom && (
          <>
            <div className="ind-amigo-card" style={{ textAlign: 'center' }}>
              <div className="pub-sucesso-icone">✓</div>
              <div className="pub-sucesso-titulo">Cupom resgatado! 🎉</div>
              <div className="pub-sucesso-msg">Seu cadastro foi realizado com sucesso.</div>
              <div className="ind-oferta-sub" style={{ marginTop: 6 }}>{cupom.titulo}</div>
            </div>
            <div className="ind-amigo-card ind-ticket-card">
              <CupomTicket
                eyebrow={<>🎟️ Seu cupom · {descontoAmigo(cupom.tipoDesconto, cupom.valor)}</>}
                value={cupom.codigo}
                mono
                valueSize={(cupom.codigo || '').length > 8 ? 28 : 34}
                caption={cupom.cw ? 'Use no Cardápio Web · uso único' : 'Mostre no balcão'}
                bg={bg}
              />
              <div className="ind-hint" style={{ textAlign: 'center' }}>
                {cupom.cw
                  ? `Use este código no pedido pelo Cardápio Web e ganhe ${descontoAmigo(cupom.tipoDesconto, cupom.valor).toLowerCase()} no seu primeiro pedido (uso único).`
                  : 'Mostre este código no balcão para usar seu cupom.'}
                {cupom.repetido ? ' Você já tinha resgatado — é o mesmo código.' : ''}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
