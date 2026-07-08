// Formulário público de candidatura (sem login). Mobile-first, 100% dinâmico:
// renderiza só os campos/perguntas configurados pela empresa (permanente ou por vaga).
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { mascararTelefone } from '../utils/telefone'
import { DURACOES } from '../utils/recrutamento'

const Chip = ({ on, onClick, children }) => <button type="button" className={'chip' + (on ? ' chip-on' : '')} onClick={onClick}>{children}</button>
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

  if (estado === 'loading') return <div className="pub-page"><div className="pub-card"><div style={{ textAlign: 'center' }}>Carregando…</div></div></div>
  if (estado === 'erro') return <div className="pub-page"><div className="pub-card"><div className="pub-erro"><div className="pub-erro-titulo">Ops…</div><div className="pub-erro-msg">{erro}</div></div></div></div>

  const empresa = dados?.empresa || {}
  if (estado === 'enviado') return (
    <div className="pub-page"><div className="ind-amigo">
      {empresa.logo && <img className="ind-amigo-logo ind-amigo-logo-solo" src={empresa.logo} alt="" />}
      <div className="ind-amigo-card" style={{ textAlign: 'center' }}>
        <div className="pub-sucesso-icone">✓</div>
        <div className="pub-sucesso-titulo">{resultado?.jaInscrito ? 'Você já estava inscrito!' : 'Tudo certo! 🎉'}</div>
        <div className="pub-sucesso-msg">{resultado?.jaInscrito ? `Já recebemos sua candidatura${resultado?.vaga ? ` para ${resultado.vaga}` : ''}. Atualizamos seus dados.` : (dados?.vaga ? 'Recebemos sua candidatura. Se o perfil for compatível, entramos em contato pelo WhatsApp.' : 'Você está no nosso banco de talentos. Quando surgir uma vaga, a gente te chama!')}</div>
      </div>
    </div></div>
  )

  return (
    <div className="pub-page"><div className="ind-amigo">
      {empresa.logo && <img className="ind-amigo-logo ind-amigo-logo-solo" src={empresa.logo} alt={empresa.nome} />}
      <div className="ind-amigo-card ind-amigo-hero">
        {dados?.vaga && <div className="ind-amigo-eyebrow">Vaga aberta</div>}
        <div className="ind-amigo-titulo">{dados?.vaga ? dados.vaga.titulo : (f.titulo || 'Trabalhe conosco')}</div>
        <div className="ind-amigo-sub" style={{ marginTop: 10 }}>{dados?.vaga ? (dados.vaga.descricao || 'Candidate-se preenchendo abaixo.') : (f.apresentacao || 'Preenchimento rápido.')}</div>
      </div>

      <div className="ind-amigo-card">
        <div className="form-group"><label className="form-label">Nome completo *</label><input className="form-input" value={v.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Seu nome" /></div>
        <div className="form-group"><label className="form-label">WhatsApp *</label><input className="form-input" inputMode="numeric" value={mascararTelefone(v.telefone)} onChange={(e) => set({ telefone: mascararTelefone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
        {ativo('email') && <div className="form-group"><label className="form-label">E-mail {obrig('email') ? '*' : '(opcional)'}</label><input className="form-input" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></div>}
        {ativo('endereco') && <div className="form-group"><label className="form-label">Endereço {obrig('endereco') ? '*' : ''}</label><input className="form-input" value={v.endereco} onChange={(e) => set({ endereco: e.target.value })} placeholder="Ex.: Rua das Flores, 123" /></div>}
        {(ativo('cidade') || ativo('bairro')) && <div className="form-grid-2">{ativo('bairro') && <div className="form-group"><label className="form-label">Bairro {obrig('bairro') ? '*' : ''}</label><input className="form-input" value={v.bairro} onChange={(e) => set({ bairro: e.target.value })} /></div>}{ativo('cidade') && <div className="form-group"><label className="form-label">Cidade {obrig('cidade') ? '*' : ''}</label><input className="form-input" value={v.cidade} onChange={(e) => set({ cidade: e.target.value })} /></div>}</div>}
        {ativo('transporte') && <div className="form-group"><label className="form-label">Meio de transporte</label><input className="form-input" value={v.transporte} onChange={(e) => set({ transporte: e.target.value })} placeholder="Ex.: Moto, ônibus, a pé" /></div>}
        {ativo('tempoDeslocamento') && <div className="form-group"><label className="form-label">Tempo até a empresa (min)</label><input className="form-input" inputMode="numeric" value={v.tempoDeslocamento} onChange={(e) => set({ tempoDeslocamento: e.target.value.replace(/\D/g, '') })} /></div>}
        {ativo('disponivelEm') && <div className="form-group"><label className="form-label">Disponível para começar em</label><input className="form-input" type="date" value={v.disponivelEm} onChange={(e) => set({ disponivelEm: e.target.value })} /></div>}
        {ativo('funcoes') && (f.funcoes || []).length > 0 && <div className="form-group"><label className="form-label">Funções de interesse</label><div className="chip-row">{f.funcoes.map((x) => <Chip key={x} on={v.funcoes.includes(x)} onClick={() => set({ funcoes: toggle(v.funcoes, x) })}>{x}</Chip>)}</div></div>}
        {ativo('experiencias') && (f.experiencias || []).length > 0 && <div className="form-group"><label className="form-label">Experiências que você já teve</label><div className="chip-row">{f.experiencias.map((x) => <Chip key={x} on={v.experiencias.includes(x)} onClick={() => set({ experiencias: toggle(v.experiencias, x) })}>{x}</Chip>)}</div></div>}
        {ativo('historico') && (
          <div className="form-group">
            <label className="form-label">Histórico em empresas</label>
            {(v.historico || []).map((exp, i) => (
              <div className="exp-item" key={i}>
                <input className="form-input" placeholder="Nome da empresa" value={exp.empresa || ''} onChange={(e) => setExp(i, { empresa: e.target.value })} />
                <div className="form-grid-2" style={{ marginTop: 6 }}>
                  <input className="form-input" placeholder="Cargo" value={exp.cargo || ''} onChange={(e) => setExp(i, { cargo: e.target.value })} />
                  <input className="form-input" placeholder="Função / o que fazia" value={exp.funcao || ''} onChange={(e) => setExp(i, { funcao: e.target.value })} />
                </div>
                <select className="form-input" style={{ marginTop: 6 }} value={exp.duracao || ''} onChange={(e) => setExp(i, { duracao: e.target.value })}><option value="">Quanto tempo durou?</option>{DURACOES.map(([l]) => <option key={l} value={l}>{l}</option>)}</select>
                <button type="button" className="exp-rm" onClick={() => set({ historico: v.historico.filter((_, j) => j !== i) })}>× remover</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ historico: [...(v.historico || []), {}] })}>+ Adicionar empresa</button>
          </div>
        )}
        {ativo('disponibilidade') && (f.dispDias || []).length > 0 && <div className="form-group"><label className="form-label">Dias disponíveis</label><div className="chip-row">{f.dispDias.map((x) => <Chip key={x} on={v.dias.includes(x)} onClick={() => set({ dias: toggle(v.dias, x) })}>{x}</Chip>)}</div></div>}
        {ativo('disponibilidade') && (f.dispTurnos || []).length > 0 && <div className="form-group"><label className="form-label">Horários disponíveis</label><div className="chip-row">{f.dispTurnos.map((x) => <Chip key={x} on={v.turnos.includes(x)} onClick={() => set({ turnos: toggle(v.turnos, x) })}>{x}</Chip>)}</div></div>}
        {ativo('pretensao') && <div className="form-group"><label className="form-label">Pretensão salarial (R$)</label><input className="form-input" inputMode="decimal" value={v.pretensao} onChange={(e) => set({ pretensao: e.target.value.replace(/[^\d.,]/g, '') })} /></div>}
        {ativo('ultimosEmpregos') && <div className="form-group"><label className="form-label">Últimos empregos / experiências</label><textarea className="form-input" rows={2} value={v.ultimosEmpregos} onChange={(e) => set({ ultimosEmpregos: e.target.value })} /></div>}
        {ativo('sobre') && <div className="form-group"><label className="form-label">Conte brevemente sua experiência</label><textarea className="form-input" rows={3} value={v.sobre} onChange={(e) => set({ sobre: e.target.value })} /></div>}

        {/* Perguntas personalizadas */}
        {(f.perguntas || []).map((p) => (
          <div className="form-group" key={p.id}>
            <label className="form-label">{p.texto} {p.obrigatoria ? '*' : ''}</label>
            {p.tipo === 'sim_nao' && <div className="chip-row">{['Sim', 'Não'].map((o) => <Chip key={o} on={v.respostas[p.id] === o} onClick={() => setR(p.id, o)}>{o}</Chip>)}</div>}
            {p.tipo === 'unica' && <div className="chip-row">{(p.opcoes || []).map((o) => <Chip key={o} on={v.respostas[p.id] === o} onClick={() => setR(p.id, o)}>{o}</Chip>)}</div>}
            {p.tipo === 'multipla' && <div className="chip-row">{(p.opcoes || []).map((o) => <Chip key={o} on={Array.isArray(v.respostas[p.id]) && v.respostas[p.id].includes(o)} onClick={() => setR(p.id, toggle(Array.isArray(v.respostas[p.id]) ? v.respostas[p.id] : [], o))}>{o}</Chip>)}</div>}
            {p.tipo === 'numero' && <input className="form-input" inputMode="numeric" value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value.replace(/\D/g, ''))} />}
            {p.tipo === 'escala' && <div className="chip-row">{[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={Number(v.respostas[p.id]) === n} onClick={() => setR(p.id, n)}>{n}</Chip>)}</div>}
            {p.tipo === 'texto' && <input className="form-input" value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value)} />}
            {p.tipo === 'texto_longo' && <textarea className="form-input" rows={3} value={v.respostas[p.id] || ''} onChange={(e) => setR(p.id, e.target.value)} />}
          </div>
        ))}

        <div className="talentos-lgpd">
          <label className="ent-check"><input type="checkbox" checked={v.consentimentoLGPD} onChange={(e) => set({ consentimentoLGPD: e.target.checked })} /> <span>Autorizo o uso dos meus dados neste processo seletivo. *</span></label>
          <label className="ent-check" style={{ marginTop: 8 }}><input type="checkbox" checked={v.consentimentoBanco} onChange={(e) => set({ consentimentoBanco: e.target.checked })} /> <span>Quero ficar no banco de talentos para futuras oportunidades.</span></label>
        </div>
        {erroForm && <div className="pub-erro-msg" style={{ color: '#dc2626', margin: '4px 0' }}>{erroForm}</div>}
        <button type="button" className="ind-cta ind-cta-orange" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : '🚀  Enviar'}</button>
      </div>
    </div></div>
  )
}
