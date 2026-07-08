// Construtor de formulário (permanente e por vaga). Edita um objeto `formulario`
// { titulo, apresentacao, campos, funcoes[], experiencias[], dispDias[], dispTurnos[], perguntas[] }.
import { CAMPOS_META, PERGUNTA_TIPOS, PERGUNTA_PAPEIS } from '../utils/recrutamento'

function ListaEditavel({ label, itens, onChange, placeholder }) {
  const add = (v) => { const s = v.trim(); if (s && !itens.includes(s)) onChange([...itens, s]) }
  return (
    <div className="fb-lista">
      <label className="form-label">{label}</label>
      <div className="chip-row" style={{ margin: '6px 0' }}>
        {itens.map((x) => <span key={x} className="fb-tag">{x}<button type="button" className="fb-tag-x" onClick={() => onChange(itens.filter((y) => y !== x))}>×</button></span>)}
        {itens.length === 0 && <span className="fb-hint">Nenhuma opção — você define conforme sua operação.</span>}
      </div>
      <input className="form-input" placeholder={placeholder || 'Digite e aperte Enter'} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(e.target.value); e.target.value = '' } }} />
    </div>
  )
}

export default function FormBuilder({ value, onChange }) {
  const f = value
  const set = (patch) => onChange({ ...f, ...patch })
  const setCampo = (k, patch) => set({ campos: { ...f.campos, [k]: { ...(f.campos?.[k] || {}), ...patch } } })
  const setPergunta = (i, patch) => set({ perguntas: f.perguntas.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const addPergunta = () => set({ perguntas: [...(f.perguntas || []), { id: `p_${Date.now()}`, texto: '', tipo: 'sim_nao', opcoes: [], obrigatoria: false, papel: 'eliminatoria', respostaIdeal: 'Sim', peso: 1 }] })
  const rmPergunta = (i) => set({ perguntas: f.perguntas.filter((_, j) => j !== i) })
  const Toggle = ({ on, onChange: oc }) => <label className="tgl"><input type="checkbox" checked={!!on} onChange={(e) => oc(e.target.checked)} /><span className="tgl-track" /></label>

  return (
    <div className="fb">
      <div className="fb-sec">
        <div className="fb-sec-head"><div className="fb-sec-ico">📝</div><div><div className="fb-sec-t">Cabeçalho</div><div className="fb-sec-s">O que a pessoa vê no topo do formulário.</div></div></div>
        <div className="form-group"><label className="form-label">Título</label><input className="form-input" value={f.titulo || ''} onChange={(e) => set({ titulo: e.target.value })} /></div>
        <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Texto de apresentação</label><textarea className="form-input" rows={2} value={f.apresentacao || ''} onChange={(e) => set({ apresentacao: e.target.value })} /></div>
      </div>

      <div className="fb-sec">
        <div className="fb-sec-head"><div className="fb-sec-ico">🧩</div><div><div className="fb-sec-t">Campos do formulário</div><div className="fb-sec-s">Ligue os campos que quer pedir e marque os obrigatórios.</div></div></div>
        <div className="fb-fixo"><span>Nome completo · Telefone</span><span className="badge badge-gray">Sempre pedidos</span></div>
        <div className="fb-campos">
          {CAMPOS_META.map(([k, l]) => { const c = f.campos?.[k] || {}; return (
            <div className={'fb-campo' + (c.ativo ? ' fb-campo-on' : '')} key={k}>
              <span className="fb-campo-nome">{l}</span>
              <div className="fb-campo-dir">
                {c.ativo && <button type="button" className={'fb-obrig-chip' + (c.obrigatorio ? ' on' : '')} onClick={() => setCampo(k, { obrigatorio: !c.obrigatorio })}>{c.obrigatorio ? '✓ Obrigatório' : 'Obrigatório'}</button>}
                <Toggle on={c.ativo} onChange={(vv) => setCampo(k, { ativo: vv })} />
              </div>
            </div>
          ) })}
        </div>
        {(f.campos?.funcoes?.ativo || f.campos?.experiencias?.ativo || f.campos?.disponibilidade?.ativo) && (
          <div className="fb-opcoes-box">
            {f.campos?.funcoes?.ativo && <ListaEditavel label="Opções de funções de interesse" itens={f.funcoes || []} onChange={(v) => set({ funcoes: v })} placeholder="Ex.: Atendente" />}
            {f.campos?.experiencias?.ativo && <ListaEditavel label="Opções de experiências práticas" itens={f.experiencias || []} onChange={(v) => set({ experiencias: v })} placeholder="Ex.: Chapa" />}
            {f.campos?.disponibilidade?.ativo && <><ListaEditavel label="Dias que a empresa oferece" itens={f.dispDias || []} onChange={(v) => set({ dispDias: v })} placeholder="Ex.: Ter, Qua…" /><ListaEditavel label="Turnos/horários que a empresa oferece" itens={f.dispTurnos || []} onChange={(v) => set({ dispTurnos: v })} placeholder="Ex.: 17h às 00h" /></>}
          </div>
        )}
      </div>

      <div className="fb-sec">
        <div className="fb-sec-head"><div className="fb-sec-ico">❓</div><div><div className="fb-sec-t">Perguntas personalizadas</div><div className="fb-sec-s">O candidato responde só o que você criar aqui.</div></div></div>
        <div className="ind-note" style={{ marginBottom: 12 }}><strong>Eliminatória</strong> reprova quem não atende · <strong>Prioridade</strong> influencia a classificação · <strong>Informativa</strong> não afeta · <strong>Texto</strong> nunca é avaliado.</div>
        {(f.perguntas || []).map((p, i) => (
          <div className="fb-pergunta" key={p.id}>
            <div className="fb-pergunta-top">
              <span className="fb-pergunta-num">{i + 1}</span>
              <input className="form-input" value={p.texto} onChange={(e) => setPergunta(i, { texto: e.target.value })} placeholder="Ex.: Você tem disponibilidade para fechamento (após 00h)?" />
              <button type="button" className="fb-tag-x fb-rm" onClick={() => rmPergunta(i)}>×</button>
            </div>
            <div className="fb-pergunta-cfg">
              <select className="form-input" value={p.tipo} onChange={(e) => { const tipo = e.target.value; setPergunta(i, { tipo, respostaIdeal: tipo === 'sim_nao' ? 'Sim' : (tipo === 'numero' || tipo === 'escala') ? '' : null, opcoes: tipo === 'unica' || tipo === 'multipla' ? (p.opcoes?.length ? p.opcoes : ['']) : [] }) }}>{PERGUNTA_TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select className="form-input" value={p.papel} onChange={(e) => setPergunta(i, { papel: e.target.value })}>{PERGUNTA_PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button type="button" className={'fb-obrig-chip' + (p.obrigatoria ? ' on' : '')} onClick={() => setPergunta(i, { obrigatoria: !p.obrigatoria })}>{p.obrigatoria ? '✓ Obrigatória' : 'Obrigatória'}</button>
              {p.papel === 'prioridade' && <label className="fb-peso">Peso <input className="form-input" style={{ width: 46 }} inputMode="numeric" value={p.peso} onChange={(e) => setPergunta(i, { peso: e.target.value.replace(/\D/g, '') || 1 })} /></label>}
            </div>
            {(p.tipo === 'unica' || p.tipo === 'multipla') && (
              <div className="fb-opcoes">
                {(p.opcoes || []).map((o, oi) => (
                  <div className="fb-opcao" key={oi}>
                    {p.papel !== 'informativa' && <input type="radio" checked={String(p.respostaIdeal) === o && !!o} onChange={() => setPergunta(i, { respostaIdeal: o })} title="Resposta ideal" />}
                    <input className="form-input" value={o} onChange={(e) => setPergunta(i, { opcoes: p.opcoes.map((x, xi) => (xi === oi ? e.target.value : x)) })} placeholder={`Opção ${oi + 1}`} />
                    <button type="button" className="fb-tag-x" onClick={() => setPergunta(i, { opcoes: p.opcoes.filter((_, xi) => xi !== oi) })}>×</button>
                  </div>
                ))}
                <button type="button" className="ind-act" onClick={() => setPergunta(i, { opcoes: [...(p.opcoes || []), ''] })}>+ opção</button>
                {p.papel !== 'informativa' && <span className="fb-hint">Marque a opção correta (resposta ideal).</span>}
              </div>
            )}
            {p.papel !== 'informativa' && p.tipo === 'sim_nao' && <div className="fb-ideal">Resposta ideal: <select className="form-input" style={{ width: 100 }} value={p.respostaIdeal || 'Sim'} onChange={(e) => setPergunta(i, { respostaIdeal: e.target.value })}><option>Sim</option><option>Não</option></select></div>}
            {p.papel !== 'informativa' && (p.tipo === 'numero' || p.tipo === 'escala') && <div className="fb-ideal">Valor mínimo aceito: <input className="form-input" style={{ width: 80 }} inputMode="numeric" value={p.respostaIdeal || ''} onChange={(e) => setPergunta(i, { respostaIdeal: e.target.value.replace(/\D/g, '') })} /></div>}
            {(p.tipo === 'texto' || p.tipo === 'texto_longo') && <span className="fb-hint" style={{ display: 'block', marginTop: 8 }}>Resposta escrita — não é classificada automaticamente. Ótima para perguntas abertas (ex.: “Como você é no trabalho?”).</span>}
          </div>
        ))}
        <button type="button" className="fb-add" onClick={addPergunta}>+ Adicionar pergunta</button>
      </div>
    </div>
  )
}
