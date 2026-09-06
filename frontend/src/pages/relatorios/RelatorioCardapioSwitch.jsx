import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import RelatorioCardapio from './RelatorioCardapio'
import RelatorioCardapioAnotaAI from './RelatorioCardapioAnotaAI'

// Cada loja usa UMA fonte de cardápio (Cardápio Web ou AnotaAI). Detecta a fonte da loja
// e monta o módulo correspondente — a aba "Cardápio" é a mesma para o cliente.
export default function RelatorioCardapioSwitch() {
  const { empresaAtual } = useAuth()
  const [fonte, setFonte] = useState(undefined) // undefined = carregando; null = nenhuma
  useEffect(() => {
    let vivo = true
    setFonte(undefined)
    api.get('/dashboard/cardapio-fonte')
      .then(({ data }) => { if (vivo) setFonte(data?.fonte || null) })
      .catch(() => { if (vivo) setFonte(null) })
    return () => { vivo = false }
  }, [empresaAtual])
  if (fonte === undefined) return <div className="loading-state" style={{ padding: '64px 20px' }}>Carregando…</div>
  if (fonte === 'anotaai') return <RelatorioCardapioAnotaAI />
  return <RelatorioCardapio />
}
