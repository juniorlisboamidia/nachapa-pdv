import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Inicio from './pages/Inicio'
import EmConstrucao from './pages/EmConstrucao'
import Equipe from './pages/Equipe'
import PontoFacial from './pages/PontoFacial'
import Colaboradores from './pages/Colaboradores'
import Bonificacao from './pages/Bonificacao'
import BonificacaoPublica from './pages/BonificacaoPublica'
import BonificacaoEu from './pages/BonificacaoEu'
import BancoTalentos from './pages/BancoTalentos'
import TalentosPublico from './pages/TalentosPublico'
import Insumos from './pages/Insumos'
import Fornecedores from './pages/Fornecedores'
import Produtos from './pages/Produtos'
import FichaTecnica from './pages/FichaTecnica'
import Custos from './pages/Custos'
import CustosFixos from './pages/CustosFixos'
import CustosVariaveis from './pages/CustosVariaveis'
import PontoEquilibrio from './pages/PontoEquilibrio'
import Faturamento from './pages/Faturamento'
import MinhaEmpresa from './pages/MinhaEmpresa'
import Frases from './pages/Frases'
import Etiquetas from './pages/Etiquetas'
import EtiquetasQuiosque from './pages/EtiquetasQuiosque'
import Checklist, { ChecklistDetalhe, ChecklistHistorico, ChecklistEstatisticas } from './pages/Checklist'
import ChecklistPublico from './pages/ChecklistPublico'
import CentralAjuda from './pages/CentralAjuda'
import GrupoVip from './pages/GrupoVip'

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

// Link antigo /eu/:token — o acesso agora é pela tela de login da loja + WhatsApp.
function EuLinkAntigo() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', background: '#F4F1EA', color: '#0E1319', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif' }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 850, marginBottom: 8 }}>O acesso mudou</h1>
        <p style={{ fontSize: 14, color: '#6b6f75', lineHeight: 1.5 }}>Agora a Área do Colaborador tem login por WhatsApp. Peça à liderança o <b>link da sua loja</b> para entrar com o seu número.</p>
      </div>
    </div>
  )
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
            <Route path="fornecedores" element={<Fornecedores />} />
            <Route path="ficha-tecnica" element={<FichaTecnica />} />
            <Route path="ficha-tecnica/:produtoId" element={<FichaTecnica />} />
            <Route path="custos" element={<Custos />} />
            <Route path="custos-fixos" element={<CustosFixos />} />
            <Route path="custos-variaveis" element={<CustosVariaveis />} />
            <Route path="ponto-equilibrio" element={<PontoEquilibrio />} />
            <Route path="faturamento" element={<Faturamento />} />
            {/* Produtos › Estoque (vira CMV Global na Fase 3) */}
            <Route path="estoque" element={<EmConstrucao titulo="Estoque" descricao="Contagem de estoque, compras e CMV real." />} />
            {/* Relatórios (viram páginas reais na Fase 4) */}
            <Route path="relatorios" element={<Navigate to="/relatorios/meta" replace />} />
            <Route path="relatorios/meta" element={<EmConstrucao titulo="Meta Ads" descricao="Relatório de Meta Ads da loja." />} />
            <Route path="relatorios/instagram" element={<EmConstrucao titulo="Instagram" descricao="Relatório do Instagram da loja." />} />
            <Route path="relatorios/google" element={<EmConstrucao titulo="Google Ads" descricao="Relatório de Google Ads da loja." />} />
            <Route path="relatorios/cardapio" element={<EmConstrucao titulo="Cardápio" descricao="Relatório de vendas do cardápio." />} />
            <Route path="relatorios/gmn" element={<EmConstrucao titulo="Google Meu Negócio" descricao="Em breve." />} />
            {/* Marketing › Avaliador e Indicação (viram páginas reais na Fase 1) */}
            <Route path="avaliacoes" element={<EmConstrucao titulo="Avaliação" descricao="Campanhas de avaliação dos clientes." />} />
            <Route path="clientes" element={<EmConstrucao titulo="Clientes" descricao="Em breve." />} />
            <Route path="respostas" element={<EmConstrucao titulo="Respostas" descricao="Em breve." />} />
            <Route path="indicacao" element={<EmConstrucao titulo="Indicação" descricao="Programa de indicação." />} />
            <Route path="indicacao/:secao" element={<EmConstrucao titulo="Indicação" descricao="Programa de indicação." />} />
            {/* Dep. Pessoal › Motoboys (viram páginas reais na Fase 2) */}
            <Route path="escala-motoboys" element={<EmConstrucao titulo="Escala" descricao="Escala semanal dos motoboys." />} />
            <Route path="entregadores" element={<EmConstrucao titulo="Entregadores" descricao="Base de motoboys." />} />
            <Route path="calc-frete" element={<EmConstrucao titulo="Calc. Frete" descricao="Calculadora de taxa de entrega." />} />
            <Route path="motoboys/config" element={<EmConstrucao titulo="Configuração" descricao="Configuração de Motoboys." />} />
            {/* Dep. Pessoal — abas viram subitens da sidebar (a página lê a aba da URL) */}
            <Route path="rh/colaboradores" element={<Colaboradores />} />
            <Route path="rh/ponto-facial" element={<PontoFacial />} />
            <Route path="rh/ponto-facial/:tab" element={<PontoFacial />} />
            <Route path="rh/equipe" element={<Equipe />} />
            <Route path="rh/bonificacao" element={<Bonificacao />} />
            <Route path="rh/bonificacao/:aba" element={<Bonificacao />} />
            <Route path="rh/banco-de-talentos" element={<BancoTalentos />} />
            <Route path="rh/banco-de-talentos/:tab" element={<BancoTalentos />} />
            {/* Checklist Inteligente — tela do gestor (Painel/Checklists/Templates/Notificações) */}
            <Route path="checklist" element={<Checklist />} />
            <Route path="checklist/:tab" element={<Checklist />} />
            <Route path="checklist/detalhe/:id" element={<ChecklistDetalhe />} />
            <Route path="checklist/historico/:id" element={<ChecklistHistorico />} />
            <Route path="checklist/estatisticas/:id" element={<ChecklistEstatisticas />} />
            {/* Em construção */}
            <Route path="etiquetas" element={<Etiquetas />} />
            <Route path="etiquetas/:tab" element={<Etiquetas />} />
            {/* Marketing › Grupo VIP (Automações virou Marketing; rota antiga redireciona) */}
            <Route path="marketing/grupo-vip" element={<GrupoVip />} />
            <Route path="automacoes/grupo-vip" element={<Navigate to="/marketing/grupo-vip" replace />} />
            {/* Extras */}
            <Route path="minha-empresa" element={<MinhaEmpresa />} />
            <Route path="frases" element={<Frases />} />
            <Route path="central-de-ajuda" element={<CentralAjuda />} />
          </Route>
          {/* Públicas — ranking da equipe (por token) e Área do Colaborador (login por WhatsApp) */}
          <Route path="bonificacao/:token" element={<BonificacaoPublica />} />
          <Route path="colaborador/:slug" element={<BonificacaoEu />} />
          {/* Link antigo /eu/:token: agora o acesso é pelo link da loja + WhatsApp */}
          <Route path="eu/:token" element={<EuLinkAntigo />} />
          {/* Banco de Talentos — formulário público de candidatura */}
          <Route path="talentos/:slug" element={<TalentosPublico />} />
          {/* Etiquetas — quiosque da cozinha (tablet, por token do dispositivo).
              O caminho é /etiquetas/:token/imprimir e não /etiquetas/:token para não
              colidir com o /etiquetas/:tab da tela de admin, logo acima. */}
          <Route path="etiquetas/:token/imprimir" element={<EtiquetasQuiosque />} />
          {/* Checklist Inteligente — execução pública por link/QR (nome + PIN), sem
              login: o token identifica o checklist, o PIN identifica o colaborador. */}
          <Route path="checklist/publico/:token" element={<ChecklistPublico />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
