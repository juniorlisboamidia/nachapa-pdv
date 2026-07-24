// Colaboradores — cadastro da equipe (identidade global da loja). Antes vivia em
// Ponto Facial › Colaboradores; foi promovido a item próprio na sidebar (abaixo de
// Relatórios) porque o Funcionario é o cadastro de pessoas usado por Ponto Facial,
// Bonificação, Checklist e Área do Colaborador — não uma peça só do ponto.
//
// O componente em si continua em PontoFacial.jsx (compartilha useEnvioColetor/
// ModalProgressoEnvio com a aba Coletor); aqui é só o novo invólucro/página.
import { useState } from 'react'
import Toast from '../components/Toast'
import { Colaboradores as ColaboradoresTab } from './PontoFacial'

export default function Colaboradores() {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <div className="page-header-sub">Cadastro da equipe</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <ColaboradoresTab notify={notify} />
    </div>
  )
}
