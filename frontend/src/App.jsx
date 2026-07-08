import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Inicio from './pages/Inicio'
import EmConstrucao from './pages/EmConstrucao'

function TelaCarregando() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#737373', fontSize: 14 }}>
      Carregando...
    </div>
  )
}

function SemAcesso() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#171717' }}>Sem acesso ao Operação</h1>
      <p style={{ fontSize: 14, color: '#737373', maxWidth: 360 }}>
        Esta conta não é administradora. O acesso ao Operação é restrito ao administrador da loja.
      </p>
    </div>
  )
}

// Protege as rotas privadas: carrega o perfil (SSO/cookie) e exibe o Login quando preciso.
function RequireAuth({ children }) {
  const { usuario, carregando, semAcesso } = useAuth()
  if (carregando) return <TelaCarregando />
  if (semAcesso) return <SemAcesso />
  if (!usuario) return <Login />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            {/* Tela inicial */}
            <Route index element={<Inicio />} />
            {/* Gestão (chega na F2 — cópia do H360) */}
            <Route path="custos" element={<EmConstrucao titulo="Custos" descricao="Custos fixos, variáveis e ponto de equilíbrio. Chega na próxima fase." />} />
            <Route path="faturamento" element={<EmConstrucao titulo="Faturamento" descricao="Lançamento e acompanhamento do faturamento. Chega na próxima fase." />} />
            <Route path="produtos" element={<EmConstrucao titulo="Ficha Técnica" descricao="Fichas técnicas e precificação dos produtos. Chega na próxima fase." />} />
            <Route path="insumos" element={<EmConstrucao titulo="Insumos" descricao="Cadastro de insumos e custos de compra. Chega na próxima fase." />} />
            {/* Dep. Pessoal (chega na F1 — cópia do H360) */}
            <Route path="rh/equipe" element={<EmConstrucao titulo="Equipe" descricao="Cadastro da equipe interna da loja. Chega na próxima fase." />} />
            <Route path="rh/bonificacao" element={<EmConstrucao titulo="Bonificação" descricao="Programa de Bonificação (Destaque do Mês). Chega na próxima fase." />} />
            <Route path="rh/banco-de-talentos" element={<EmConstrucao titulo="Banco de Talentos" descricao="Recrutamento e seleção. Chega na próxima fase." />} />
            {/* Extras */}
            <Route path="minha-empresa" element={<EmConstrucao titulo="Minha Empresa" descricao="Dados da loja (nome, logo, contato). Chega na próxima fase." />} />
            <Route path="central-de-ajuda" element={<EmConstrucao titulo="Central de Ajuda" descricao="Artigos e ajuda do sistema." />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
