// Motoboys › Configuração — ajustes da área de motoboys/escala:
// - WhatsApp de contato da escala (o do botão "Falar no WhatsApp" do link);
// - se um entregador BLOQUEADO pode ou não se escalar;
// - se o cadastro público pergunta "Você possui CNH?" (só informativo).
import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import { mascararTelefone } from '../utils/telefone'

export default function MotoboysConfig() {
  const [form, setForm] = useState({ contatoWhatsapp: '', bloqueadoPodeEscalar: false, perguntaCnh: false })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { carregar() }, [])
  function carregar() {
    setCarregando(true)
    api.get('/motoboys/config')
      .then((r) => setForm({
        contatoWhatsapp: mascararTelefone(r.data?.contatoWhatsapp || ''),
        bloqueadoPodeEscalar: !!r.data?.bloqueadoPodeEscalar,
        perguntaCnh: !!r.data?.perguntaCnh,
      }))
      .catch(() => setToast({ message: 'Não foi possível carregar a configuração.', type: 'error' }))
      .finally(() => setCarregando(false))
  }
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    setSalvando(true)
    try {
      const { data } = await api.put('/motoboys/config', {
        contatoWhatsapp: form.contatoWhatsapp,
        bloqueadoPodeEscalar: form.bloqueadoPodeEscalar,
        perguntaCnh: form.perguntaCnh,
      })
      setForm({
        contatoWhatsapp: mascararTelefone(data?.contatoWhatsapp || ''),
        bloqueadoPodeEscalar: !!data?.bloqueadoPodeEscalar,
        perguntaCnh: !!data?.perguntaCnh,
      })
      setToast({ message: 'Configuração salva.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }

  const hint = { fontSize: 12, color: '#888', marginTop: 4 }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Configuração — Motoboys</h1>
          <div className="page-header-sub">Contato da escala, acesso de bloqueados e pergunta sobre CNH.</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : (
        <div className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">WhatsApp de contato da escala</label>
            <input
              className="form-input"
              value={form.contatoWhatsapp}
              onChange={(e) => upd('contatoWhatsapp', mascararTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              type="tel"
              inputMode="tel"
            />
            <div style={hint}>Número que o botão “Falar no WhatsApp” do link da escala vai usar. Se ficar vazio, cai no contato da Minha Empresa.</div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.bloqueadoPodeEscalar} onChange={(e) => upd('bloqueadoPodeEscalar', e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <div style={{ fontWeight: 600 }}>Entregador bloqueado pode se escalar</div>
              <div style={hint}>Desligado (padrão): um entregador bloqueado não consegue se inscrever na escala. Ligado: ele consegue.</div>
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.perguntaCnh} onChange={(e) => upd('perguntaCnh', e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <div style={{ fontWeight: 600 }}>Perguntar sobre CNH no cadastro</div>
              <div style={hint}>Ligado: quem se cadastra pelo link responde “Você possui CNH?” (Sim/Não). É só informativo — não impede o cadastro; o responsável decide.</div>
            </span>
          </label>

          <div>
            <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
