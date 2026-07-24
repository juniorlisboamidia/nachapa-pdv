// Colaboradores — cadastro da equipe (identidade global da loja). Antes vivia em
// Ponto Facial › Colaboradores; foi promovido a item próprio na sidebar (abaixo de
// Relatórios) porque o Funcionario é o cadastro de pessoas usado por Ponto Facial,
// Bonificação, Checklist e Área do Colaborador — não uma peça só do ponto.
//
// O componente em si continua em PontoFacial.jsx (compartilha useEnvioColetor/
// ModalProgressoEnvio com a aba Coletor); aqui é só o novo invólucro/página + o
// atalho pra copiar o link da Área do Colaborador (é aqui que a equipe é gerida).
import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import { Colaboradores as ColaboradoresTab } from './PontoFacial'

export default function Colaboradores() {
  const [toast, setToast] = useState(null)
  const [colabLink, setColabLink] = useState('')
  const notify = (message, type = 'success') => setToast({ message, type })

  // Link da Área do Colaborador = /colaborador/<slug>, onde o slug é o mesmo do link
  // público da Bonificação (definido em Bonificação › Configuração). Mesmo endereço que
  // Minha Empresa › Acessos monta — aqui é só o atalho fácil, no lugar onde faz sentido.
  useEffect(() => {
    api.get('/bonificacao/config')
      .then((r) => { const id = r.data?.config?.slugPublico || r.data?.config?.tokenPublico; setColabLink(id ? `${window.location.origin}/colaborador/${id}` : '') })
      .catch(() => {})
  }, [])

  const copiar = () => {
    if (!colabLink) return
    try { navigator.clipboard.writeText(colabLink) } catch { /* noop */ }
    notify('Link da Área do Colaborador copiado.')
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Colaboradores</h1>
          <div className="page-header-sub">Cadastro da equipe</div>
        </div>

        {/* Atalho: link único da Área do Colaborador (login por WhatsApp) pra compartilhar
            com a equipe. Some se ainda não há slug definido — aponta onde configurar. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text-soft, #777)' }}>Área do Colaborador</span>
          {colabLink ? (
            <>
              <code style={{ fontSize: 12, color: 'var(--app-text-soft, #999)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{colabLink}</code>
              <button type="button" className="btn btn-primary btn-sm" onClick={copiar}>Copiar link</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.open(colabLink, '_blank', 'noopener')}>Abrir</button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--app-text-soft, #999)' }}>Defina o endereço em Bonificação › Configuração › Link público.</span>
          )}
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <ColaboradoresTab notify={notify} />
    </div>
  )
}
