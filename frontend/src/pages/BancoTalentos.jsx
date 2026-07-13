// Dep. Pessoal › Banco de Talentos — banco permanente, vagas abertas e formulário.
// Foco: pequenas operações. Sem Kanban/pipeline no centro.
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import CandidatoDrawer from '../components/CandidatoDrawer'
import FormBuilder from '../components/FormBuilder'
import { mascararTelefone, formatarWhats } from '../utils/telefone'
import {
  ORIGENS, ORIGEM_LABEL, FUNCOES, EXPERIENCIAS, VAGA_STATUS, VAGA_STATUS_CLS,
  SITUACAO_LABEL, SITUACAO_CLS, CLASSIF_LABEL, CLASSIF_CLS, fmtData, dispResumo, formularioPadrao, waLink,
} from '../utils/recrutamento'

const origin = typeof window !== 'undefined' ? window.location.origin : ''

const BT_TABS = ['banco', 'vagas', 'formulario']
export default function BancoTalentos() {
  const { tab: tabParam } = useParams() // aba controlada pela URL / sidebar
  const tab = BT_TABS.includes(tabParam) ? tabParam : 'banco'
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [config, setConfig] = useState(null)
  const [cargos, setCargos] = useState([])
  const [sel, setSel] = useState(null) // candidatoId no drawer
  const toastErr = (e, fb) => setToast({ message: e?.response?.data?.error ?? fb, type: 'error' })

  // Banco
  const [lista, setLista] = useState(null)
  const [filtros, setFiltros] = useState({ q: '', situacao: '', funcao: '', experiencia: '', page: 1 })
  // Vagas
  const [vagas, setVagas] = useState(null)
  const [modalVaga, setModalVaga] = useState(null)
  const [inscritos, setInscritos] = useState(null) // { vaga, lista }
  const [modalCand, setModalCand] = useState(null)
  const [salvando, setSalvando] = useState(false)
  // Formulário permanente
  const [formPerm, setFormPerm] = useState(null)

  useEffect(() => {
    api.get('/recrutamento/config').then((r) => { setConfig(r.data); setFormPerm(r.data.formulario || formularioPadrao(false)) }).catch(() => {})
    api.get('/recrutamento/cargos').then((r) => setCargos(r.data)).catch(() => {})
  }, [])

  const carregarBanco = useCallback(() => {
    const p = new URLSearchParams()
    Object.entries(filtros).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v) })
    setLista(null)
    api.get('/recrutamento/candidatos?' + p.toString()).then((r) => setLista(r.data)).catch(() => setLista({ itens: [], total: 0 }))
  }, [filtros])
  useEffect(() => { if (tab === 'banco') carregarBanco() }, [tab, carregarBanco])
  const carregarVagas = () => { setVagas(null); api.get('/recrutamento/vagas').then((r) => setVagas(r.data)).catch(() => setVagas([])) }
  useEffect(() => { if (tab === 'vagas') carregarVagas() }, [tab])

  const copiar = (url, msg) => { const ok = () => setToast({ message: msg, type: 'success' }); if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok, ok); else ok() }
  const linkPermanente = config ? `${origin}/talentos/${config.slug}` : ''
  const linkVaga = (v) => (config ? `${origin}/talentos/${config.slug}?vaga=${v.id}` : '')

  // ---- Situação do candidato ----
  async function mudarSituacao(c, situacao, msg) {
    try { await api.put(`/recrutamento/candidatos/${c.id}`, { situacao }); setToast({ message: msg, type: 'success' }); carregarBanco() }
    catch (e) { toastErr(e, 'Não foi possível atualizar.') }
  }
  const anonimizar = (c) => setConfirm({ titulo: 'Excluir dados (LGPD)', msg: `Anonimizar "${c.nome}"? Irreversível.`, acao: async () => { try { await api.delete(`/recrutamento/candidatos/${c.id}`); setToast({ message: 'Candidato anonimizado.', type: 'success' }); carregarBanco() } catch { setToast({ message: 'Erro.', type: 'error' }) } finally { setConfirm(null) } } })

  // ---- Vaga (com FormBuilder) ----
  function editorVaga(v) {
    if (v) { api.get(`/recrutamento/vagas/${v.id}`).then((r) => setModalVaga({ id: v.id, titulo: r.data.titulo, cargoId: r.data.cargoId || '', status: r.data.status, quantidade: r.data.quantidade, descricao: r.data.descricao || '', salarioMin: r.data.salarioMin ?? '', salarioMax: r.data.salarioMax ?? '', formulario: r.data.formulario || formularioPadrao(true) })).catch(() => toastErr(null, 'Erro ao abrir a vaga.')) }
    else setModalVaga({ titulo: '', cargoId: '', status: 'ABERTA', quantidade: 1, descricao: '', salarioMin: '', salarioMax: '', formulario: formularioPadrao(true) })
  }
  async function salvarVaga() {
    const f = modalVaga
    if (!f.titulo.trim()) return setToast({ message: 'Informe o título da vaga.', type: 'error' })
    setSalvando(true)
    try {
      const body = { titulo: f.titulo, cargoId: f.cargoId || null, status: f.status, quantidade: Number(f.quantidade) || 1, descricao: f.descricao, salarioMin: f.salarioMin === '' ? null : Number(f.salarioMin), salarioMax: f.salarioMax === '' ? null : Number(f.salarioMax), formulario: f.formulario }
      if (f.id) await api.put(`/recrutamento/vagas/${f.id}`, body); else await api.post('/recrutamento/vagas', body)
      setModalVaga(null); setToast({ message: 'Vaga salva.', type: 'success' }); carregarVagas()
    } catch (e) { toastErr(e, 'Não foi possível salvar a vaga.') }
    finally { setSalvando(false) }
  }
  const encerrarVaga = (v) => setConfirm({ titulo: 'Encerrar vaga', msg: `Encerrar "${v.titulo}"? O link público deixa de aceitar inscrições.`, acao: async () => { try { await api.put(`/recrutamento/vagas/${v.id}`, { status: 'ENCERRADA' }); carregarVagas(); setToast({ message: 'Vaga encerrada.', type: 'success' }) } catch { setToast({ message: 'Erro.', type: 'error' }) } finally { setConfirm(null) } } })
  const verInscritos = (v) => { setInscritos({ vaga: v, lista: null }); api.get(`/recrutamento/vagas/${v.id}/candidaturas`).then((r) => setInscritos({ vaga: v, lista: r.data })).catch(() => setInscritos({ vaga: v, lista: [] })) }

  // ---- Formulário permanente ----
  async function salvarFormPerm() {
    setSalvando(true)
    try { const r = await api.put('/recrutamento/config', { formulario: formPerm }); setConfig(r.data); setToast({ message: 'Formulário salvo.', type: 'success' }) }
    catch (e) { toastErr(e, 'Não foi possível salvar.') }
    finally { setSalvando(false) }
  }

  // ---- Novo candidato (manual, simples) ----
  function novoCandidato() { setModalCand({ nome: '', telefone: '', email: '', endereco: '', cidade: '', bairro: '', origem: 'MANUAL', funcoesInteresse: [], experienciasRapidas: [] }) }
  async function salvarCandidato() {
    const f = modalCand
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    if (!f.telefone.replace(/\D/g, '')) return setToast({ message: 'Informe o telefone.', type: 'error' })
    setSalvando(true)
    try { const r = await api.post('/recrutamento/candidatos', f); setModalCand(null); setToast({ message: 'Candidato cadastrado.', type: 'success' }); carregarBanco(); setSel(r.data.id) }
    catch (e) { toastErr(e, 'Não foi possível cadastrar.') }
    finally { setSalvando(false) }
  }
  const toggleArr = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Banco de Talentos</h1>
          <div className="page-header-sub">Deixe um link de “Trabalhe conosco” sempre aberto e crie vagas quando precisar contratar.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => copiar(linkPermanente, 'Link do banco de talentos copiado!')} disabled={!config}>🔗 Copiar link permanente</button>
          <button className="btn btn-secondary" onClick={() => editorVaga(null)}>+ Nova vaga</button>
          <button className="btn btn-primary" onClick={novoCandidato}>+ Novo candidato</button>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* ===== BANCO DE TALENTOS ===== */}
      {tab === 'banco' && (
        <>
          <div className="bt-filtros">
            <input className="form-input" style={{ maxWidth: 240 }} placeholder="Buscar nome, telefone, e-mail…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value, page: 1 })} />
            <select className="form-input" value={filtros.situacao} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value, page: 1 })}><option value="">Todas situações</option><option value="ATIVO">Ativo no banco</option><option value="ARQUIVADO">Arquivado</option><option value="CONTRATADO">Contratado</option></select>
            <select className="form-input" value={filtros.funcao} onChange={(e) => setFiltros({ ...filtros, funcao: e.target.value, page: 1 })}><option value="">Todas funções</option>{FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            <select className="form-input" value={filtros.experiencia} onChange={(e) => setFiltros({ ...filtros, experiencia: e.target.value, page: 1 })}><option value="">Toda experiência</option>{EXPERIENCIAS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </div>
          {lista === null ? <div className="loading-state">Carregando…</div>
          : lista.itens.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}><div style={{ fontSize: 34, marginBottom: 8 }}>👥</div>Ninguém aqui ainda. Divulgue o link permanente ou cadastre alguém.</div>
          : (<>
            <div className="table-card"><table className="hb-table">
              <thead><tr><th>Nome</th><th>Funções</th><th>Local</th><th>Disponibilidade</th><th>Cadastro</th><th>Situação</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
              <tbody>
                {lista.itens.map((c) => (
                  <tr key={c.id} className="bt-row" onClick={() => setSel(c.id)}>
                    <td><div className="ent-row-id-txt"><span className="ent-row-nome">{c.nome}</span><span className="ent-row-whats">{formatarWhats(c.telefone)}</span></div></td>
                    <td style={{ fontSize: 12, color: '#666' }}>{(c.funcoesInteresse || []).slice(0, 2).join(', ') || '—'}</td>
                    <td style={{ fontSize: 12, color: '#666' }}>{c.cidade ? `${c.cidade}${c.bairro ? '/' + c.bairro : ''}` : '—'}</td>
                    <td style={{ fontSize: 12, color: '#666' }}>{dispResumo(c.disponibilidade)}</td>
                    <td style={{ fontSize: 12, color: '#888' }}>{fmtData(c.criadoEm)}</td>
                    <td><span className={'badge ' + (SITUACAO_CLS[c.situacao] || 'badge-gray')}>{SITUACAO_LABEL[c.situacao] || 'Ativo'}</span>{c.totalCandidaturas > 0 && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{c.totalCandidaturas} vaga(s)</span>}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div className="ind-acts">
                        <a className="ind-act" href={waLink(c.telefone)} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                        {c.situacao !== 'CONTRATADO' && <button className="ind-act ind-act-ok" onClick={() => mudarSituacao(c, 'CONTRATADO', 'Marcado como contratado.')}>✓ Contratado</button>}
                        {c.situacao !== 'ARQUIVADO' ? <button className="ind-act" onClick={() => mudarSituacao(c, 'ARQUIVADO', 'Arquivado.')}>Arquivar</button> : <button className="ind-act" onClick={() => mudarSituacao(c, 'ATIVO', 'Reativado.')}>Reativar</button>}
                        <button className="ind-act ind-act-danger" onClick={() => anonimizar(c)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {lista.total > lista.pageSize && (
              <div className="bt-paginacao">
                <button className="btn btn-secondary btn-sm" disabled={filtros.page <= 1} onClick={() => setFiltros({ ...filtros, page: filtros.page - 1 })}>‹ Anterior</button>
                <span>{filtros.page} / {Math.ceil(lista.total / lista.pageSize)} · {lista.total} pessoas</span>
                <button className="btn btn-secondary btn-sm" disabled={filtros.page >= Math.ceil(lista.total / lista.pageSize)} onClick={() => setFiltros({ ...filtros, page: filtros.page + 1 })}>Próximo ›</button>
              </div>
            )}
          </>)}
        </>
      )}

      {/* ===== VAGAS ABERTAS ===== */}
      {tab === 'vagas' && (
        vagas === null ? <div className="loading-state">Carregando…</div>
        : vagas.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}><div style={{ fontSize: 34, marginBottom: 8 }}>💼</div>Nenhuma vaga. Crie uma vaga com formulário próprio para receber inscrições filtradas.</div>
        : (
          <div className="bt-vagas">
            {vagas.map((v) => (
              <div className={'bt-vaga vs-' + v.status} key={v.id}>
                <div className="bt-vaga-top">
                  <div className="bt-vaga-titulo">{v.titulo}</div>
                  <span className={'badge ' + (VAGA_STATUS_CLS[v.status] || 'badge-gray')}>{v.status}</span>
                </div>
                <div className="bt-vaga-sub">{v.cargo?.nome || 'Sem cargo'} · {v.quantidade} vaga(s) · criada {fmtData(v.criadoEm)}</div>
                <div className="bt-vaga-stats">
                  <div className="vst"><strong>{v.stats.inscritos}</strong><span>Inscritos</span></div>
                  <div className="vst vst-ok"><strong>{v.stats.atende}</strong><span>Atendem</span></div>
                  <div className="vst vst-parcial"><strong>{v.stats.parcial}</strong><span>Parcial</span></div>
                </div>
                <div className="ind-linkfield" style={{ marginBottom: 12 }}>
                  <span className="ind-linkfield-url">{linkVaga(v)}</span>
                  <button type="button" className="ind-linkfield-copy" onClick={() => copiar(linkVaga(v), 'Link da vaga copiado!')}>Copiar</button>
                </div>
                <div className="bt-vaga-acoes">
                  <button className="ind-act" onClick={() => verInscritos(v)}>👥 Ver inscritos</button>
                  <button className="ind-act" onClick={() => editorVaga(v)}>✏️ Editar formulário</button>
                  {v.status !== 'ENCERRADA' && <button className="ind-act ind-act-danger" onClick={() => encerrarVaga(v)}>Encerrar</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ===== FORMULÁRIO PERMANENTE ===== */}
      {tab === 'formulario' && formPerm && (
        <div className="bt-form-perm">
          <div className="ind-note" style={{ maxWidth: 760, marginBottom: 14 }}>Este é o formulário do <strong>“Trabalhe conosco”</strong> — sempre aberto. Configure abaixo e divulgue o link permanente no Instagram, QR Code, cardápio ou WhatsApp.</div>
          <div className="ind-linkfield" style={{ maxWidth: 520, marginBottom: 16 }}>
            <span className="ind-linkfield-url">{linkPermanente}</span>
            <button type="button" className="ind-linkfield-copy" onClick={() => copiar(linkPermanente, 'Link copiado!')}>Copiar</button>
          </div>
          <div style={{ maxWidth: 720 }}>
            <FormBuilder value={formPerm} onChange={setFormPerm} />
            <div style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={salvarFormPerm} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar formulário'}</button></div>
          </div>
        </div>
      )}

      {sel && <CandidatoDrawer candidatoId={sel} onClose={() => setSel(null)} onChanged={() => { if (tab === 'banco') carregarBanco() }} onToast={(m, t) => setToast({ message: m, type: t })} />}

      {/* ===== MODAL: inscritos da vaga (lista simples) ===== */}
      {inscritos && (
        <div className="modal-overlay"><div className="modal modal-card-large" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
          <div className="modal-header"><div><div className="modal-title">Inscritos · {inscritos.vaga.titulo}</div><div className="modal-sub">Classificação automática pelas respostas da vaga. Você pode abrir o perfil e revisar.</div></div><button className="drawer-x" onClick={() => setInscritos(null)}>×</button></div>
          {inscritos.lista === null ? <div className="loading-state">Carregando…</div>
          : inscritos.lista.length === 0 ? <div className="drawer-vazio" style={{ padding: 20 }}>Nenhum inscrito nesta vaga ainda. Divulgue o link.</div>
          : (
            <div className="insc-lista">
              {inscritos.lista.map((c) => (
                <div className="insc-item" key={c.id}>
                  <div className="insc-cab">
                    <div><span className="insc-nome" onClick={() => { setInscritos(null); setSel(c.candidatoId) }}>{c.nome}</span><div className="insc-sub">{formatarWhats(c.telefone)}{c.cidade ? ` · ${c.cidade}` : ''}</div></div>
                    <span className={'cl-badge ' + (CLASSIF_CLS[c.classificacao] || 'cl-incompleto')}>{CLASSIF_LABEL[c.classificacao] || 'Incompleto'}{c.aderencia != null ? ` · ${c.aderencia}%` : ''}</span>
                  </div>
                  {Array.isArray(c.detalhe) && c.detalhe.length > 0 && <div className="insc-detalhe">{c.detalhe.map((d, i) => <span key={i} className={'insc-chk insc-' + d.ok}>{d.ok === 'sim' ? '✓' : d.ok === 'nao' ? '✗' : '⚠'} {d.label}</span>)}</div>}
                  <div className="insc-acoes"><a className="ind-act" href={waLink(c.telefone)} target="_blank" rel="noreferrer">💬 WhatsApp</a><button className="ind-act" onClick={() => { setInscritos(null); setSel(c.candidatoId) }}>Abrir perfil</button></div>
                </div>
              ))}
            </div>
          )}
        </div></div>
      )}

      {/* ===== MODAL: nova vaga (com FormBuilder) ===== */}
      {modalVaga && (() => { const f = modalVaga; const set = (patch) => setModalVaga({ ...f, ...patch }); return (
        <div className="modal-overlay"><div className="modal modal-cupom modal-vaga" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660 }}>
          <div className="modal-title">{f.id ? 'Editar vaga' : 'Nova vaga'}</div>
          <div className="modal-sub">Configure a vaga e o formulário que os candidatos vão preencher.</div>
          <div className="fb">
            <div className="fb-sec">
              <div className="fb-sec-head"><div className="fb-sec-ico">💼</div><div><div className="fb-sec-t">Dados da vaga</div><div className="fb-sec-s">Informações básicas do processo.</div></div></div>
              <div className="form-group"><label className="form-label">Título da vaga *</label><input className="form-input" value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Ex.: Atendente noturno" /></div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Cargo</label><select className="form-input" value={f.cargoId} onChange={(e) => set({ cargoId: e.target.value })}><option value="">—</option>{cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={f.status} onChange={(e) => set({ status: e.target.value })}>{VAGA_STATUS.map(([vv, l]) => <option key={vv} value={vv}>{l}</option>)}</select></div>
              </div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Quantidade</label><input className="form-input" inputMode="numeric" value={f.quantidade} onChange={(e) => set({ quantidade: e.target.value.replace(/\D/g, '') })} /></div>
                <div className="form-group"><label className="form-label">Salário (R$)</label><div className="form-grid-2"><input className="form-input" inputMode="decimal" placeholder="mín." value={f.salarioMin} onChange={(e) => set({ salarioMin: e.target.value.replace(/[^\d.,]/g, '') })} /><input className="form-input" inputMode="decimal" placeholder="máx." value={f.salarioMax} onChange={(e) => set({ salarioMax: e.target.value.replace(/[^\d.,]/g, '') })} /></div></div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Descrição da vaga</label><textarea className="form-input" rows={2} value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="Aparece no formulário público da vaga" /></div>
            </div>
            <FormBuilder value={f.formulario} onChange={(fm) => set({ formulario: fm })} />
          </div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setModalVaga(null)} disabled={salvando}>Cancelar</button><button className="btn btn-primary" onClick={salvarVaga} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar vaga'}</button></div>
        </div></div>
      ) })()}

      {/* ===== MODAL: novo candidato (manual, simples) ===== */}
      {modalCand && (() => { const f = modalCand; const set = (patch) => setModalCand({ ...f, ...patch }); return (
        <div className="modal-overlay"><div className="modal modal-cupom" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">Novo candidato</div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={f.nome} onChange={(e) => set({ nome: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Telefone *</label><input className="form-input" inputMode="numeric" value={mascararTelefone(f.telefone)} onChange={(e) => set({ telefone: mascararTelefone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" value={f.email} onChange={(e) => set({ email: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Origem</label><select className="form-input" value={f.origem} onChange={(e) => set({ origem: e.target.value })}>{ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Endereço (rua e número)</label><input className="form-input" value={f.endereco} onChange={(e) => set({ endereco: e.target.value })} placeholder="Ex.: Rua das Flores, 123" /></div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Bairro</label><input className="form-input" value={f.bairro} onChange={(e) => set({ bairro: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" value={f.cidade} onChange={(e) => set({ cidade: e.target.value })} /></div>
          </div>
          <div className="form-group"><label className="form-label">Funções de interesse</label><div className="chip-row">{FUNCOES.map((fn) => <button key={fn} type="button" className={'chip' + (f.funcoesInteresse.includes(fn) ? ' chip-on' : '')} onClick={() => set({ funcoesInteresse: toggleArr(f.funcoesInteresse, fn) })}>{fn}</button>)}</div></div>
          <div className="form-group"><label className="form-label">Experiências práticas</label><div className="chip-row">{EXPERIENCIAS.map((x) => <button key={x} type="button" className={'chip' + (f.experienciasRapidas.includes(x) ? ' chip-on' : '')} onClick={() => set({ experienciasRapidas: toggleArr(f.experienciasRapidas, x) })}>{x}</button>)}</div></div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setModalCand(null)} disabled={salvando}>Cancelar</button><button className="btn btn-primary" onClick={salvarCandidato} disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar'}</button></div>
        </div></div>
      ) })()}

      <ConfirmDialog open={!!confirm} title={confirm?.titulo} message={confirm?.msg} variant="danger" onConfirm={() => confirm?.acao?.()} onCancel={() => setConfirm(null)} />
    </div>
  )
}
