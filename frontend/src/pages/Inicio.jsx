import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

const MODULOS = [
  { emoji: '📋', nome: 'Ficha Técnica', desc: 'Produtos, insumos e precificação', fase: 'F2' },
  { emoji: '💰', nome: 'Custos & Faturamento', desc: 'Custos fixos/variáveis, ponto de equilíbrio', fase: 'F2' },
  { emoji: '👥', nome: 'Equipe', desc: 'Cadastro da equipe interna', fase: 'F1' },
  { emoji: '🏆', nome: 'Bonificação', desc: 'Destaque do Mês (XP, conquistas, mercado)', fase: 'F1' },
  { emoji: '🎯', nome: 'Banco de Talentos', desc: 'Recrutamento e seleção', fase: 'F1' },
]

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 16, border: '1px solid #eee', background: 'linear-gradient(135deg, #eff6ff, #ffffff)', marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(150deg,#3b82f6,#1d4ed8)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 26, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
          {loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (nomeLoja.charAt(0).toUpperCase())}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#999', fontWeight: 600 }}>{primeiro ? `Olá, ${primeiro}!` : 'Bem-vindo!'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{nomeLoja}</div>
        </div>
      </div>

      {erro && !empresa && (
        <div style={{ padding: 16, borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: 13.5, marginBottom: 20 }}>
          Ainda não há loja neste banco. Rode a <strong>cópia inicial do Hamburgão</strong> (veja o README) para trazer os dados.
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Módulos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map((m) => (
          <div key={m.nome} style={{ padding: 16, borderRadius: 14, border: '1px solid #eee', background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 26 }}>{m.emoji}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>em breve · {m.fase}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{m.nome}</div>
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.4 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5, color: '#999', lineHeight: 1.6 }}>
        Este é o esqueleto do <strong>Operação</strong> — banco próprio, login único com o HUB (só administrador).
        Os módulos de <strong>Dep. Pessoal</strong> e <strong>Gestão</strong> chegam nas próximas fases, com os dados do {nomeLoja}.
      </div>
    </div>
  )
}
