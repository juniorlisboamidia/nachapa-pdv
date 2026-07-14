import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Inicio from './pages/Inicio'
import EmConstrucao from './pages/EmConstrucao'
import Equipe from './pages/Equipe'
import PontoFacial from './pages/PontoFacial'
import Bonificacao from './pages/Bonificacao'
import BonificacaoPublica from './pages/BonificacaoPublica'
import BonificacaoEu from './pages/BonificacaoEu'
import BancoTalentos from './pages/BancoTalentos'
import TalentosPublico from './pages/TalentosPublico'
import Insumos from './pages/Insumos'
import Produtos from './pages/Produtos'
import FichaTecnica from './pages/FichaTecnica'
import Custos from './pages/Custos'
import CustosFixos from './pages/CustosFixos'
import CustosVariaveis from './pages/CustosVariaveis'
import PontoEquilibrio from './pages/PontoEquilibrio'
import Faturamento from './pages/Faturamento'
import MinhaEmpresa from './pages/MinhaEmpresa'

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
            {/* Gestão (F2) */}
            <Route path="produtos" element={<Produtos />} />
            <Route path="insumos" element={<Insumos />} />
            <Route path="ficha-tecnica" element={<FichaTecnica />} />
            <Route path="ficha-tecnica/:produtoId" element={<FichaTecnica />} />
            <Route path="custos" element={<Custos />} />
            <Route path="custos-fixos" element={<CustosFixos />} />
            <Route path="custos-variaveis" element={<CustosVariaveis />} />
            <Route path="ponto-equilibrio" element={<PontoEquilibrio />} />
            <Route path="faturamento" element={<Faturamento />} />
            {/* Produtos / Financeiro / Relatórios (em construção) */}
            <Route path="estoque" element={<EmConstrucao titulo="Estoque" descricao="Controle de estoque dos insumos e produtos." />} />
            <Route path="financeiro" element={<EmConstrucao titulo="Financeiro" descricao="Fluxo de caixa, contas a pagar e a receber." />} />
            <Route path="relatorios" element={<EmConstrucao titulo="Relatórios" descricao="Relatórios e análises da operação." />} />
            {/* Dep. Pessoal — abas viram subitens da sidebar (a página lê a aba da URL) */}
            <Route path="rh/ponto-facial" element={<PontoFacial />} />
            <Route path="rh/ponto-facial/:tab" element={<PontoFacial />} />
            <Route path="rh/equipe" element={<Equipe />} />
            <Route path="rh/bonificacao" element={<Bonificacao />} />
            <Route path="rh/bonificacao/:aba" element={<Bonificacao />} />
            <Route path="rh/banco-de-talentos" element={<BancoTalentos />} />
            <Route path="rh/banco-de-talentos/:tab" element={<BancoTalentos />} />
            {/* Em construção */}
            <Route path="checklist" element={<EmConstrucao titulo="Checklist" descricao="Rotinas e checklists da operação." />} />
            <Route path="etiquetas" element={<EmConstrucao titulo="Etiquetas" descricao="Impressão de etiquetas de validade e produção." />} />
            <Route path="automacoes" element={<EmConstrucao titulo="Automações" descricao="Automações da operação." />} />
            {/* Extras */}
            <Route path="minha-empresa" element={<MinhaEmpresa />} />
            <Route path="central-de-ajuda" element={<EmConstrucao titulo="Central de Ajuda" descricao="Artigos e ajuda do sistema." />} />
          </Route>
          {/* Públicas (sem login, por token) — página da equipe e página pessoal */}
          <Route path="bonificacao/:token" element={<BonificacaoPublica />} />
          <Route path="eu/:token" element={<BonificacaoEu />} />
          {/* Banco de Talentos — formulário público de candidatura */}
          <Route path="talentos/:slug" element={<TalentosPublico />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
