import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import Toast from '../components/Toast'
import { ItemIcon } from '../components/sidebarIcons.jsx'
import { gruposVisiveis } from '../components/sidebarNav.js'
import {
  atalhosDaArvore, chaveFavoritos, alternarFavorito, favoritosValidos,
  lerFavoritos, gravarFavoritos, MAX_FAVORITOS,
} from '../components/atalhos.js'

// Os atalhos vêm da MESMA árvore da sidebar (sidebarNav.js) — nova ferramenta lá aparece aqui
// sozinha. Só a descrição curta é local, e só nas principais; sem entrada o card mostra o nome.
const DESCRICOES = {
  '/produtos': 'Produtos, combos e precificação',
  '/insumos': 'Insumos e custos de compra',
  '/estoque': 'Contagem de estoque, compras e CMV real',
  '/fornecedores': 'Fornecedores e cotações por insumo',
  '/faturamento': 'Lançamento e acompanhamento das vendas',
  '/custos': 'Fixos, variáveis e ponto de equilíbrio',
  '/marketing/grupo-vip': 'Disparos no grupo VIP + cupom',
  '/avaliacoes': 'Campanhas de avaliação dos clientes',
  '/indicacao': 'Programa de indicação',
  '/rh/colaboradores': 'Cadastro da equipe',
  '/rh/ponto-facial/painel': 'Controle de ponto e escalas',
  '/escala-motoboys': 'Escala, entregadores e frete',
  '/rh/bonificacao/mes': 'Destaque do mês (Coins, conquistas, mercado)',
  '/rh/banco-de-talentos/banco': 'Recrutamento e seleção',
  '/checklist/painel': 'Checklists da operação',
  '/etiquetas/config': 'Etiquetas ANVISA e impressão',
  '/relatorios/meta': 'Resultados dos anúncios no Meta',
  '/relatorios/cardapio': 'Vendas e faltas do cardápio',
}

// localStorage pode lançar só de ser acessado (modo privado/bloqueado): resolve pra null.
const storage = () => { try { return window.localStorage } catch { return null } }

const Estrela = ({ on }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
  </svg>
)

function Atalho({ a, fav, onFav, grande }) {
  return (
    <Link to={a.to} className={'vg-card' + (grande ? ' vg-fav' : '')}>
      <div className="vg-topo">
        <div className="vg-ic"><ItemIcon item={a} /></div>
        <button
          type="button"
          className={'vg-star' + (fav ? ' on' : '')}
          aria-label={fav ? 'Desafixar de Mais usados' : 'Fixar em Mais usados'}
          title={fav ? 'Desafixar' : 'Fixar em Mais usados'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFav(a.to) }}
        >
          <Estrela on={fav} />
        </button>
      </div>
      <div className="vg-nome">{a.label}</div>
      {DESCRICOES[a.to] && <div className="vg-desc">{DESCRICOES[a.to]}</div>}
      <span className="vg-seta" aria-hidden="true">→</span>
    </Link>
  )
}

export default function Inicio() {
  const { usuario, lojas, empresaAtual } = useAuth()
  const [empresa, setEmpresa] = useState(null)
  const [erro, setErro] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    api.get('/empresa').then((r) => setEmpresa(r.data)).catch(() => setErro(true))
  }, [empresaAtual])

  const loja = lojas.find((l) => String(l.id) === String(empresaAtual)) || empresa
  const nomeLoja = loja?.nome || 'sua loja'
  const primeiro = (usuario?.nome || '').trim().split(/\s+/)[0]

  // Atalhos = árvore da sidebar já filtrada pela área do operador (ADMIN vê tudo).
  const secoes = useMemo(() => atalhosDaArvore(gruposVisiveis(usuario)), [usuario])
  const porRota = useMemo(() => new Map(secoes.flatMap((s) => s.itens.map((i) => [i.to, i]))), [secoes])

  // Favoritos por loja + usuário, no navegador. Re-lê quando a chave muda (troca de loja/usuário).
  const chave = chaveFavoritos(usuario, empresaAtual)
  const [favoritos, setFavoritos] = useState(() => lerFavoritos(storage(), chave))
  useEffect(() => { setFavoritos(lerFavoritos(storage(), chave)) }, [chave])
  const alternar = (to) => {
    const r = alternarFavorito(favoritos, to)
    if (r.cheio) { setToast({ message: `Máximo de ${MAX_FAVORITOS} em Mais usados — desafixe um primeiro.`, type: 'error' }); return }
    setFavoritos(r.lista)
    gravarFavoritos(storage(), chave, r.lista)
  }
  const favs = favoritosValidos(favoritos, secoes).map((to) => porRota.get(to))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Operação</h1>
          <div className="page-header-sub">O sistema de gestão da sua loja.</div>
        </div>
      </div>

      {/* Hero da loja */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 16, border: '1px solid var(--app-border)', background: 'linear-gradient(135deg, var(--app-highlight), var(--app-surface))', marginBottom: 22 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(150deg,#f97316,#ea580c)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 26, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
          {loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (nomeLoja.charAt(0).toUpperCase())}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--app-text-3)', fontWeight: 600 }}>{primeiro ? `Olá, ${primeiro}!` : 'Bem-vindo!'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--app-text)' }}>{nomeLoja}</div>
        </div>
      </div>

      {erro && !empresa && (
        <div style={{ padding: 16, borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: 13.5, marginBottom: 20 }}>
          Ainda não há loja neste banco. Rode a <strong>cópia inicial do Hamburgão</strong> (veja o README) para trazer os dados.
        </div>
      )}

      {/* Mais usados — fixados pelo próprio usuário (estrela nos cards) */}
      <div className="vg-secao">
        <div className="vg-secao-t">Mais usados</div>
        {favs.length
          ? <div className="vg-grid vg-grid-fav">{favs.map((a) => <Atalho key={a.to} a={a} fav onFav={alternar} grande />)}</div>
          : <div className="vg-vazio">Fixe suas ferramentas mais usadas pela estrela dos cards abaixo — elas aparecem aqui, em destaque.</div>}
      </div>

      {secoes.map((s) => (
        <div key={s.titulo} className="vg-secao">
          <div className="vg-secao-t">{s.titulo}</div>
          <div className="vg-grid">
            {s.itens.map((a) => <Atalho key={a.to} a={a} fav={favoritos.includes(a.to)} onFav={alternar} />)}
          </div>
        </div>
      ))}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  )
}
