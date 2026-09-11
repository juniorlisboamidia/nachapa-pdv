import axios from 'axios'

// Backend do próprio PDV/Operação (banco próprio).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api'
// API de identidade = NaChapa HUB (login / perfil / logout). Mesmo JWT_SECRET.
const HUB_API_URL = import.meta.env.VITE_HUB_API_URL || 'http://localhost:3001/api'

export const TOKEN_KEY = 'pdv_token'
// Loja (tenant) ativa — enviada como X-Empresa-Id em toda chamada ao PDV.
export const EMPRESA_KEY = 'pdv_empresa_id'
// Sessão da Área do Colaborador (token OTP assinado pelo PDV, ~30 dias).
export const COLAB_TOKEN_KEY = 'pdv_colab_token'

// Anexa o Bearer (fallback ao cookie SSO, útil em desenvolvimento).
function comBearer(config) {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}

// Cliente do PDV — envia o cookie SSO (withCredentials), o Bearer e a loja ativa.
const api = axios.create({ baseURL: API_URL, withCredentials: true })
api.interceptors.request.use((config) => {
  comBearer(config)
  const empresaId = localStorage.getItem(EMPRESA_KEY)
  if (empresaId) config.headers['X-Empresa-Id'] = empresaId
  return config
})

// Cliente de identidade (HUB): login/logout. withCredentials p/ o cookie SSO
// compartilhado entre os subdomínios .nachapahub.com.br.
export const hubApi = axios.create({ baseURL: HUB_API_URL, withCredentials: true })
hubApi.interceptors.request.use(comBearer)

// Cliente do APARELHO (totem / TV — rotas /api/public/aparelho/*). SEM Bearer e SEM
// X-Empresa-Id de propósito: quem prova quem o aparelho é, e de qual loja, é o cookie
// HttpOnly `pdv_aparelho`. Anexar Bearer/X-Empresa-Id aqui seria oferecer ao servidor uma
// identidade vinda do navegador, exatamente o que a spec §3.2/§5.2 proíbe.
// Sobre o cookie viajar: em produção o front e a API dividem o mesmo host, então a chamada
// é same-origin e o navegador manda o cookie sozinho. Em dev com VITE_API_URL absoluto
// (http://localhost:4001/api) a chamada é CROSS-ORIGIN — funciona porque é mesmo site
// (localhost), com CORS liberado e SameSite permitindo; é o `withCredentials` que faz o
// cookie ir junto. O proxy `/api` do vite.config.js só entra em cena quando a base é
// RELATIVA (sem VITE_API_URL) — aí sim a origem volta a ser a mesma.
export const aparelhoApi = axios.create({ baseURL: API_URL, withCredentials: true })

// Cliente da Área do Colaborador — usa SÓ o token de sessão do colaborador (nunca o
// token de admin). Isolado do `api` para não misturar credenciais no mesmo aparelho.
export const colabApi = axios.create({ baseURL: API_URL })
colabApi.interceptors.request.use((config) => {
  const t = localStorage.getItem(COLAB_TOKEN_KEY)
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

export default api
