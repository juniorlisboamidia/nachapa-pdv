import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

const GRUPOS = [
  {
    titulo: 'Gestão',
    itens: [
      { emoji: '📋', nome: 'Ficha Técnica', desc: 'Produtos, combos e precificação', to: '/produtos' },
      { emoji: '🧺', nome: 'Insumos', desc: 'Insumos e custos de compra', to: '/insumos' },
      { emoji: '💰', nome: 'Custos', desc: 'Fixos, variáveis e ponto de equilíbrio', to: '/custos' },
      { emoji: '📈', nome: 'Faturamento', desc: 'Lançamento e acompanhamento das vendas', to: '/faturamento' },
    ],
  },
  {
    titulo: 'Dep. Pessoal',
    itens: [
      { emoji: '🕐', nome: 'Ponto Facial', desc: 'Controle de ponto e colaboradores', to: '/rh/ponto-facial' },
      { emoji: '🏆', nome: 'Bonificação', desc: 'Destaque do Mês (XP, conquistas, mercado)', to: '/rh/bonificacao' },
      { emoji: '🎯', nome: 'Banco de Talentos', desc: 'Recrutamento e seleção', to: '/rh/banco-de-talentos' },
    ],
  },
]

function ModuloCard({ m }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      to={m.to}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textDecoration: 'none', color: 'inherit', padding: 16, borderRadius: 14,
        border: '1px solid ' + (hover ? 'var(--brand-gold)' : 'var(--app-border)'), background: 'var(--app-surface)',
        display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: hover ? '0 4px 14px rgba(234,184,2,0.18)' : 'none', transition: 'border-color .14s, box-shadow .14s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 26 }}>{m.emoji}</span>
        <span style={{ color: 'var(--brand-gold-deep)', fontSize: 18, fontWeight: 800, transform: hover ? 'translateX(2px)' : 'none', transition: 'transform .14s' }}>→</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--app-text)' }}>{m.nome}</div>
      <div style={{ fontSize: 12.5, color: 'var(--app-text-3)', lineHeight: 1.4 }}>{m.desc}</div>
    </Link>
  )
}

export default function Inicio() {
  const { usuario, lojas, empresaAtual } = useAuth()
  const [empresa, setEmpresa] = useState(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    api.get('/empresa').then((r) => setEmpresa(r.data)).catch(() => setErro(true))
  }, [empresaAtual])

  const loja = lojas.find((l) => String(l.id) === String(empresaAtual)) || empresa
  const nomeLoja = loja?.nome || 'sua loja'
  const primeiro = (usuario?.nome || '').trim().split(/\s+/)[0]

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
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(150deg,#eab802,#d4a600)', display: 'grid', placeItems: 'center', color: '#0e1319', fontSize: 26, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
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

      {GRUPOS.map((g) => (
        <div key={g.titulo} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--app-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{g.titulo}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {g.itens.map((m) => <ModuloCard key={m.to} m={m} />)}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 12.5, color: 'var(--app-text-3)', lineHeight: 1.6 }}>
        Todos os módulos já estão disponíveis, com os dados da sua loja. Clique num card acima ou use o menu à esquerda.
      </div>
    </div>
  )
}
