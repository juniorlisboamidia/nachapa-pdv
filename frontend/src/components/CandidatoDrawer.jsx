// Drawer do candidato: PERFIL permanente + PROCESSOS SELETIVOS (candidaturas).
// Ações de processo (status/avaliação/entrevista/contato/observação/recálculo)
// atuam SEMPRE na candidatura selecionada — nunca em outra vaga do mesmo candidato.
import { useEffect, useState } from 'react'
import api from '../services/api'
import ConfirmDialog from './ConfirmDialog'
import { formatarWhats } from '../utils/telefone'
import {
  STATUS, STATUS_LABEL, STATUS_CLS, ORIGEM_LABEL, VINCULO_LABEL, TURNO_LABEL,
  CONTATO_TIPO, CONTATO_RES, ENTREVISTA_TIPO, CRITERIOS_AV, compatCls, qualidadeCls, QUALIDADE_LABEL,
  fmtData, fmtDataHora, permanencia,
} from '../utils/recrutamento'

const HIST_ICON = { STATUS: '🔄', CONTATO: '📞', AVALIACAO: '⭐', ENTREVISTA: '📅', OBS: '📝', TAG: '🏷️', SISTEMA: '⚙️' }
const LABELS_FIXOS = { sobre: 'Conte sua experiência', ultimosEmpregos: 'Últimos empregos' }
const respostasLegiveis = (respostas, perguntas) => {
  if (!respostas || typeof respostas !== 'object') return []
  const mapa = {}; (perguntas || []).forEach((p) => { mapa[p.id] = p.texto })
  return Object.entries(respostas).filter(([, val]) => val != null && val !== '' && !(Array.isArray(val) && !val.length)).map(([k, val]) => ({ label: mapa[k] || LABELS_FIXOS[k] || k, valor: Array.isArray(val) ? val.join(', ') : String(val) }))
}
const Respostas = ({ titulo, respostas, perguntas }) => { const rs = respostasLegiveis(respostas, perguntas); if (!rs.length) return null; return <><div className="drawer-sec-titulo">{titulo}</div>{rs.map((r, i) => <div key={i} className="drawer-resp"><div className="drawer-resp-q">{r.label}</div><div className="drawer-resp-a">{r.valor}</div></div>)}</> }

export default function CandidatoDrawer({ candidatoId, onClose, onChanged, onToast }) {
  const [c, setC] = useState(null)
  const [cxSel, setCxSel] = useState(null) // candidaturaId selecionada
  const [painel, setPainel] = useState(null)
  const [form, setForm] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const carregar = () => api.get(`/recrutamento/candidatos/${candidatoId}`).then((r) => {
    setC(r.data)
    setCxSel((prev) => (r.data.candidaturas || []).some((x) => x.id === prev) ? prev : (r.data.candidaturas?.[0]?.id ?? null))
  }).catch(() => onToast?.('Não foi possível carregar o candidato.', 'error'))
  useEffect(() => { setC(null); carregar() }, [candidatoId]) // eslint-disable-line

  const cx = (c?.candidaturas || []).find((x) => x.id === cxSel) || null

  function abrir(p, base = {}) { setPainel(p); setForm(base) }
  async function acao(fn, msg) {
    setSalvando(true)
    try { await fn(); setPainel(null); await carregar(); onChanged?.(); if (msg) onToast?.(msg, 'success') }
    catch (e) { onToast?.(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error') }
    finally { setSalvando(false) }
  }
  const postCx = (sufixo, body) => api.post(`/recrutamento/candidaturas/${cxSel}/${sufixo}`, body)
  const putCx = (sufixo, body) => api.put(`/recrutamento/candidaturas/${cxSel}/${sufixo}`, body)

  if (!c) return <div className="drawer-overlay" onClick={onClose}><div className="drawer" onClick={(e) => e.stopPropagation()}><div className="loading-state">Carregando…</div></div></div>

  const disp = c.disponibilidade || {}
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="drawer-titulo">{c.nome}</div>
            <div className="drawer-sub">{formatarWhats(c.telefone)}{c.email ? ` · ${c.email}` : ''}{c.cidade ? ` · ${c.cidade}${c.bairro ? '/' + c.bairro : ''}` : ''}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-gray">Origem: {ORIGEM_LABEL[c.origem] || c.origem}</span>
              {c.bancoTalentos && <span className="badge badge-purple">Banco de talentos</span>}
              <span className="badge badge-blue">{(c.candidaturas || []).length} processo(s)</span>
            </div>
          </div>
          <button type="button" className="drawer-x" onClick={onClose}>×</button>
        </div>

        <div className="drawer-body">
          {/* ===== PROCESSOS SELETIVOS ===== */}
          <div className="drawer-sec-titulo" style={{ marginTop: 0 }}>Processos seletivos</div>
          {(c.candidaturas || []).length === 0 ? (
            <div className="drawer-vazio">Ainda não participa de nenhuma vaga. Use “Vincular a vaga” abaixo.</div>
          ) : (
            <>
              <div className="proc-tabs">
                {c.candidaturas.map((x) => (
                  <button key={x.id} type="button" className={'proc-tab' + (x.id === cxSel ? ' active' : '')} onClick={() => { setCxSel(x.id); setPainel(null) }}>
                    <span className="proc-tab-vaga">{x.vaga?.titulo || 'Vaga'}</span>
                    <span className={'badge ' + (STATUS_CLS[x.status] || 'badge-gray')}>{STATUS_LABEL[x.status]}</span>
                  </button>
                ))}
              </div>

              {cx && (<div className="proc-detalhe">
                <div className="proc-head">
                  <div>
                    <div className="proc-vaga">{cx.vaga?.titulo}</div>
                    <div className="proc-meta">Candidatura em {fmtData(cx.criadoEm)} · <span className={'badge ' + (STATUS_CLS[cx.status] || 'badge-gray')}>{STATUS_LABEL[cx.status]}</span></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={'compat ' + compatCls(cx.score)}>{cx.score ?? '—'}/100</span>
                    {cx.scoreQualidade && cx.scoreQualidade !== 'COMPLETO' && <div className={'q-badge ' + qualidadeCls(cx.scoreQualidade)}>{QUALIDADE_LABEL[cx.scoreQualidade]}</div>}
                  </div>
                </div>

                <div className="proc-acoes">
                  <button type="button" className="ind-act" onClick={() => abrir('status', { status: cx.status, motivoReprovacao: cx.motivoReprovacao || '' })}>Alterar status</button>
                  <button type="button" className="ind-act" onClick={() => abrir('obs', { descricao: '', proximaAcao: cx.proximaAcao || '', dataRetorno: '' })}>Observação</button>
                  <button type="button" className="ind-act" onClick={() => abrir('contato', { tipo: 'WHATSAPP', resultado: 'INTERESSADO', observacao: '' })}>Contato</button>
                  <button type="button" className="ind-act" onClick={() => abrir('entrevista', { quando: '', tipo: 'PRESENCIAL', responsavel: '', local: '' })}>Entrevista</button>
                  <button type="button" className="ind-act" onClick={() => abrir('avaliacao', { evidencias: '' })}>Avaliar</button>
                  <button type="button" className="ind-act" onClick={() => acao(() => api.post(`/recrutamento/candidaturas/${cxSel}/recalcular-score`), 'Score recalculado.')}>Recalcular score</button>
                  <button type="button" className="ind-act ind-act-danger" onClick={() => setConfirm({ titulo: 'Remover candidatura', msg: `Remover a participação em "${cx.vaga?.titulo}"? O histórico deste processo será apagado.`, acao: async () => { try { await api.delete(`/recrutamento/candidaturas/${cxSel}`); onToast?.('Candidatura removida.', 'success'); await carregar(); onChanged?.() } catch { onToast?.('Erro ao remover.', 'error') } finally { setConfirm(null) } } })}>Remover</button>
                </div>

                {painel && (<div className="drawer-painel">
                  {painel === 'status' && (<>
                    <div className="form-label">Novo status</div>
                    <select className="form-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
                    {form.status === 'REPROVADO' && <input className="form-input" style={{ marginTop: 8 }} placeholder="Motivo da reprovação" value={form.motivoReprovacao} onChange={(e) => setForm({ ...form, motivoReprovacao: e.target.value })} />}
                    <input className="form-input" style={{ marginTop: 8 }} placeholder="Observação (opcional)" value={form.observacao || ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                    <div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando} onClick={() => acao(() => putCx('status', { status: form.status, motivoReprovacao: form.motivoReprovacao, observacao: form.observacao }), 'Status atualizado.')}>Salvar</button></div>
                  </>)}
                  {painel === 'obs' && (<>
                    <div className="form-label">Observação deste processo</div>
                    <textarea className="form-input" rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                    <div className="form-grid-2" style={{ marginTop: 8 }}><input className="form-input" placeholder="Próxima ação" value={form.proximaAcao} onChange={(e) => setForm({ ...form, proximaAcao: e.target.value })} /><input className="form-input" type="date" value={form.dataRetorno} onChange={(e) => setForm({ ...form, dataRetorno: e.target.value })} /></div>
                    <div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando || !form.descricao?.trim()} onClick={() => acao(() => postCx('observacao', form), 'Observação registrada.')}>Salvar</button></div>
                  </>)}
                  {painel === 'contato' && (<>
                    <div className="form-grid-2"><div><div className="form-label">Tipo</div><select className="form-input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{CONTATO_TIPO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div><div><div className="form-label">Resultado</div><select className="form-input" value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })}>{CONTATO_RES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
                    <input className="form-input" style={{ marginTop: 8 }} placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                    <div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando} onClick={() => acao(() => postCx('contato', form), 'Contato registrado.')}>Salvar</button></div>
                  </>)}
                  {painel === 'entrevista' && (<>
                    <div className="form-grid-2"><div><div className="form-label">Data e hora</div><input className="form-input" type="datetime-local" value={form.quando} onChange={(e) => setForm({ ...form, quando: e.target.value })} /></div><div><div className="form-label">Tipo</div><select className="form-input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{ENTREVISTA_TIPO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
                    <div className="form-grid-2" style={{ marginTop: 8 }}><input className="form-input" placeholder="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /><input className="form-input" placeholder="Local ou link" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} /></div>
                    <div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando || !form.quando} onClick={() => acao(() => postCx('entrevista', form), 'Entrevista agendada.')}>Agendar</button></div>
                  </>)}
                  {painel === 'avaliacao' && (<>
                    <div className="form-label">Avaliação (1 a 5)</div>
                    <div className="drawer-crit">{CRITERIOS_AV.map(([k, l]) => (<div key={k} className="drawer-crit-row"><span>{l}</span><div className="drawer-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={'star' + ((form[k] || 0) >= n ? ' on' : '')} onClick={() => setForm({ ...form, [k]: n })}>★</button>)}</div></div>))}</div>
                    <textarea className="form-input" style={{ marginTop: 8 }} rows={3} placeholder="Evidências da avaliação (obrigatório)" value={form.evidencias} onChange={(e) => setForm({ ...form, evidencias: e.target.value })} />
                    <div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando || !form.evidencias?.trim()} onClick={() => acao(() => postCx('avaliacao', form), 'Avaliação registrada.')}>Salvar</button></div>
                  </>)}
                </div>)}

                {cx.proximaAcao && <div className="drawer-prox">⏭️ Próxima ação: <strong>{cx.proximaAcao}</strong>{cx.dataRetorno ? ` · ${fmtData(cx.dataRetorno)}` : ''}</div>}
                {cx.motivoReprovacao && <div className="proc-motivo">Motivo da reprovação: {cx.motivoReprovacao}</div>}

                {Array.isArray(cx.scoreBreakdown) && (
                  <div className="drawer-score" style={{ marginTop: 10 }}>
                    <div className="drawer-score-top"><span className="drawer-score-vaga">Como o score foi calculado</span><span className="proc-meta">v{cx.scoreVersao || '1.0'} · {cx.scorePreenchimento ?? 0}% dos dados</span></div>
                    <div className="drawer-score-detalhe">{cx.scoreBreakdown.map((b) => <div key={b.chave}><span>{b.label}</span><strong>{b.pontos}/{b.max}</strong></div>)}</div>
                    {cx.scoreQualidade !== 'COMPLETO' && <div className="proc-aviso">⚠️ {cx.scoreQualidade === 'ESTIMADO' ? 'Score estimado — faltam dados/avaliação humana.' : 'Score parcial — faltam informações relevantes.'}</div>}
                  </div>
                )}

                {(cx.entrevistas || []).length > 0 && <><div className="drawer-sec-titulo">Entrevistas</div>{cx.entrevistas.map((e) => <div key={e.id} className="drawer-exp">📅 {fmtDataHora(e.quando)} · {e.tipo}{e.responsavel ? ` · ${e.responsavel}` : ''} <span className="badge badge-gray">{e.status}</span></div>)}</>}
                <Respostas titulo="Respostas desta vaga" respostas={cx.respostas} perguntas={cx.vaga?.formulario?.perguntas} />
                {(cx.avaliacoes || []).length > 0 && <><div className="drawer-sec-titulo">Avaliações</div>{cx.avaliacoes.map((a) => <div key={a.id} className="drawer-av"><div className="drawer-av-top">{a.autor || 'Gestor'} · {fmtDataHora(a.criadoEm)}</div><div>{a.evidencias}</div></div>)}</>}

                <div className="drawer-sec-titulo">Histórico deste processo</div>
                <div className="drawer-timeline">{(cx.historico || []).map((h) => (<div key={h.id} className="drawer-tl-item"><span className="drawer-tl-ico">{HIST_ICON[h.tipo] || '•'}</span><div><div className="drawer-tl-txt">{h.descricao || (h.tipo === 'STATUS' ? `${STATUS_LABEL[h.de] || h.de || '—'} → ${STATUS_LABEL[h.para] || h.para}` : h.tipo)}</div><div className="drawer-tl-meta">{fmtDataHora(h.criadoEm)}{h.usuario ? ` · ${h.usuario}` : ''}</div></div></div>))}</div>
              </div>)}
            </>
          )}

          {/* ===== PERFIL DO CANDIDATO ===== */}
          <div className="drawer-sep" />
          <div className="drawer-sec-titulo">Perfil do candidato</div>
          <div className="drawer-acoes" style={{ padding: 0, border: 'none', marginBottom: 10 }}>
            <button type="button" className="ind-act" onClick={() => abrir('vaga', { vagaId: '' })}>Vincular a vaga</button>
            <button type="button" className="ind-act" onClick={() => abrir('tag', { tag: '' })}>Tag global</button>
            <button type="button" className="ind-act" onClick={() => acao(() => api.put(`/recrutamento/candidatos/${candidatoId}`, { bancoTalentos: !c.bancoTalentos }), 'Atualizado.')}>{c.bancoTalentos ? 'Tirar do banco' : 'Marcar banco de talentos'}</button>
            <button type="button" className="ind-act ind-act-danger" onClick={() => setConfirm({ titulo: 'Excluir dados (LGPD)', msg: `Anonimizar "${c.nome}"? Os dados pessoais serão removidos de forma irreversível.`, acao: async () => { try { await api.delete(`/recrutamento/candidatos/${candidatoId}`); onToast?.('Candidato anonimizado.', 'success'); onChanged?.(); onClose?.() } catch { onToast?.('Erro ao anonimizar.', 'error') } finally { setConfirm(null) } } })}>Excluir dados</button>
          </div>
          {painel === 'vaga' && (<div className="drawer-painel"><div className="form-label">Vincular à vaga</div><select className="form-input" value={form.vagaId} onChange={(e) => setForm({ ...form, vagaId: e.target.value })}><option value="">Selecione…</option>{(c.vagasAbertas || []).map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select><div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando || !form.vagaId} onClick={() => acao(() => api.post(`/recrutamento/candidatos/${candidatoId}/candidatura`, { vagaId: Number(form.vagaId) }), 'Vinculado à vaga.')}>Vincular</button></div></div>)}
          {painel === 'tag' && (<div className="drawer-painel"><div className="form-label">Nova tag global</div><input className="form-input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="Ex.: Boa comunicação" /><div className="drawer-painel-acoes"><button className="btn btn-secondary btn-sm" onClick={() => setPainel(null)}>Cancelar</button><button className="btn btn-primary btn-sm" disabled={salvando || !form.tag?.trim()} onClick={() => acao(() => api.put(`/recrutamento/candidatos/${candidatoId}`, { tags: [...new Set([...(c.tags || []), form.tag.trim()])] }), 'Tag adicionada.')}>Adicionar</button></div></div>)}

          <div className="drawer-cols">
            <div>
              {(c.endereco || c.bairro || c.cidade) && <div className="drawer-kv"><span>Endereço</span><strong>{[c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') || '—'}</strong></div>}
              <div className="drawer-kv"><span>Funções</span><strong>{(c.funcoesInteresse || []).join(', ') || '—'}</strong></div>
              <div className="drawer-kv"><span>Vínculo</span><strong>{VINCULO_LABEL[c.tipoVinculo] || '—'}</strong></div>
              <div className="drawer-kv"><span>Pretensão</span><strong>{c.pretensaoSalarial ? `R$ ${Number(c.pretensaoSalarial).toLocaleString('pt-BR')}` : '—'}</strong></div>
              <div className="drawer-kv"><span>Disponível em</span><strong>{fmtData(c.disponivelEm)}</strong></div>
              <div className="drawer-kv"><span>Turnos</span><strong>{(disp.turnos || []).map((t) => TURNO_LABEL[t] || t).join(', ') || '—'}</strong></div>
              <div className="drawer-kv"><span>Dias</span><strong>{(disp.dias || []).join(', ') || '—'}</strong></div>
              <div className="drawer-kv"><span>Transporte próprio</span><strong>{disp.transporteProprio ? 'Sim' : '—'}</strong></div>
              <div className="drawer-kv"><span>Deslocamento</span><strong>{disp.tempoDeslocamentoMin != null ? `${disp.tempoDeslocamentoMin} min` : '—'}</strong></div>
            </div>
            <div>
              <div className="drawer-mini-titulo">Experiências práticas</div>
              <div className="chip-row">{(c.experienciasRapidas || []).length ? c.experienciasRapidas.map((e) => <span key={e} className="chip chip-on" style={{ cursor: 'default' }}>{e}</span>) : <span className="drawer-vazio">—</span>}</div>
              {(c.experiencias || []).length > 0 && (() => { const perm = permanencia(c.experiencias); return <>
                <div className="drawer-mini-titulo">Histórico em empresas {perm && <span className={'perm-badge ' + perm.cls}>{perm.label} · ~{perm.media} meses/emprego</span>}</div>
                {c.experiencias.map((e) => <div key={e.id} className="drawer-exp"><strong>{e.empresa}</strong>{e.cargo ? ` · ${e.cargo}` : ''}{e.funcao ? ` · ${e.funcao}` : ''}{e.duracao ? <span className="drawer-exp-dur">{e.duracao}</span> : ''}{e.atividades ? <div className="drawer-exp-sub">{e.atividades}</div> : null}</div>)}
              </> })()}
              <div className="drawer-mini-titulo">Tags globais</div>
              <div className="chip-row">{(c.tags || []).length ? c.tags.map((t) => <span key={t} className="badge badge-blue">{t}</span>) : <span className="drawer-vazio">—</span>}</div>
              {(c.linkedin || c.instagram) && <><div className="drawer-mini-titulo">Links</div><div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="drawer-link">in LinkedIn</a>}{c.instagram && <a href={c.instagram} target="_blank" rel="noreferrer" className="drawer-link">◎ Instagram</a>}</div></>}
            </div>
          </div>
          {c.observacoesInternas && <><div className="drawer-mini-titulo">Observações internas (perfil)</div><div className="drawer-obs">{c.observacoesInternas}</div></>}
          <Respostas titulo="Respostas do formulário" respostas={c.respostasFormulario} perguntas={c.configForm?.perguntas} />
          <div className="drawer-sec-titulo">Consentimento LGPD</div>
          <div className="drawer-kv"><span>Processo seletivo</span><strong>{c.consentimentoLGPD ? 'Sim' : 'Não'}</strong></div>
          <div className="drawer-kv"><span>Banco de talentos</span><strong>{c.consentimentoBanco ? 'Sim' : 'Não'}</strong></div>
          <div className="drawer-kv"><span>Registrado em</span><strong>{fmtDataHora(c.consentimentoEm)} {c.termoVersao ? `(termo ${c.termoVersao})` : ''}</strong></div>
        </div>
      </div>
      <ConfirmDialog open={!!confirm} title={confirm?.titulo} message={confirm?.msg} variant="danger" onConfirm={() => confirm?.acao?.()} onCancel={() => setConfirm(null)} />
    </div>
  )
}
