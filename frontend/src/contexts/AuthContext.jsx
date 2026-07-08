import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api, { hubApi, TOKEN_KEY, EMPRESA_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [lojas, setLojas] = useState([])
  const [empresaAtual, setEmpresaAtual] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)

  const carregar = useCallback(async () => {
    try {
      // /me do próprio PDV: valida o cookie SSO (ou Bearer) e devolve o perfil do JWT.
      // O backend só responde 200 para ADMIN; 403 => "sem acesso ao Operação".
      const { data: u } = await api.get('/auth/me')
      // Lojas que o usuario pode ver (Admin todas; Cliente as dele; Agencia liberadas).
      let lojasResp = []
      try { const r = await api.get('/lojas'); lojasResp = Array.isArray(r.data) ? r.data : [] } catch { /* ainda sem loja */ }
      setLojas(lojasResp)
      // Loja ativa: a salva (se ainda valida) ou a primeira disponivel.
      const salva = localStorage.getItem(EMPRESA_KEY)
      const valida = lojasResp.find((l) => String(l.id) === String(salva))
      const atual = valida ? valida.id : (lojasResp[0]?.id ?? null)
      if (atual != null) localStorage.setItem(EMPRESA_KEY, String(atual))
      else localStorage.removeItem(EMPRESA_KEY)
      setEmpresaAtual(atual)
      setUsuario(u)
      setSemAcesso(false)
    } catch (err) {
      if (err?.response?.status === 403) setSemAcesso(true) // logado, mas sem acesso ao Operação
      localStorage.removeItem(TOKEN_KEY)
      setUsuario(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Troca a loja ativa e recarrega para as paginas re-buscarem os dados da nova loja.
  const trocarLoja = useCallback((id) => {
    if (id == null) return
    localStorage.setItem(EMPRESA_KEY, String(id))
    setEmpresaAtual(id)
    window.location.reload()
  }, [])

  // Re-busca a lista de lojas (apos criar uma nova, por ex.).
  const recarregarLojas = useCallback(async () => {
    try { const r = await api.get('/lojas'); setLojas(Array.isArray(r.data) ? r.data : []) } catch { /* ignore */ }
  }, [])

  // Login delegado ao HUB. Retorna { twoFactorRequired, ticket } quando há 2FA.
  // Quem decide o acesso ao PDV é o backend (só ADMIN) — aqui só guardamos o token
  // e chamamos carregar(); um não-ADMIN cai em "sem acesso" pelo /auth/me (403).
  const login = async (email, senha) => {
    const { data } = await hubApi.post('/auth/login', { email, senha })
    if (data.twoFactorRequired) return { twoFactorRequired: true, ticket: data.ticket }
    localStorage.setItem(TOKEN_KEY, data.token)
    await carregar()
    return { twoFactorRequired: false }
  }

  // Segundo fator (quando o login exige). Também delegado ao HUB.
  const verificar2fa = async ({ ticket, code }) => {
    const { data } = await hubApi.post('/auth/2fa/verify', { ticket, code })
    localStorage.setItem(TOKEN_KEY, data.token)
    await carregar()
    return data.usuario
  }

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMPRESA_KEY)
    setUsuario(null)
    setLojas([])
    setEmpresaAtual(null)
    try { await hubApi.post('/auth/logout') } catch { /* best-effort */ }
  }

  return (
    <AuthContext.Provider value={{ usuario, lojas, empresaAtual, carregando, semAcesso, login, verificar2fa, logout, trocarLoja, recarregarLojas }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
