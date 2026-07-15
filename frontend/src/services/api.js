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

// Cliente da Área do Colaborador — usa SÓ o token de sessão do colaborador (nunca o
// token de admin). Isolado do `api` para não misturar credenciais no mesmo aparelho.
export const colabApi = axios.create({ baseURL: API_URL })
colabApi.interceptors.request.use((config) => {
  const t = localStorage.getItem(COLAB_TOKEN_KEY)
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

export default api
