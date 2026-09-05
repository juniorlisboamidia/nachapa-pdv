// Prévia ao vivo (read-only) do formulário público — espelha a NOVA cara (classes tal-*).
// Mantenha em sincronia com pages/TalentosPublico.jsx (mesma estrutura de blocos/campos).
// Portado do H360 (leva de 28/07/2026). Sem o bloco "vinculosAceitos" — o backend do PDV
// ainda não tem essa coluna (ver Candidato no schema.prisma).

const IcUser = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const IcPin = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
const IcBag = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect x="2" y="7" width="20" height="14" rx="2" /></svg>
const IcChat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>

const Ph = ({ children }) => <div className="tal-inp tal-ph">{children}</div>
const Chip = ({ children }) => <span className="tal-chip">{children}</span>

export default function FormPreview({ value, linkPermanente }) {
  const f = value || {}
  const campos = f.campos || {}
  const on = (k) => !!campos[k]?.ativo
  const req = (k) => (campos[k]?.obrigatorio ? <span className="tal-req">*</span> : null)
  const algum = (...ks) => ks.some((k) => on(k))
  const temExp = algum('funcoes', 'experiencias', 'historico', 'disponibilidade', 'pretensao', 'ultimosEmpregos', 'sobre')

  return (
    <div className="fp-shell">
      <div className="fp-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18.5h2" /></svg> Pré-visualização · como o candidato vê no celular</div>
      <div className="fp-device">
        <div className="fp-bar"><span className="fp-dot" /><span className="fp-dot" />{linkPermanente || 'prévia'}</div>
        <div className="tal-preview">
        <div className="tal-logo"><span>SUA<br />LOGO</span></div>

        <div className="tal-hero">
          {(f.selo || '').trim() ? <span className="tal-eyebrow"><span className="tal-doto" />{(f.selo || '').trim()}</span> : null}
          <h1 className="tal-hero-t">{f.titulo || 'Trabalhe conosco'}</h1>
          <p className="tal-hero-s">{f.apresentacao || 'Deixe seus dados no nosso banco de talentos. Quando surgir uma vaga, a gente te chama!'}</p>
        </div>

        {/* Quem é você */}
        <div className="tal-block">
          <div className="tal-block-h"><span className="tal-block-ic"><IcUser /></span><div><h2>Quem é você</h2><p>O básico pra gente te conhecer</p></div></div>
          <div className="tal-field"><label className="tal-lbl">Nome completo <span className="tal-req">*</span></label><Ph>Seu nome</Ph></div>
          <div className="tal-field"><label className="tal-lbl">WhatsApp <span className="tal-req">*</span></label><Ph>(00) 00000-0000</Ph></div>
          {on('email') && <div className="tal-field"><label className="tal-lbl">E-mail {req('email')}</label><Ph>voce@email.com</Ph></div>}
        </div>

        {/* Onde você está */}
        {algum('endereco', 'cidade', 'bairro', 'transporte', 'tempoDeslocamento', 'disponivelEm') && (
          <div className="tal-block">
            <div className="tal-block-h"><span className="tal-block-ic"><IcPin /></span><div><h2>Onde você está</h2><p>Pra saber se fica perto da loja</p></div></div>
            {on('endereco') && <div className="tal-field"><label className="tal-lbl">Endereço {req('endereco')}</label><Ph>Rua, número</Ph></div>}
            {(on('cidade') || on('bairro')) && <div className="tal-field"><div className="tal-grid2">{on('bairro') && <div><label className="tal-lbl">Bairro {req('bairro')}</label><Ph>Bairro</Ph></div>}{on('cidade') && <div><label className="tal-lbl">Cidade {req('cidade')}</label><Ph>Cidade</Ph></div>}</div></div>}
            {on('transporte') && <div className="tal-field"><label className="tal-lbl">Meio de transporte</label><Ph>Ex.: Moto, ônibus, a pé</Ph></div>}
            {on('tempoDeslocamento') && <div className="tal-field"><label className="tal-lbl">Tempo até a empresa (min)</label><Ph>Ex.: 15</Ph></div>}
            {on('disponivelEm') && <div className="tal-field"><label className="tal-lbl">Disponível para começar em</label><Ph>dd/mm/aaaa</Ph></div>}
          </div>
        )}

        {/* Sua experiência */}
        {temExp && (
          <div className="tal-block">
            <div className="tal-block-h"><span className="tal-block-ic"><IcBag /></span><div><h2>Sua experiência</h2><p>Marque o que combina com você</p></div></div>
            {on('funcoes') && (f.funcoes || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Funções de interesse</label><div className="tal-chips">{f.funcoes.map((x) => <Chip key={x}>{x}</Chip>)}</div></div>}
            {on('experiencias') && (f.experiencias || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Experiências que você já teve</label><div className="tal-chips">{f.experiencias.map((x) => <Chip key={x}>{x}</Chip>)}</div></div>}
            {on('disponibilidade') && (f.dispDias || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Dias disponíveis</label><div className="tal-chips">{f.dispDias.map((x) => <Chip key={x}>{x}</Chip>)}</div></div>}
            {on('disponibilidade') && (f.dispTurnos || []).length > 0 && <div className="tal-field"><label className="tal-lbl">Horários disponíveis</label><div className="tal-chips">{f.dispTurnos.map((x) => <Chip key={x}>{x}</Chip>)}</div></div>}
            {on('historico') && <div className="tal-field"><label className="tal-lbl">Já trabalhou em algum lugar? <span className="tal-opt">(opcional)</span></label><div className="tal-add">+ Adicionar empresa</div></div>}
            {on('pretensao') && <div className="tal-field"><label className="tal-lbl">Pretensão salarial (R$)</label><Ph>Ex.: 1500</Ph></div>}
            {on('ultimosEmpregos') && <div className="tal-field"><label className="tal-lbl">Últimos empregos / experiências</label><Ph>Onde já trabalhou</Ph></div>}
            {on('sobre') && <div className="tal-field"><label className="tal-lbl">Conta pra gente: quais são suas qualidades?</label><Ph>Sua experiência…</Ph></div>}
          </div>
        )}

        {/* Perguntas personalizadas */}
        {(f.perguntas || []).length > 0 && (
          <div className="tal-block">
            <div className="tal-block-h"><span className="tal-block-ic"><IcChat /></span><div><h2>Só mais uma coisa</h2><p>Perguntas rápidas da loja</p></div></div>
            {(f.perguntas || []).map((p) => (
              <div className="tal-field" key={p.id}>
                <label className="tal-lbl">{p.texto} {p.obrigatoria ? <span className="tal-req">*</span> : null}</label>
                {p.tipo === 'sim_nao' && <div className="tal-chips"><Chip>Sim</Chip><Chip>Não</Chip></div>}
                {(p.tipo === 'unica' || p.tipo === 'multipla') && <div className="tal-chips">{(p.opcoes || []).map((o, i) => <Chip key={i}>{o || `Opção ${i + 1}`}</Chip>)}</div>}
                {p.tipo === 'escala' && <div className="tal-chips">{[1, 2, 3, 4, 5].map((n) => <Chip key={n}>{n}</Chip>)}</div>}
                {(p.tipo === 'numero' || p.tipo === 'texto' || p.tipo === 'texto_longo') && <Ph>Resposta…</Ph>}
              </div>
            ))}
          </div>
        )}

        {/* LGPD */}
        <div className="tal-lgpd">
          <div className="tal-check"><span className="tal-pbox">✓</span><span>Autorizo o uso dos meus dados neste processo seletivo. <span className="tal-req">*</span></span></div>
          <div className="tal-check" style={{ marginTop: 10 }}><span className="tal-pbox">✓</span><span>Quero ficar no banco de talentos para futuras oportunidades.</span></div>
        </div>

        <div className="tal-cta tal-cta-preview">Enviar minha candidatura</div>
        </div>
      </div>
    </div>
  )
}
