// Formulário público de candidatura (sem login). Mobile-first, 100% dinâmico:
// renderiza só os campos/perguntas configurados pela empresa (permanente ou por vaga).
// Design portado do H360 (leva de 28/07/2026, classes tal-*). O envio (endpoint/payload)
// continua o mesmo que o PDV já fazia — sem o campo "vinculosAceitos" (o backend do PDV
// ainda não tem essa coluna em Candidato; ver schema.prisma).
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { mascararTelefone } from '../utils/telefone'
import { DURACOES } from '../utils/recrutamento'

// Ícones (SVG, nunca emoji como ícone estrutural)
const IcUser = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const IcPin = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
const IcBag = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect x="2" y="7" width="20" height="14" rx="2" /></svg>
const IcChat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>

const TChip = ({ on, onClick, children }) => (
  <button type="button" className={'tal-chip' + (on ? ' on' : '')} onClick={onClick}>{children}</button>
)
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export default function TalentosPublico() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const vagaId = params.get('vaga')
  const [estado, setEstado] = useState('loading') // loading | erro | form | enviado
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // { empresa, formulario, vaga? }
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [resultado, setResultado] = useState(null)
  const [v, setV] = useState({ nome: '', telefone: '', email: '', endereco: '', cidade: '', bairro: '', transporte: '', tempoDeslocamento: '', disponivelEm: '', pretensao: '', sobre: '', ultimosEmpregos: '', funcoes: [], experiencias: [], historico: [], dias: [], turnos: [], respostas: {}, consentimentoLGPD: false, consentimentoBanco: true })
  const set = (patch) => setV((p) => ({ ...p, ...patch }))
  const setR = (id, val) => setV((p) => ({ ...p, respostas: { ...p.respostas, [id]: val } }))
  const setExp = (i, patch) => setV((p) => ({ ...p, historico: p.historico.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  const url = vagaId ? `/public/talentos/${slug}/vagas/${vagaId}` : `/public/talentos/${slug}`
  useEffect(() => {
    api.get(url).then((r) => { setDados(r.data); setEstado('form') }).catch((e) => { setErro(e?.response?.data?.error ?? 'Formulário indisponível.'); setEstado('erro') })
  }, [url])

  const f = dados?.formulario || {}
  const campo = (k) => f.campos?.[k] || {}
  const ativo = (k) => !!campo(k).ativo
  const obrig = (k) => !!campo(k).obrigatorio
  const req = (k) => (obrig(k) ? <span className="tal-req">*</span> : null)
  const algum = (...ks) => ks.some((k) => ativo(k))

  async function enviar() {
    setErroForm('')
    if (!v.nome.trim()) return setErroForm('Informe seu nome.')
    if (!v.telefone.replace(/\D/g, '')) return setErroForm('Informe seu WhatsApp.')
    for (const [k, l] of [['email', 'E-mail'], ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['bairro', 'Bairro']]) if (ativo(k) && obrig(k) && !v[k].trim()) return setErroForm(`Preencha: ${l}.`)
    for (const p of (f.perguntas || [])) if (p.obrigatoria) { const a = v.respostas[p.id]; if (a == null || a === '' || (Array.isArray(a) && !a.length)) return setErroForm(`Responda: ${p.texto}`) }
    if (!v.consentimentoLGPD) return setErroForm('É necessário aceitar o uso dos dados para participar.')
    setEnviando(true)
    try {
      const disponibilidade = { dias: v.dias, turnos: v.turnos, meioDeslocamento: v.transporte || undefined, tempoDeslocamentoMin: v.tempoDeslocamento ? Number(v.tempoDeslocamento) : undefined }
      const extras = { sobre: v.sobre || undefined, ultimosEmpregos: v.ultimosEmpregos || undefined }
      const payload = {
        nome: v.nome, telefone: v.telefone, email: v.email || undefined, endereco: v.endereco || undefined, cidade: v.cidade || undefined, bairro: v.bairro || undefined,
        funcoesInteresse: v.funcoes, experienciasRapidas: v.experiencias, disponibilidade,
        pretensaoSalarial: v.pretensao ? Number(String(v.pretensao).replace(',', '.')) : undefined,
        disponivelEm: v.disponivelEm || undefined,
        experiencias: (v.historico || []).filter((e) => (e.empresa || '').trim()),
        consentimentoLGPD: true, consentimentoBanco: v.consentimentoBanco,
        respostas: { ...v.respostas, ...extras }, respostasFormulario: { ...v.respostas, ...extras },
      }
      const r = await api.post(url, payload)
      setResultado(r.data); setEstado('enviado'); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setErroForm(e?.response?.data?.error ?? 'Não foi possível enviar. Tente novamente.') }
    finally { setEnviando(false) }
  }

  if (estado === 'loading') return <div className="tal-page"><div className="tal-wrap"><div className="tal-block" style={{ textAlign: 'center', color: '#8a7a6c' }}>Carregando…</div></div></div>
  if (estado === 'erro') return <div className="tal-page"><div className="tal-wrap"><div className="tal-block" style={{ textAlign: 'center' }}><div className="tal-erro-t">Ops…</div><div className="tal-erro-s">{erro}</div></div></div></div>

  const empresa = dados?.empresa || {}
  if (estado === 'enviado') return (
    <div className="tal-page"><div className="tal-wrap">
      {empresa.logo && <img className="tal-logo-img" src={empresa.logo} alt="" />}
      <div className="tal-block tal-sucesso">
        <div className="tal-sucesso-ic">✓</div>
        <div className="tal-sucesso-t">{resultado?.jaInscrito ? 'Você já estava com a gente!' : 'Tudo certo! 🎉'}</div>
        <div className="tal-sucesso-s">{resultado?.jaInscrito ? `Já recebemos sua candidatura${resultado?.vaga ? ` para ${resultado.vaga}` : ''}. Atualizamos seus dados.` : (dados?.vaga ? 'Recebemos sua candidatura. Se o perfil combinar, a gente entra em contato.' : 'Você entrou no nosso banco de talentos. Quando surgir uma vaga com a sua cara, a gente te chama!')}</div>
      </div>
      <div className="tal-foot">Valeu por querer fazer parte do nosso time! 🧡</div>
    </div></div>
  )

  const temExp = algum('funcoes', 'experiencias', 'historico', 'disponibilidade', 'pretensao', 'ultimosEmpregos', 'sobre')

  return (
    <div className="tal-page"><div className="tal-wrap">
      {empresa.logo
        ? <img className="tal-logo-img" src={empresa.logo} alt={empresa.nome} />
        : <div className="tal-logo"><span>{(empresa.nome || 'Vem pro time').slice(0, 14)}</span></div>}

      <header className="tal-hero">
        {(f.selo || '').trim() ? <span className="tal-eyebrow">{dados?.vaga ? <span className="tal-pulse" /> : <span className="tal-doto" />}{(f.selo || '').trim()}</span> : null}
        <h1 className="tal-hero-t">{dados?.vaga ? dados.vaga.titulo : (f.titulo || 'Trabalhe conosco')}</h1>
        <p className="tal-hero-s">{dados?.vaga ? (dados.vaga.descricao || 'Candidate-se preenchendo abaixo.') : (f.apresentacao || 'Deixe seus dados no nosso banco de talentos. Quando surgir uma vaga, a gente te chama!')}</p>
        <div className="tal-strip">
          <span className="tal-tag">⚡ Leva 2 minutos</span>
          <span className="tal-tag">🔒 Seus dados protegidos</span>
        </div>
      </header>

      {/* Bloco 1 — Quem é você */}
      <section className="tal-block">
        <div className="tal-block-h"><span className="tal-block-ic"><IcUser /></span><div><h2>Quem é você</h2><p>O básico pra gente te conhecer</p></div></div>
        <div className="tal-field"><label className="tal-lbl">Nome completo <span className="tal-req">*</span></label><input className="tal-inp" value={v.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Seu nome" /></div>
        <div className="tal-field"><label className="tal-lbl">WhatsApp <span className="tal-req">*</span></label><input className="tal-inp" inputMode="numeric" value={mascararTelefone(v.telefone)} onChange={(e) => set({ telefone: mascararTelefone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
        {ativo('email') && <div className="tal-field"><label className="tal-lbl">E-mail {obrig('email') ? <span className="tal-req">*</span> : <span className="tal-opt">(opcional)</span>}</label><input className="tal-inp" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} placeholder="voce@email.com" /></div>}
      </section>

      {/* Bloco 2 — Onde você está */}
      {algum('endereco', 'cidade', 'bairro', 'transporte', 'tempoDeslocamento', 'disponivelEm') && (
        <section className="tal-block">
          <div className="tal-block-h"><span className="tal-block-ic"><IcPin /></span><div><h2>Onde você está</h2><p>Pra saber se fica perto da loja</p></div></div>
          {ativo('endereco') && <div className="tal-field"><label className="tal-lbl">Endereço {req('endereco')}</label><input className="tal-inp" value={v.endereco} onChange={(e) => set({ endereco: e.target.value })} placeholder="Ex.: Rua das Flores, 123" /></div>}
          {(ativo('cidade') || ativo('bairro')) && <div className="tal-field"><div className="tal-grid2">{ativo('bairro') && <div><label className="tal-lbl">Bairro {req('bairro')}</label><input className="tal-inp" value={v.bairro} onChange={(e) => set({ bairro: e.target.value })} placeholder="Bairro" /></div>}{ativo('cidade') && <div><label className="tal-lbl">Cidade {req('cidade')}</label><input className="tal-inp" value={v.cidade} onChange={(e) => set({ cidade: e.target.value })} placeholder="Cidade" /></div>}</div></div>}
          {ativo('transporte') && <div className="tal-field"><label className="tal-lbl">Meio de transporte</label><input className="tal-inp" value={v.transporte} onChange={(e) => set({ transporte: e.target.value })} placeholder="Ex.: Moto, ônibus, a pé" /></div>}
          {ativo('tempoDeslocamento') && <div className="tal-field"><label className="tal-lbl">Tempo até a empresa (min)</label><input className="tal-inp" inputMode="numeric" value={v.tempoDeslocamento} onChange={(e) => set({ tempoDeslocamento: e.target.value.replace(/\D/g, '') })} placeholder="Ex.: 15" /></div>}
          {ativo('disponivelEm') && <div className="tal-field"><label className="tal-lbl">Disponível para começar em</label><input className="tal-inp" type="date" value={v.disponivelEm} onChange={(e) => set({ disponivelEm: e.target.value })} /></div>}
        </section>
      )}

      {/* Bloco 3 — Sua experiência */}
      {temExp && (
        <section className="tal-block">
          <div className="tal-block-h"><span className="tal-block-ic"><IcBag /></span><div><h2>Sua experiência</h2><p>Marque o que combina com você</p></div></div>
          {ativo('funcoes') && (f.funcoes || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Funções de interesse</label><div className="tal-chips">{f.funcoes.map((x) => <TChip key={x} on={v.funcoes.includes(x)} onClick={() => set({ funcoes: toggle(v.funcoes, x) })}>{x}</TChip>)}</div></div>}
          {ativo('experiencias') && (f.experiencias || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Experiências que você já teve</label><div className="tal-chips">{f.experiencias.map((x) => <TChip key={x} on={v.experiencias.includes(x)} onClick={() => set({ experiencias: toggle(v.experiencias, x) })}>{x}</TChip>)}</div></div>}
          {ativo('disponibilidade') && (f.dispDias || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Dias disponíveis</label><div className="tal-chips">{f.dispDias.map((x) => <TChip key={x} on={v.dias.includes(x)} onClick={() => set({ dias: toggle(v.dias, x) })}>{x}</TChip>)}</div></div>}
          {ativo('disponibilidade') && (f.dispTurnos || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Horários disponíveis</label><div className="tal-chips">{f.dispTurnos.map((x) => <TChip key={x} on={v.turnos.includes(x)} onClick={() => set({ turnos: toggle(v.turnos, x) })}>{x}</TChip>)}</div></div>}
          {ativo('historico') && (
            <div className="tal-field">
              <label className="tal-lbl">Já trabalhou em algum lugar? <span className="tal-opt">(opcional)</span></label>
              {(v.historico || []).map((exp, i) => (
                <div className="tal-exp" key={i}>
                  <input className="tal-inp" placeholder="Nome da empresa" value={exp.empresa || ''} onChange={(e) => setExp(i, { empresa: e.target.value })} />
                  <div className="tal-grid2" style={{ marginTop: 8 }}>
                    <input className="tal-inp" placeholder="Cargo" value={exp.cargo || ''} onChange={(e) => setExp(i, { cargo: e.target.value })} />
                    <input className="tal-inp" placeholder="O que fazia" value={exp.funcao || ''} onChange={(e) => setExp(i, { funcao: e.target.value })} />
                  </div>
                  <select className="tal-inp" style={{ marginTop: 8 }} value={exp.duracao || ''} onChange={(e) => setExp(i, { duracao: e.target.value })}><option value="">Quanto tempo durou?</option>{DURACOES.map(([l]) => <option key={l} value={l}>{l}</option>)}</select>
                  <button type="button" className="tal-exp-rm" onClick={() => set({ historico: v.historico.filter((_, j) => j !== i) })}>× remover</button>
                </div>
              ))}
              <button type="button" className="tal-add" onClick={() => set({ historico: [...(v.historico || []), {}] })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Adicionar empresa
              </button>
            </div>
          )}
          {ativo('pretensao') && <div className="tal-field"><label className="tal-lbl">Pretensão salarial (R$)</label><input className="tal-inp" inputMode="decimal" value={v.pretensao} onChange={(e) => set({ pretensao: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="Ex.: 1500" /></div>}
          {ativo('ultimosEmpregos') && <div className="tal-field"><label className="tal-lbl">Últimos empregos / experiências</label><textarea className="tal-inp" rows={2} value={v.ultimosEmpregos} onChange={(e) => set({ ultimosEmpregos: e.target.value })} placeholder="Onde já trabalhou" /></div>}
          {ativo('sobre') && <div className="tal-field"><label className="tal-lbl">Conta pra gente: quais são suas qualidades?</label><textarea className="tal-inp" rows={3} value={v.sobre} onChange={(e) => set({ sobre: e.target.value })} placeholder="Ex.: sou comunicativo, rápido e gosto de trabalhar em equipe…" /></div>}
        </section>
      )}

      {/* Bloco 4 — Perguntas personalizadas */}
      {(f.perguntas || []).length > 0 && (
        <section className="tal-block">
          <div className="tal-block-h"><span className="tal-block-ic"><IcChat /></span><div><h2>Só mais uma coisa</h2><p>Perguntas rápidas da loja</p></div></div>
          {(f.perguntas || []).map((p) => (
            <div className="tal-field" key={p.id}>
              <label className="tal-lbl">{p.texto} {p.obrigatoria ? <span className="tal-req">*</span> : null}</label>
              {p.tipo === 'sim_nao' && <div className="tal-chips">{['Sim', 'Não'].map((o) => <TChip key={o} on={v.respostas[p.id] === o} onClick={() => setR(p.id, o)}>{o}</TChip>)}</div>}
              {p.tipo === 'unica' && <div className="tal-chips">{(p.opcoes || []).map((o) => <TChip key={o} on={v.respostas[p.id] === o} onClick={() => setR(p.id, o)}>{o}</TChip>)}</div>}
              {p.tipo === 'multipla' && <div className="tal-chips">{(p.opcoes || []).map((o) => <TChip key={o} on={Array.isArray(v.respostas[p.id]) && v.respostas[p.id].includes(o)} onClick={() => setR(p.id, toggle(Array.isArray(v.respostas[p.id]) ? v.respostas[p.id] : [], o))}>{o}</TChip>)}</div>}
              {p.tipo === 'numero' && <input className="tal-inp" inputMode="numeric" value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value.replace(/\D/g, ''))} />}
              {p.tipo === 'escala' && <div className="tal-chips">{[1, 2, 3, 4, 5].map((n) => <TChip key={n} on={Number(v.respostas[p.id]) === n} onClick={() => setR(p.id, n)}>{n}</TChip>)}</div>}
              {p.tipo === 'texto' && <input className="tal-inp" value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value)} />}
              {p.tipo === 'texto_longo' && <textarea className="tal-inp" rows={3} value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value)} />}
            </div>
          ))}
        </section>
      )}

      {/* LGPD */}
      <div className="tal-lgpd">
        <label className={'tal-check' + (v.consentimentoLGPD ? ' on' : '')}><input type="checkbox" className="tal-check-in" checked={v.consentimentoLGPD} onChange={(e) => set({ consentimentoLGPD: e.target.checked })} /><span className="tal-box" /><span>Autorizo o uso dos meus dados neste processo seletivo. <span className="tal-req">*</span></span></label>
        <label className={'tal-check' + (v.consentimentoBanco ? ' on' : '')}><input type="checkbox" className="tal-check-in" checked={v.consentimentoBanco} onChange={(e) => set({ consentimentoBanco: e.target.checked })} /><span className="tal-box" /><span>Quero ficar no banco de talentos para futuras oportunidades.</span></label>
      </div>

      {erroForm && <div className="tal-erro-inline">{erroForm}</div>}

      <button type="button" className="tal-cta" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : <><IcSend /> Enviar minha candidatura</>}</button>

      <div className="tal-foot">Valeu por querer fazer parte do nosso time! 🧡</div>
    </div></div>
  )
}
