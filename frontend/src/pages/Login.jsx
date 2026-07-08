import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Reset de senha e gerido pelo HUB (login unificado).
const HUB_URL = import.meta.env.VITE_HUB_URL || 'https://nachapahub.com.br'

const C = { laranja: '#ff5f00', laranjaHover: '#e65500' }

const MailIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
)
const LockIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
)
const Olho = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const OlhoFechado = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export default function Login() {
  const { login, verificar2fa } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ticket, setTicket] = useState(null) // 2FA pendente
  const [code, setCode] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [focado, setFocado] = useState(null)
  const [logoErro, setLogoErro] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      if (ticket) {
        await verificar2fa({ ticket, code })
      } else {
        const r = await login(email.trim(), senha)
        if (r.twoFactorRequired) { setTicket(r.ticket); setEnviando(false); return }
      }
      // Sucesso: o AuthProvider seta o usuario e o App re-renderiza no app.
    } catch (err) {
      setErro(err?.response?.data?.error || err?.message || 'Nao foi possivel entrar.')
    } finally {
      setEnviando(false)
    }
  }

  const inputBase = (campo) => ({
    width: '100%', padding: '10px 12px 10px 38px', borderRadius: 8, fontSize: 14,
    background: 'var(--app-surface)', color: 'var(--app-text)',
    border: `1px solid ${focado === campo ? C.laranja : '#e5e7eb'}`,
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
  })
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }
  const iconWrap = { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', display: 'flex', pointerEvents: 'none' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#0a0a0a' }}>
      <div style={{
        width: '100%', maxWidth: 420, background: 'var(--app-surface)',
        borderRadius: 24, border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)', padding: '40px 34px',
      }}>
        {/* Marca */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {!logoErro ? (
            <img
              src="/logo-chapa-gestao.png"
              alt="Chapa & Gestão"
              onError={() => setLogoErro(true)}
              style={{ width: 208, maxWidth: '72%', height: 'auto', objectFit: 'contain', margin: '0 auto', display: 'block' }}
            />
          ) : (
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--app-text)', letterSpacing: '-0.02em' }}>Chapa &amp; Gestão</div>
          )}
        </div>

        {/* Título do login */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--app-text)', margin: 0 }}>
            {ticket ? 'Verificação em duas etapas' : 'Faça seu login'}
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
            {ticket
              ? 'Digite o código de 6 dígitos do seu app autenticador.'
              : 'Acompanhe os números da sua empresa pelo nosso sistema integrado.'}
          </p>
        </div>

        <form onSubmit={submit}>
          {!ticket ? (
            <>
              {/* E-mail */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>E-mail</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconWrap}><MailIcon /></span>
                  <input
                    style={inputBase('email')} type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocado('email')} onBlur={() => setFocado(null)}
                    placeholder="seu@email.com" autoComplete="username" disabled={enviando}
                  />
                </div>
              </div>

              {/* Senha */}
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Senha</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconWrap}><LockIcon /></span>
                  <input
                    style={{ ...inputBase('senha'), paddingRight: 40 }}
                    type={mostrarSenha ? 'text' : 'password'} value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    onFocus={() => setFocado('senha')} onBlur={() => setFocado(null)}
                    placeholder="••••••••" autoComplete="current-password" disabled={enviando}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                  >
                    {mostrarSenha ? <OlhoFechado /> : <Olho />}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginBottom: 18 }}>
                <a href={`${HUB_URL}/esqueci-senha`} style={{ fontSize: 12, fontWeight: 600, color: C.laranja, textDecoration: 'none' }}>
                  Esqueci minha senha
                </a>
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Código do app autenticador</label>
              <input
                style={{ ...inputBase('code'), padding: '10px 12px', letterSpacing: 6, textAlign: 'center', fontSize: 18 }}
                inputMode="numeric" value={code}
                onFocus={() => setFocado('code')} onBlur={() => setFocado(null)}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" disabled={enviando} autoFocus
              />
            </div>
          )}

          {erro && (
            <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 16 }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: enviando ? '#f0a878' : C.laranja,
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: enviando ? 'default' : 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseOver={(e) => { if (!enviando) e.currentTarget.style.background = C.laranjaHover }}
            onMouseOut={(e) => { if (!enviando) e.currentTarget.style.background = C.laranja }}
          >
            {enviando ? 'Entrando...' : (ticket ? 'Confirmar' : 'Entrar')}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 26 }}>
          Acesso restrito · NaChapa
        </div>
      </div>
    </div>
  )
}
