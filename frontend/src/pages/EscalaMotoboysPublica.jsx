// Escala de Motoboys (pública) — tela acessada pelo motoboy via token, sem sidebar.
// FILTRO DE EQUIPE: uma etapa de identificação (nome + WhatsApp) vem ANTES da escala.
// Só a equipe cadastrada e ATIVA vê a escala e se inscreve; os demais recebem a
// orientação certa (bloqueado → falar com a loja; não cadastrado → enviar cadastro
// que fica pendente de aprovação). Mostra apenas vagas/restantes/status (sem nomes).
//
// MOBILE-FIRST: é por onde os motoboys abrem o link. Até 600px cada dia é uma
// LINHA tocável (alvo >= 48px); a partir daí vira a grade de 7 colunas, com os
// dias alinhados na coluna do seu dia da semana (semana começa na segunda).
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'

const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
// Cabeçalho da grade (desktop): a semana da escala começa na segunda.
const CABECALHO_GRADE = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function dataCurta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
// Coluna do dia na grade de 7 colunas (1 = segunda ... 7 = domingo). Sem isso a
// semana incompleta (a 1ª e a última do mês) encosta na esquerda e desalinha.
function colunaDaSemana(diaSemana) {
  return ((Number(diaSemana) + 6) % 7) + 1
}
// Máscara BR conforme digita: (11) 91234-5678
function mascararWhatsapp(v) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
// Número (dígitos, já normalizado) → formato wa.me: prefixa 55 se 10/11 dígitos.
function numeroWaMe(digitos) {
  const d = String(digitos ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.startsWith('55')) return d
  if (d.length === 10 || d.length === 11) return '55' + d
  return d
}
// disponível p/ inscrição: escala aberta, dia aberto, com vaga e não lotado
function diaDisponivel(dia, escalaAberta) {
  return escalaAberta && dia.status === 'ABERTO' && Number(dia.vagas) > 0 && !dia.lotado
}
function rotuloDia(dia, escalaAberta) {
  if (dia.status === 'FECHADO') return { label: 'Fechado', cls: 'badge-gray' }
  if (Number(dia.vagas) === 0) return { label: 'Sem vagas', cls: 'badge-gray' }
  // Rótulos curtos: a coluna da grade tem ~60px úteis e "Completo" quebrava feio.
  if (dia.lotado) return { label: 'Lotado', cls: 'badge-blue' }
  if (!escalaAberta) return { label: 'Fechada', cls: 'badge-gray' }
  // "vaga(s)" ocupava largura demais na coluna da grade (~60px úteis no desktop).
  const n = Number(dia.vagasRestantes)
  return { label: `${n} ${n === 1 ? 'vaga' : 'vagas'}`, cls: 'badge-green' }
}

export default function EscalaMotoboysPublica() {
  const { token } = useParams()
  const [escala, setEscala] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [possuiCnh, setPossuiCnh] = useState(null) // resposta "Você possui CNH?" no cadastro (Sim/Não)
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const [toast, setToast] = useState(null)
  // Etapa de identificação (filtro de equipe) antes de liberar a escala.
  const [etapa, setEtapa] = useState('identificacao') // 'identificacao' | 'escala'
  const [identificando, setIdentificando] = useState(false)
  const [resposta, setResposta] = useState(null) // { situacao, nome, empresaWhatsapp }
  const [enviandoCadastro, setEnviandoCadastro] = useState(false)
  const [cadastroEnviado, setCadastroEnviado] = useState(false)
  const [nomeConfirmado, setNomeConfirmado] = useState('')

  function carregar() {
    setLoading(true)
    setErro(null)
    api
      .get(`/public/escala-motoboys/${token}`)
      .then((r) => setEscala(r.data))
      .catch((err) => {
        if (err?.response?.status === 404) setErro('Escala não encontrada ou link inválido.')
        else
          setErro(
            err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao servidor. Tente novamente.'
              : err?.response?.data?.error ?? 'Erro ao carregar a escala.'
          )
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const escalaAberta = escala?.status === 'ABERTA'

  const semanas = useMemo(() => {
    if (!escala?.dias) return []
    // Esconde dias que já passaram (data < hoje no fuso BR) — não faz sentido se inscrever.
    // dataCurta lê a data em UTC, então a data UTC do dia É a data exibida.
    const diaISO = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
    const hb = new Date(Date.now() - 3 * 3600 * 1000)
    const hojeBR = `${hb.getUTCFullYear()}-${String(hb.getUTCMonth() + 1).padStart(2, '0')}-${String(hb.getUTCDate()).padStart(2, '0')}`
    const mapa = new Map()
    for (const d of escala.dias) {
      const iso = diaISO(d.data)
      if (iso && iso < hojeBR) continue // dia passado → não aparece
      if (!mapa.has(d.semanaDoMes)) mapa.set(d.semanaDoMes, [])
      mapa.get(d.semanaDoMes).push(d)
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([num, dias]) => ({ num, dias }))
  }, [escala])

  function validarIdentidade() {
    if (!nome.trim()) { setToast({ message: 'Informe seu nome.', type: 'error' }); return false }
    if (whatsapp.replace(/\D/g, '').length < 10) { setToast({ message: 'Informe um WhatsApp válido.', type: 'error' }); return false }
    return true
  }

  // Etapa 1 → confere o WhatsApp na equipe da loja. Só ATIVO libera a escala.
  async function verEscala() {
    if (!validarIdentidade()) return
    setIdentificando(true)
    setResposta(null)
    setCadastroEnviado(false)
    try {
      const { data } = await api.post(`/public/escala-motoboys/${token}/identificar`, { whatsapp })
      setResposta(data)
      if (data.situacao === 'APTO') {
        setNomeConfirmado(data.nome || nome.trim())
        setEtapa('escala')
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível verificar agora. Tente de novo.', type: 'error' })
    } finally {
      setIdentificando(false)
    }
  }

  // "Enviar meu cadastro" → cria a solicitação (fica pendente de aprovação).
  async function enviarCadastro() {
    if (!validarIdentidade()) return
    setEnviandoCadastro(true)
    try {
      const { data } = await api.post(`/public/escala-motoboys/${token}/cadastro`, { nome: nome.trim(), whatsapp, possuiCnh: resposta?.perguntaCnh ? possuiCnh : undefined })
      if (data.situacao === 'APTO') {
        // já é da equipe (aprovado nesse meio-tempo): segue direto pra escala
        setNomeConfirmado(nome.trim())
        setEtapa('escala')
      } else {
        setResposta((r) => ({ ...(r || {}), situacao: data.situacao }))
        setCadastroEnviado(data.situacao === 'PENDENTE')
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível enviar o cadastro agora.', type: 'error' })
    } finally {
      setEnviandoCadastro(false)
    }
  }

  function abrirWhatsappEmpresa() {
    const num = numeroWaMe(resposta?.empresaWhatsapp)
    if (!num) return
    const msg = `Olá! Sou ${nome.trim() || 'um entregador'} e tentei acessar a escala de motoboys, mas apareceu que não tenho acesso. Poderiam verificar?`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  function toggleDia(dia) {
    if (!diaDisponivel(dia, escalaAberta)) return
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(dia.id)) next.delete(dia.id)
      else next.add(dia.id)
      return next
    })
  }

  async function enviar() {
    if (selecionados.size === 0) {
      setToast({ message: 'Selecione pelo menos um dia.', type: 'error' })
      return
    }
    setEnviando(true)
    try {
      await api.post(`/public/escala-motoboys/${token}/inscricao`, {
        nome: (nomeConfirmado || nome).trim(),
        whatsapp,
        diaIds: [...selecionados]
      })
      setConcluido(true)
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível registrar a inscrição.', type: 'error' })
      // recarrega para refletir vagas/lotação atualizadas
      carregar()
      setSelecionados(new Set())
    } finally {
      setEnviando(false)
    }
  }

  const cabecalho = escala && (
    <div className="pub-header">
      <div className="pub-empresa">{escala.empresaNome}</div>
      <h1 className="pub-titulo">Escala de Motoboys</h1>
      <div className="pub-mes">
        {MESES[escala.mes - 1] ?? escala.mes} · {escala.ano}
      </div>
    </div>
  )

  return (
    <div className="pub-page">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      <div className="pub-card">
        {loading ? (
          <div className="loading-state">Carregando escala…</div>
        ) : erro ? (
          <div className="pub-erro">
            <div className="pub-erro-titulo">Ops…</div>
            <div className="pub-erro-msg">{erro}</div>
          </div>
        ) : concluido ? (
          <div className="pub-sucesso">
            <div className="pub-sucesso-icone">✓</div>
            <div className="pub-sucesso-titulo">Sua inscrição foi registrada.</div>
            <div className="pub-sucesso-msg">A confirmação final será enviada pela equipe.</div>
          </div>
        ) : etapa === 'identificacao' ? (
          <>
            {cabecalho}
            <div className="pub-instrucao">Confirme seus dados para acessar a escala:</div>
            <div className="pub-form">
              <div className="form-group">
                <label className="form-label" htmlFor="pub-nome">Nome</label>
                <input
                  id="pub-nome"
                  className="form-input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                  enterKeyHint="next"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pub-zap">WhatsApp</label>
                <input
                  id="pub-zap"
                  className="form-input"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
                  placeholder="(00) 00000-0000"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  enterKeyHint="done"
                />
              </div>
            </div>

            <button type="button" className="btn btn-primary pub-enviar" onClick={verEscala} disabled={identificando}>
              {identificando ? 'Verificando…' : 'Ver escala'}
            </button>

            {resposta?.situacao === 'SEM_ACESSO' && (
              <div className="pub-aviso pub-aviso-bloqueado">
                <div className="pub-aviso-titulo">Você não tem mais acesso</div>
                <div className="pub-aviso-msg">
                  Parece que você não tem mais acesso à escala desta empresa. Se acredita que foi um engano, fale com a equipe.
                </div>
                {resposta.empresaWhatsapp && (
                  <button
                    type="button"
                    onClick={abrirWhatsappEmpresa}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content', margin: '12px auto 0', padding: '10px 18px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.115zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    Falar no WhatsApp
                  </button>
                )}
              </div>
            )}

            {resposta?.situacao === 'PENDENTE' && !cadastroEnviado && (
              <div className="pub-aviso pub-aviso-pendente">
                <div className="pub-aviso-titulo">Cadastro em análise</div>
                <div className="pub-aviso-msg">
                  Seu cadastro está em análise. Assim que a equipe liberar seu acesso, você poderá se inscrever na escala.
                </div>
              </div>
            )}

            {resposta?.situacao === 'NAO_CADASTRADO' && !cadastroEnviado && (
              <div className="pub-aviso pub-aviso-novo">
                <div className="pub-aviso-titulo">Você ainda não faz parte da equipe</div>
                <div className="pub-aviso-msg">
                  Envie seu cadastro para a equipe avaliar e liberar seu acesso à escala.
                </div>
                {resposta.perguntaCnh && (
                  <div style={{ margin: '4px 0 12px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Você possui CNH?</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      {[['Sim', true], ['Não', false]].map(([lbl, val]) => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setPossuiCnh(val)}
                          style={{
                            padding: '8px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            border: '1px solid ' + (possuiCnh === val ? '#f97316' : '#e0e0e0'),
                            background: possuiCnh === val ? '#f97316' : '#fff',
                            color: possuiCnh === val ? '#fff' : '#555',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button type="button" className="btn btn-primary pub-aviso-btn" onClick={enviarCadastro} disabled={enviandoCadastro || (resposta.perguntaCnh && possuiCnh === null)}>
                  {enviandoCadastro ? 'Enviando…' : 'Enviar meu cadastro'}
                </button>
              </div>
            )}

            {cadastroEnviado && (
              <div className="pub-aviso pub-aviso-ok">
                <div className="pub-aviso-titulo">Cadastro enviado!</div>
                <div className="pub-aviso-msg">
                  A equipe vai avaliar e liberar seu acesso. Você poderá voltar aqui depois para se inscrever.
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {cabecalho}

            {nomeConfirmado && <div className="pub-saudacao">Olá, {nomeConfirmado.split(/\s+/)[0]}! 👋</div>}

            {!escalaAberta ? (
              <div className="alert alert-yellow" style={{ marginBottom: 16 }}>
                <div className="alert-msg">As inscrições para esta escala estão fechadas.</div>
              </div>
            ) : (
              <div className="pub-instrucao">Selecione os dias em que estará disponível:</div>
            )}

            {escalaAberta && semanas.length === 0 && (
              <div className="alert alert-yellow" style={{ marginBottom: 16 }}>
                <div className="alert-msg">Não há mais dias disponíveis nesta escala — os próximos dias já passaram.</div>
              </div>
            )}

            {semanas.length > 0 && (<>
            {/* Cabeçalho da grade uma vez só (some no mobile, onde vira lista). */}
            <div className="pub-grade-cabecalho" aria-hidden="true">
              {CABECALHO_GRADE.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            {semanas.map((semana) => (
              <div key={semana.num} className="pub-semana">
                <div className="pub-semana-titulo">Semana {semana.num}</div>
                <div className="pub-dias-grid">
                  {semana.dias.map((dia) => {
                    const disp = diaDisponivel(dia, escalaAberta)
                    const r = rotuloDia(dia, escalaAberta)
                    const sel = selecionados.has(dia.id)
                    return (
                      <button
                        key={dia.id}
                        type="button"
                        data-col={colunaDaSemana(dia.diaSemana)}
                        className={'pub-dia' + (sel ? ' sel' : '') + (disp ? '' : ' disabled')}
                        onClick={() => toggleDia(dia)}
                        disabled={!disp}
                        aria-pressed={sel}
                        aria-label={`${DIA_CURTO[dia.diaSemana]} ${dataCurta(dia.data)} — ${r.label}`}
                      >
                        <span className="pub-dia-quando">
                          <span className="pub-dia-nome">{DIA_CURTO[dia.diaSemana]}</span>
                          <span className="pub-dia-data">{dataCurta(dia.data)}</span>
                        </span>
                        <span className="pub-dia-estado">
                          <span className={'badge ' + r.cls}>{r.label}</span>
                          <span className="pub-dia-check" aria-hidden="true">✓</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            </>)}

            {escalaAberta && semanas.length > 0 && (
              <div className="pub-cta">
                <button type="button" className="btn btn-primary pub-enviar" onClick={enviar} disabled={enviando}>
                  {enviando
                    ? 'Enviando…'
                    : selecionados.size > 0
                      ? `Confirmar ${selecionados.size} ${selecionados.size === 1 ? 'dia' : 'dias'}`
                      : 'Confirmar inscrição'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
