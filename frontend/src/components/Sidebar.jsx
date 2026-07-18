import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const PAPEL_LABEL = { ADMIN: 'Administrador', AGENCIA: 'Agência', CLIENTE: 'Cliente', GERENTE: 'Gerente' }
function iniciais(nome) {
  return (nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'U'
}

// Ícones de linha (SVG inline, monocromáticos) — sem biblioteca externa.
const ICONS = {
  dashboard: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </>
  ),
  produtos: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  ficha: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2V4" />
      <path d="M9 10h6M9 13.5h6M9 17h4" />
    </>
  ),
  insumos: <path d="M12 3s6 5.5 6 10a6 6 0 1 1-12 0c0-4.5 6-10 6-10z" />,
  custos: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
    </>
  ),
  financeiro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M14.6 9.2a2.4 2.4 0 0 0-2.6-1.2c-1.3 0-2.4.8-2.4 1.9s1.1 1.7 2.4 2 2.6.8 2.6 2-1.1 1.9-2.6 1.9a2.5 2.5 0 0 1-2.6-1.3" />
    </>
  ),
  faturamento: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V5" />
      <path d="M17 20v-9" />
    </>
  ),
  // Scooter de entrega (motoboy): duas rodas, deck e baú traseiro — não é bicicleta.
  moto: (
    <>
      <circle cx="6" cy="17" r="2.6" />
      <circle cx="18" cy="17" r="2.6" />
      <path d="M6 17h6l3-5h2" />
      <path d="M15.4 12l2.6 5" />
      <rect x="3" y="8.5" width="4" height="4.5" rx="0.8" />
      <path d="M7 11h4" />
    </>
  ),
  analise: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12V4" />
      <path d="M12 12l7 3.2" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13h3M13.5 13h3M7.5 17h3M13.5 17h3" />
    </>
  ),
  entregadores: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.1" />
    </>
  ),
  empresa: (
    <>
      <rect x="4" y="4" width="7" height="17" rx="1" />
      <rect x="13" y="9" width="7" height="12" rx="1" />
      <path d="M7 8h1M7 12h1M16 13h1M16 17h1" />
    </>
  ),
  ajuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8" />
      <circle cx="12" cy="16.6" r="0.5" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  lua: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />,
  chevron: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  caret: <path d="M6 9l6 6 6-6" />,
  gestao: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // Megafone (grupo Marketing)
  marketing: (
    <>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h3l8 4.5v-17L7 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M18 9.5a3 3 0 0 1 0 5" />
    </>
  ),
  // Estrela (Avaliação)
  avaliacao: <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />,
  // Pessoa (Clientes)
  clientes: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  // Documento com barras (Relatórios)
  relatorios: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 17v-3M12 17v-5M15 17v-7" />
    </>
  ),
  // Relógio (Ponto Facial)
  ponto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  // Cadeado (área restrita ao ADMIN)
  cadeado: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  )
}

function Icon({ name, extra }) {
  return (
    <svg
      className={'sidebar-icon' + (extra ? ' ' + extra : '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

// Grupos com `itens` fazem drill (nível 2). Grupos com `to` (sem itens) são
// link direto no nível raiz — usado nos "em construção".
const grupos = [
  {
    label: 'Gestão', icon: 'gestao', area: 'gestao',
    itens: [
      { to: '/custos', label: 'Custos', icon: 'custos' },
      { to: '/faturamento', label: 'Faturamento', icon: 'faturamento' },
    ]
  },
  {
    label: 'Produtos', icon: 'produtos', area: 'produtos',
    itens: [
      { to: '/produtos', label: 'Ficha técnica', icon: 'ficha' },
      { to: '/insumos', label: 'Insumos', icon: 'insumos' },
      { to: '/estoque', label: 'Estoque', icon: 'produtos' },
    ]
  },
  { label: 'Financeiro', icon: 'financeiro', to: '/financeiro', area: 'financeiro' },
  { label: 'Relatórios', icon: 'relatorios', to: '/relatorios', area: 'relatorios' },
  {
    label: 'Ponto Facial', icon: 'ponto', area: 'ponto',
    itens: [
      { to: '/rh/ponto-facial/painel', label: 'Painel', icon: 'ponto' },
      { to: '/rh/ponto-facial/colaboradores', label: 'Colaboradores', icon: 'clientes' },
      { to: '/rh/ponto-facial/jornadas', label: 'Jornadas e Escalas', icon: 'calendario' },
      { to: '/rh/ponto-facial/marcacoes', label: 'Marcações', icon: 'ponto' },
      { to: '/rh/ponto-facial/espelho', label: 'Espelho', icon: 'ficha' },
      { to: '/rh/ponto-facial/fechamento', label: 'Fechamento', icon: 'custos' },
      { to: '/rh/ponto-facial/coletor', label: 'Coletor', icon: 'ponto' },
    ]
  },
  {
    label: 'Bonificação', icon: 'faturamento', area: 'bonificacao',
    itens: [
      { to: '/rh/bonificacao/mes', label: 'Mês atual', icon: 'calendario' },
      { to: '/rh/bonificacao/equipe', label: 'Equipe & Coins', icon: 'clientes' },
      { to: '/rh/bonificacao/conquistas', label: 'Conquistas', icon: 'avaliacao' },
      { to: '/rh/bonificacao/mercado', label: 'Mercado', icon: 'produtos' },
      { to: '/rh/bonificacao/config', label: 'Configuração', icon: 'gestao' },
    ]
  },
  {
    label: 'Checklist', icon: 'ficha', area: 'checklist',
    itens: [
      { to: '/checklist/painel', label: 'Painel', icon: 'gestao' },
      { to: '/checklist/checklists', label: 'Checklists', icon: 'ficha' },
      { to: '/checklist/templates', label: 'Templates', icon: 'produtos' },
      { to: '/checklist/notificacoes', label: 'Notificações', icon: 'marketing' },
      { to: '/checklist/configuracoes', label: 'Configurações', icon: 'gestao' },
    ]
  },
  {
    label: 'Etiquetas', icon: 'ficha', area: 'etiquetas',
    itens: [
      { to: '/etiquetas/config', label: 'Configuração', icon: 'gestao' },
      { to: '/etiquetas/itens', label: 'Itens', icon: 'ficha' },
      { to: '/etiquetas/historico', label: 'Histórico', icon: 'relatorios' },
    ]
  },
  {
    label: 'Banco de talentos', icon: 'clientes', area: 'talentos',
    itens: [
      { to: '/rh/banco-de-talentos/banco', label: 'Cadastros', icon: 'clientes' },
      { to: '/rh/banco-de-talentos/vagas', label: 'Vagas abertas', icon: 'ficha' },
      { to: '/rh/banco-de-talentos/formulario', label: 'Formulário permanente', icon: 'ficha' },
    ]
  },
  { label: 'Automações', icon: 'gestao', to: '/automacoes', area: 'automacoes' },
]
// Operador (gerente) vê só as áreas liberadas; ADMIN vê tudo.
function gruposVisiveis(usuario) {
  if (!usuario || usuario.tipo !== 'operador') return grupos
  const areas = new Set(usuario.areas || [])
  return grupos.filter((g) => !g.area || areas.has(g.area))
}

// Casa a rota atual e devolve o caminho { grupo, sub } para abrir a sidebar já
// dentro dele. Suporta subgrupos aninhados (ex.: Marketing › Indicação).
const matchLeaf = (it, pathname) => it.to && (it.to === '/' ? pathname === '/' : pathname === it.to || pathname.startsWith(it.to + '/'))
function localizarRota(pathname) {
  for (const g of grupos) {
    if (!g.itens) continue // grupo-folha (link direto) não abre subnível
    for (const it of g.itens) {
      if (it.itens) {
        if (it.itens.some((sub) => matchLeaf(sub, pathname))) return { grupo: g.label, sub: it.label }
      } else if (matchLeaf(it, pathname)) {
        return { grupo: g.label, sub: null }
      }
    }
  }
  return { grupo: null, sub: null }
}

function itemClass({ isActive }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

export default function Sidebar() {
  const location = useLocation()
  const { usuario, logout, lojas, empresaAtual } = useAuth()
  const visiveis = gruposVisiveis(usuario) // operador vê só as áreas liberadas
  // Nível atual da sidebar: grupo aberto e subgrupo aberto (ou null = lista de
  // grupos). Inicia no caminho da rota atual.
  const [grupoAberto, setGrupoAberto] = useState(() => localizarRota(location.pathname).grupo)
  const [subAberto, setSubAberto] = useState(() => localizarRota(location.pathname).sub)
  useEffect(() => {
    const { grupo, sub } = localizarRota(location.pathname)
    if (grupo) { setGrupoAberto(grupo); setSubAberto(sub) }
  }, [location.pathname])

  const [collapsed, setCollapsed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('hb-sidebar-collapsed') === '1'
  )
  const [dark, setDark] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('hb-theme') === 'dark'
  )

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed)
    localStorage.setItem('hb-sidebar-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    document.body.classList.toggle('theme-dark', dark)
    localStorage.setItem('hb-theme', dark ? 'dark' : 'light')
  }, [dark])

  // Dados reais da empresa (card da sidebar). Fallback se a API falhar/estiver vazia.
  const [empresa, setEmpresa] = useState({ nome: 'Hamburgueria', logoDataUrl: null })
  useEffect(() => {
    let ativo = true
    function aplicar(d) {
      setEmpresa({
        nome: (d?.nome ?? '').trim() || 'Hamburgueria',
        logoDataUrl: d?.logoDataUrl ?? null
      })
    }
    function carregar() {
      api
        .get('/empresa')
        .then((r) => { if (ativo) aplicar(r.data ?? {}) })
        .catch(() => {})
    }
    carregar()
    // Atualiza quando "Minha Empresa" salvar (sem precisar de reload)
    function onAtualizada(e) {
      if (e?.detail) aplicar(e.detail)
      else carregar()
    }
    window.addEventListener('empresa-atualizada', onAtualizada)
    return () => {
      ativo = false
      window.removeEventListener('empresa-atualizada', onAtualizada)
    }
  }, [])

  const avatarInicial = empresa.nome.trim().charAt(0).toUpperCase() || 'H'

  // Loja atual — o PDV não alterna entre lojas (sem seletor/dropdown).
  const lojaAtual = lojas.find((l) => String(l.id) === String(empresaAtual))
  const nomeLojaAtual = lojaAtual?.nome || empresa.nome || 'Hamburgueria'

  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      {/* Card da loja + botão de recolher (PDV não alterna entre lojas). */}
      <div className="sidebar-company">
        {empresa.logoDataUrl ? (
          <img className="sidebar-company-avatar sidebar-company-logo" src={empresa.logoDataUrl} alt="" />
        ) : (
          <div className="sidebar-company-avatar">{avatarInicial}</div>
        )}
        <div className="sidebar-company-info">
          <div className="sidebar-company-name">{nomeLojaAtual}</div>
          {lojaAtual?.clienteNome
            && lojaAtual.clienteNome.trim().toLowerCase() !== nomeLojaAtual.trim().toLowerCase()
            && <div className="sidebar-company-sub">{lojaAtual.clienteNome}</div>}
        </div>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg
            className={'sidebar-icon' + (collapsed ? ' flip' : '')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS.chevron}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {grupoAberto ? (
          (() => {
            const g = visiveis.find((x) => x.label === grupoAberto) ?? visiveis[0]
            if (!g) return null
            const sub = subAberto ? g.itens.find((x) => x.label === subAberto && x.itens) : null
            // Nível 3: itens de um subgrupo (ex.: Marketing › Indicação › ...)
            if (sub) {
              return (
                <>
                  <button type="button" className="sidebar-back" onClick={() => setSubAberto(null)} title={collapsed ? 'Voltar' : undefined}>
                    <Icon name="chevron" />
                    <span className="sidebar-item-label">{sub.label}</span>
                  </button>
                  {sub.itens.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={itemClass} title={collapsed ? item.label : undefined}>
                      <Icon name={item.icon} />
                      <span className="sidebar-item-label">{item.label}</span>
                    </NavLink>
                  ))}
                </>
              )
            }
            // Nível 2: itens do grupo — item folha (NavLink) OU subgrupo (drill).
            return (
              <>
                <button type="button" className="sidebar-back" onClick={() => setGrupoAberto(null)} title={collapsed ? 'Voltar' : undefined}>
                  <Icon name="chevron" />
                  <span className="sidebar-item-label">{g.label}</span>
                </button>
                {g.itens.map((item) => (
                  item.itens ? (
                    <button key={item.label} type="button" className="sidebar-grupo" onClick={() => setSubAberto(item.label)} title={collapsed ? item.label : undefined}>
                      <Icon name={item.icon} />
                      <span className="sidebar-item-label">{item.label}</span>
                      <Icon name="chevronRight" extra="sidebar-grupo-arrow" />
                    </button>
                  ) : (
                    <NavLink key={item.to} to={item.to} end={item.end} className={itemClass} title={collapsed ? item.label : undefined}>
                      <Icon name={item.icon} />
                      <span className="sidebar-item-label">{item.label}</span>
                    </NavLink>
                  )
                ))}
              </>
            )
          })()
        ) : (
          <>
            <NavLink
              to="/"
              end
              className={itemClass}
              title={collapsed ? 'Visão Geral' : undefined}
            >
              <Icon name="dashboard" />
              <span className="sidebar-item-label">Visão Geral</span>
            </NavLink>
            {visiveis.map((g) => {
              // Grupo-folha (link direto) — usado nos "em construção".
              if (g.to) {
                return (
                  <NavLink key={g.label} to={g.to} className={itemClass} title={collapsed ? g.label : undefined}>
                    <Icon name={g.icon} />
                    <span className="sidebar-item-label">{g.label}</span>
                  </NavLink>
                )
              }
              const bloqueado = g.soAdmin && usuario?.papel !== 'ADMIN'
              return (
                <button
                  key={g.label}
                  type="button"
                  className="sidebar-grupo"
                  onClick={() => { if (bloqueado) return; setGrupoAberto(g.label); setSubAberto(null) }}
                  title={collapsed ? g.label : (bloqueado ? 'Acesso restrito ao administrador' : undefined)}
                  aria-disabled={bloqueado || undefined}
                  style={bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  <Icon name={g.icon} />
                  <span className="sidebar-item-label">{g.label}</span>
                  <Icon name={bloqueado ? 'cadeado' : 'chevronRight'} extra="sidebar-grupo-arrow" />
                </button>
              )
            })}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {/* Acesso ao NaChapa HUB virou um botão flutuante (ver Layout.jsx). */}
        {usuario?.papel === 'ADMIN' && (
          <NavLink to="/minha-empresa" className={itemClass} title={collapsed ? 'Minha Empresa' : undefined}>
            <Icon name="empresa" />
            <span className="sidebar-item-label">Minha Empresa</span>
          </NavLink>
        )}
        <NavLink to="/central-de-ajuda" className={itemClass} title={collapsed ? 'Central de Ajuda' : undefined}>
          <Icon name="ajuda" />
          <span className="sidebar-item-label">Central de Ajuda</span>
        </NavLink>
        <button
          type="button"
          className="sidebar-theme-toggle"
          onClick={() => setDark((d) => !d)}
          role="switch"
          aria-checked={dark}
          title={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          <span className="sidebar-theme-left">
            <Icon name={dark ? 'lua' : 'sol'} />
            <span className="sidebar-item-label">{dark ? 'Escuro' : 'Claro'}</span>
          </span>
          <span className={'sidebar-theme-track' + (dark ? ' on' : '')}>
            <span className="sidebar-theme-knob" />
          </span>
        </button>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{iniciais(usuario?.nome)}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{usuario?.nome || 'Usuário'}</div>
            <div className="sidebar-user-sub">{PAPEL_LABEL[usuario?.papel] || 'Conta'}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sair"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 6, opacity: 0.7, display: 'flex' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
