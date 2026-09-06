import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { gruposVisiveis, localizarRota } from './sidebarNav.js'
import { Icon, ItemIcon } from './sidebarIcons.jsx'

const PAPEL_LABEL = { ADMIN: 'Administrador', AGENCIA: 'Agência', CLIENTE: 'Cliente', GERENTE: 'Gerente' }
function iniciais(nome) {
  return (nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'U'
}

function itemClass({ isActive }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

export default function Sidebar({ colapsada }) {
  const location = useLocation()
  const { usuario } = useAuth()
  const visiveis = gruposVisiveis(usuario) // operador vê só as áreas liberadas
  // Nível atual da sidebar: grupo aberto e subgrupo aberto (ou null = lista de
  // grupos). Inicia no caminho da rota atual.
  const [grupoAberto, setGrupoAberto] = useState(() => localizarRota(location.pathname).grupo)
  const [subAberto, setSubAberto] = useState(() => localizarRota(location.pathname).sub)
  useEffect(() => {
    const { grupo, sub } = localizarRota(location.pathname)
    if (grupo) { setGrupoAberto(grupo); setSubAberto(sub) }
  }, [location.pathname])

  return (
    <aside className={'sidebar' + (colapsada ? ' collapsed' : '')}>
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
                  <button type="button" className="sidebar-back" onClick={() => setSubAberto(null)} title={colapsada ? 'Voltar' : undefined}>
                    <Icon name="chevron" />
                    <span className="sidebar-item-label">{sub.label}</span>
                  </button>
                  {sub.itens.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={itemClass} title={colapsada ? item.label : undefined}>
                      <ItemIcon item={item} />
                      <span className="sidebar-item-label">{item.label}</span>
                    </NavLink>
                  ))}
                </>
              )
            }
            // Nível 2: itens do grupo — item folha (NavLink) OU subgrupo (drill).
            return (
              <>
                <button type="button" className="sidebar-back" onClick={() => setGrupoAberto(null)} title={colapsada ? 'Voltar' : undefined}>
                  <Icon name="chevron" />
                  <span className="sidebar-item-label">{g.label}</span>
                </button>
                {g.itens.map((item) => (
                  item.itens ? (
                    <button key={item.label} type="button" className="sidebar-grupo" onClick={() => setSubAberto(item.label)} title={colapsada ? item.label : undefined}>
                      <ItemIcon item={item} />
                      <span className="sidebar-item-label">{item.label}</span>
                      <Icon name="chevronRight" extra="sidebar-grupo-arrow" />
                    </button>
                  ) : (
                    <NavLink key={item.to} to={item.to} end={item.end} className={itemClass} title={colapsada ? item.label : undefined}>
                      <ItemIcon item={item} />
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
              title={colapsada ? 'Visão Geral' : undefined}
            >
              <Icon name="dashboard" />
              <span className="sidebar-item-label">Visão Geral</span>
            </NavLink>
            {visiveis.map((g) => {
              // Grupo-folha (link direto) — usado nos "em construção".
              if (g.to) {
                return (
                  <NavLink key={g.label} to={g.to} className={itemClass} title={colapsada ? g.label : undefined}>
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
                  title={colapsada ? g.label : (bloqueado ? 'Acesso restrito ao administrador' : undefined)}
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

    </aside>
  )
}
