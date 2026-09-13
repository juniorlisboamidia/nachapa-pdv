import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { gruposVisiveis, localizarRota } from './sidebarNav.js'
import { Icon, ItemIcon } from './sidebarIcons.jsx'

function itemClass({ isActive }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

/* Desce a árvore seguindo os rótulos do caminho e devolve os nós visitados.

   Para de descer no primeiro rótulo que não casa — é o que faz a sidebar se recuperar
   sozinha quando um grupo some do menu (o operador perdeu a área, por exemplo) enquanto
   ele estava lá dentro: em vez de tela vazia, ela volta ao último nível que ainda existe. */
function trilha(raiz, caminho) {
  const nos = []
  let nivel = raiz
  for (const rotulo of caminho) {
    const no = (nivel ?? []).find((x) => x.label === rotulo && x.itens)
    if (!no) break
    nos.push(no)
    nivel = no.itens
  }
  return nos
}

export default function Sidebar({ colapsada }) {
  const location = useLocation()
  const { usuario } = useAuth()
  const visiveis = gruposVisiveis(usuario) // operador vê só as áreas liberadas

  /* Onde a sidebar está, como CAMINHO de rótulos: `[]` é a lista de grupos, `['Loja
     Digital']` é dentro do grupo, `['Loja Digital', 'Totem']` é dentro do subgrupo, e
     assim por diante.

     Era um par de estados (`grupoAberto` + `subAberto`), o que limitava o menu a dois
     níveis de profundidade por construção. Com um caminho, o número de níveis passa a ser
     uma decisão da ÁRVORE (sidebarNav.js) e não do componente — foi o que permitiu
     Banners abrir Capa / Tela de espera sem inventar abas dentro da página. */
  const [caminho, setCaminho] = useState(() => localizarRota(location.pathname).caminho)
  useEffect(() => {
    const { caminho: doDestino } = localizarRota(location.pathname)
    if (doDestino.length) setCaminho(doDestino)
  }, [location.pathname])

  const nos = trilha(visiveis, caminho)
  const atual = nos[nos.length - 1] ?? null
  const itens = atual ? atual.itens : visiveis

  return (
    <aside className={'sidebar' + (colapsada ? ' collapsed' : '')}>
      <nav className="sidebar-nav">
        {atual ? (
          <>
            {/* Voltar UM nível, não à raiz: descer três degraus e ser cuspido no topo é o
                jeito mais rápido de o operador perder o lugar. */}
            <button
              type="button"
              className="sidebar-back"
              onClick={() => setCaminho((c) => c.slice(0, nos.length - 1))}
              title={colapsada ? 'Voltar' : undefined}
            >
              <Icon name="chevron" />
              <span className="sidebar-item-label">{atual.label}</span>
            </button>
            {itens.map((item) => (
              item.itens ? (
                <button
                  key={item.label}
                  type="button"
                  className="sidebar-grupo"
                  onClick={() => setCaminho([...caminho.slice(0, nos.length), item.label])}
                  title={colapsada ? item.label : undefined}
                >
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
        ) : (
          <>
            <NavLink
              to="/"
              end
              className={itemClass}
              title={colapsada ? 'Visão Geral' : undefined}
            >
              <Icon name="casa" />
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
                  onClick={() => { if (bloqueado) return; setCaminho([g.label]) }}
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
