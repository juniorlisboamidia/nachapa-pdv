// Execução PÚBLICA de checklist por link/QR (PÚBLICO, sem login de admin) — o
// colaborador abre o link/QR na parede/balcão, escolhe o próprio nome numa lista
// (só quem está atribuído ao checklist aparece — filtrado pelo servidor) e digita o
// PIN de 4 dígitos que já usa no Ponto Facial. Standalone de propósito: roda fora do
// Layout, num tablet/celular do balcão, sem sidebar e sem sessão — mesmo padrão do
// EtiquetasQuiosque (token do dispositivo em vez de login).
//
// Fluxo: NOME → PIN → EXECUÇÃO. A execução em si (responder item a item, foto,
// concluir) é a MESMA UI da Área do Colaborador (ExecutarChecklist, extraído de
// BonificacaoEu.jsx) — só muda o cliente HTTP: aqui é um axios criado em memória com
// o token de sessão (JWT de 6h) devolvido pelo /entrar, NUNCA salvo em localStorage
// (o token de admin/colaborador do aparelho não pode se misturar com quem está
// digitando o PIN agora).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import api from '../services/api'
import { AREA_COLABORADOR_CSS } from '../styles/areaColaboradorCss'
import { ExecutarChecklist } from '../components/checklist/ExecutarChecklist'

const erroDa = (e, fallback) => e?.response?.data?.error || fallback

function iniciaisDe(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase()
}

// Client à parte da Área do Colaborador (colabApi) e do admin (api): o token de 6h
// do /entrar vive só na memória deste componente, nunca em localStorage.
function criarClienteColab(baseURL, token) {
  const cliente = axios.create({ baseURL })
  cliente.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${token}`
    return config
  })
  return cliente
}

const CSS = `
.cp-head{margin-bottom:18px}
.cp-head-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-text)}
.cp-head h1{font-size:23px;font-weight:850;letter-spacing:-.02em;margin:3px 0 0;line-height:1.15;color:var(--ink)}
.cp-head-desc{font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5}
.cp-nome-list{display:flex;flex-direction:column;gap:8px}
.cp-nome-row{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px 14px;box-shadow:var(--sh-sm);width:100%;text-align:left;cursor:pointer;font-family:inherit;color:inherit}
.cp-nome-avatar{width:40px;height:40px;border-radius:12px;flex-shrink:0;background:linear-gradient(145deg,#F5CE3A,#E0A800);display:grid;place-items:center;font-size:15px;font-weight:850;color:#0E1319}
.cp-nome-info{flex:1;min-width:0}
.cp-nome-nome{font-size:14.5px;font-weight:800;color:var(--ink)}
.cp-nome-funcao{font-size:11.5px;color:var(--muted);font-weight:650;margin-top:1px}
.cp-nome-arrow{color:var(--muted);font-size:18px;flex-shrink:0}
.cp-pin-quem{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.cp-pin-nome{font-size:16px;font-weight:850;color:var(--ink)}
.cp-pin-funcao{font-size:12px;color:var(--muted);font-weight:650}
.cp-pin-titulo{font-size:13px;font-weight:750;color:var(--ink-soft);margin-bottom:16px}
.cp-pin-dots{display:flex;justify-content:center;gap:16px;margin:6px 0 22px}
.cp-pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--line);background:transparent}
.cp-pin-dot.on{background:var(--brand);border-color:var(--brand)}
.cp-pin-erro{text-align:center;font-size:13px;color:#dc2626;font-weight:700;margin:0 0 14px}
.cp-pin-aviso{text-align:center;font-size:13px;color:#b45309;font-weight:700;margin:0 0 14px;background:rgba(180,83,9,.1);border:1px solid rgba(180,83,9,.25);border-radius:12px;padding:10px 12px}
.cp-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:280px;margin:0 auto}
.cp-key{aspect-ratio:1;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:22px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:var(--sh-sm)}
.cp-key:active{background:var(--brand-tint)}
.cp-key:disabled{opacity:.45;cursor:default}
.cp-key-del{font-size:18px;color:var(--muted)}
.cp-exec-head{margin-bottom:14px}
.cp-exec-head .cp-head-eyebrow{color:var(--gold-text)}
.cp-exec-head h1{font-size:20px;font-weight:850;margin:3px 0 0;color:var(--ink)}
`

export default function ChecklistPublico() {
  const { token } = useParams()
  // Máquina de estados: CARREGANDO → NOME → PIN → EXEC (ou ERRO no boot).
  const [estado, setEstado] = useState('CARREGANDO')
  const [erroBoot, setErroBoot] = useState('')
  const [dados, setDados] = useState(null) // { checklist, colaboradores }
  const [colaborador, setColaborador] = useState(null)
  const [digitos, setDigitos] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erroPin, setErroPin] = useState('')
  const [travado, setTravado] = useState(false)
  const [cliente, setCliente] = useState(null)
  const [execucao, setExecucao] = useState(null)
  const [avisoExec, setAvisoExec] = useState(null)

  function carregarBootstrap() {
    setEstado('CARREGANDO')
    setErroBoot('')
    api.get(`/public/checklist/${token}/bootstrap`)
      .then((r) => { setDados(r.data); setEstado('NOME') })
      .catch((e) => setErroBoot(e?.response?.status === 404 ? 'Link inválido.' : erroDa(e, 'Não foi possível carregar. Tente novamente.')))
  }
  useEffect(() => { carregarBootstrap() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  function escolherColaborador(c) {
    setColaborador(c)
    setDigitos('')
    setErroPin('')
    setTravado(false)
    setEstado('PIN')
  }

  function voltarParaNomes() {
    setColaborador(null)
    setDigitos('')
    setErroPin('')
    setTravado(false)
    setEstado('NOME')
  }

  async function entrarComPin(pin) {
    setEntrando(true)
    setErroPin('')
    try {
      const r = await api.post(`/public/checklist/${token}/entrar`, { funcionarioId: colaborador.id, pin })
      const colabCliente = criarClienteColab(api.defaults.baseURL, r.data.token)
      try {
        const ri = await colabCliente.post(`/public/colaborador/checklists/${r.data.checklistId}/iniciar`)
        setCliente(colabCliente)
        setExecucao(ri.data.execucao)
        setEstado('EXEC')
      } catch (e2) {
        setErroPin(erroDa(e2, 'Não foi possível iniciar o checklist. Tente de novo.'))
        setDigitos('')
      }
    } catch (e) {
      if (e?.response?.status === 429) { setTravado(true); setErroPin(erroDa(e, 'Muitas tentativas. Aguarde um instante e tente de novo.')) }
      else { setErroPin(erroDa(e, 'Nome ou PIN inválido.')); setDigitos('') }
    } finally {
      setEntrando(false)
    }
  }

  // Ao completar os 4 dígitos, entra sozinho — sem botão "Confirmar" extra.
  useEffect(() => {
    if (digitos.length === 4 && !travado && !entrando) entrarComPin(digitos)
  }, [digitos]) // eslint-disable-line react-hooks/exhaustive-deps

  function digitar(d) {
    if (travado || entrando) return
    setErroPin('')
    setDigitos((s) => (s.length < 4 ? s + d : s))
  }
  function apagar() {
    if (travado || entrando) return
    setDigitos((s) => s.slice(0, -1))
  }

  // "Executar outro": limpa a sessão do colaborador anterior e volta pra seleção de
  // nome — o bootstrap (checklist + lista de colaboradores) já está carregado.
  function executarOutro() {
    setCliente(null)
    setExecucao(null)
    setAvisoExec(null)
    voltarParaNomes()
  }

  if (estado === 'CARREGANDO') {
    return <div className="be-root"><style>{AREA_COLABORADOR_CSS}</style><div className="be-state">Carregando…</div></div>
  }
  if (erroBoot) {
    return (
      <div className="be-root">
        <style>{AREA_COLABORADOR_CSS}</style>
        <div className="be-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <p style={{ fontWeight: 700, color: 'var(--ink)' }}>{erroBoot}</p>
          </div>
        </div>
      </div>
    )
  }

  const { checklist, colaboradores } = dados

  return (
    <div className="be-root">
      <style>{AREA_COLABORADOR_CSS}</style>
      <style>{CSS}</style>
      <div className="be-app">
        <main className="be-body">
          {estado === 'NOME' && (
            <>
              <header className="cp-head">
                <div className="cp-head-eyebrow">Executar checklist</div>
                <h1>{checklist.nome}</h1>
                {checklist.descricao && <p className="cp-head-desc">{checklist.descricao}</p>}
              </header>
              <section>
                <h2 className="be-sec-title">Selecione seu nome</h2>
                {colaboradores.length === 0 ? (
                  <div className="be-empty">Nenhum colaborador está atribuído a este checklist no momento. Fale com a liderança.</div>
                ) : (
                  <div className="cp-nome-list">
                    {colaboradores.map((c) => (
                      <button key={c.id} type="button" className="cp-nome-row" onClick={() => escolherColaborador(c)}>
                        <span className="cp-nome-avatar">{iniciaisDe(c.nome)}</span>
                        <span className="cp-nome-info">
                          <span className="cp-nome-nome">{c.nome}</span>
                          {c.funcao && <span className="cp-nome-funcao">{c.funcao}</span>}
                        </span>
                        <span className="cp-nome-arrow">›</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {estado === 'PIN' && colaborador && (
            <>
              <button type="button" className="be-login-voltar" style={{ marginTop: 0 }} onClick={voltarParaNomes} disabled={entrando}>‹ Voltar</button>
              <header className="cp-head" style={{ marginTop: 14 }}>
                <div className="cp-pin-quem">
                  <span className="cp-nome-avatar" style={{ width: 48, height: 48, fontSize: 17 }}>{iniciaisDe(colaborador.nome)}</span>
                  <div>
                    <div className="cp-pin-nome">{colaborador.nome}</div>
                    {colaborador.funcao && <div className="cp-pin-funcao">{colaborador.funcao}</div>}
                  </div>
                </div>
                <div className="cp-pin-titulo">Digite seu PIN de 4 dígitos</div>
              </header>
              <div className="cp-pin-dots">
                {[0, 1, 2, 3].map((i) => <span key={i} className={'cp-pin-dot' + (i < digitos.length ? ' on' : '')} />)}
              </div>
              {erroPin && <p className={travado ? 'cp-pin-aviso' : 'cp-pin-erro'}>{erroPin}</p>}
              <div className="cp-keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button key={d} type="button" className="cp-key" onClick={() => digitar(d)} disabled={travado || entrando}>{d}</button>
                ))}
                <span />
                <button type="button" className="cp-key" onClick={() => digitar('0')} disabled={travado || entrando}>0</button>
                <button type="button" className="cp-key cp-key-del" onClick={apagar} disabled={travado || entrando}>⌫</button>
              </div>
            </>
          )}

          {estado === 'EXEC' && cliente && execucao && (
            <>
              <header className="cp-exec-head">
                <div className="cp-head-eyebrow">{colaborador?.nome}</div>
                <h1>{checklist.nome}</h1>
              </header>
              <ExecutarChecklist exec={execucao} setAviso={setAvisoExec} onSair={executarOutro} cliente={cliente} labelConcluir="Executar outro" />
            </>
          )}
        </main>
      </div>

      {/* Aviso de erro da execução (salvar resposta/foto/concluir) — fecha só pelo
          botão, nunca clicando fora. */}
      {avisoExec && (
        <div className="be-ov">
          <div className="be-dlg">
            <p style={{ marginBottom: 16 }}>{avisoExec}</p>
            <div className="be-dlg-row"><button type="button" className="ok" onClick={() => setAvisoExec(null)}>Ok</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
