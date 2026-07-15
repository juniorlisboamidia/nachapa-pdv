// Página PÚBLICA da Bonificação (Destaque do Mês) — a equipe acompanha o ranking do
// mês. Sem login. Layout rico (herói, como participar, entenda, exemplo, ranking).
// CSS escopado em .bp-root (prefixo bp-) e tema pelo SO do visitante.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
const MEDAL = { 1: 'g1', 2: 'g2', 3: 'g3' }

const CSS = `
.bp-root{--bg:#f5efdf;--surface:#FFFFFF;--surface-2:#faf4e6;--ink:#0e1319;--ink-soft:#4b4a41;--muted:#8a8472;--line:#e7dcc2;--brand:#eab802;--brand-deep:#8a6d00;--brand-tint:#fdf6da;--money:#0F8A54;--gold:#eab802;--silver:#94A0AC;--bronze:#BE7043;--sh-sm:0 1px 2px rgba(46,32,18,.06);--sh-md:0 2px 4px rgba(46,32,18,.05),0 14px 30px rgba(46,32,18,.06);--rd:16px;
  min-height:100vh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.45}
@media (prefers-color-scheme:dark){.bp-root{--bg:#0e1319;--surface:#161d27;--surface-2:#12161d;--ink:#e8eaf1;--ink-soft:#c7ccd6;--muted:#8a91a3;--line:#2a3047;--brand:#f0c94a;--brand-deep:#eab802;--brand-tint:#2b2510;--money:#3FBE82;--sh-sm:0 1px 2px rgba(0,0,0,.4);--sh-md:0 2px 4px rgba(0,0,0,.35),0 16px 34px rgba(0,0,0,.45)}}
.bp-root *{box-sizing:border-box}
.bp-wrap{max-width:480px;margin:0 auto;padding:16px 16px 40px;display:flex;flex-direction:column;gap:24px}
.bp-tnum{font-variant-numeric:tabular-nums}
.bp-sec-title{font-size:12.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.bp-b{font-weight:700;color:var(--ink)}
.bp-hero{background:radial-gradient(130% 130% at 88% -10%,rgba(234,184,2,.18),transparent 56%),linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:var(--sh-md);text-align:center}
/* Marca em destaque no topo do cartão */
.bp-marca{display:flex;justify-content:center;margin-bottom:16px}
.bp-marca-img{max-width:190px;max-height:96px;width:auto;height:auto;object-fit:contain;display:block}
.bp-marca-fb{width:88px;height:88px;border-radius:24px;background:linear-gradient(150deg,var(--brand),var(--brand-deep));display:grid;place-items:center;font-size:40px;font-weight:850;color:#0e1319}
.bp-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--brand-deep)}
.bp-hero h1{font-size:34px;font-weight:850;letter-spacing:-.025em;margin:4px 0 10px;text-wrap:balance}
.bp-tag{font-size:14px;color:var(--ink-soft);max-width:34ch;margin:0 auto;line-height:1.5}
.bp-mes{display:flex;justify-content:center}
.bp-intro{font-size:14px;color:var(--ink-soft);margin-bottom:12px;line-height:1.5}
.bp-pillars{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.bp-pillar{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:15px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:6px}
.bp-pt{display:flex;align-items:center;justify-content:space-between}
.bp-emo{width:38px;height:38px;border-radius:11px;background:var(--brand-tint);display:grid;place-items:center;font-size:20px}
.bp-val{font-size:15px;font-weight:850;color:var(--money)}
.bp-pillar h3{font-size:16px;font-weight:800;letter-spacing:-.01em;line-height:1.1}
.bp-cat{font-size:12px;color:var(--muted);font-weight:600}
.bp-banner{background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#0e1319;border-radius:16px;padding:16px;text-align:center;box-shadow:0 10px 26px rgba(234,184,2,.32);margin-top:13px}
.bp-banner .bs{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.85}
.bp-banner .bb{font-size:26px;font-weight:850;letter-spacing:-.02em}
.bp-detail{display:flex;flex-direction:column;gap:10px}
.bp-frente{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;gap:12px;box-shadow:var(--sh-sm)}
.bp-de{width:40px;height:40px;border-radius:11px;background:var(--brand-tint);display:grid;place-items:center;font-size:21px;flex-shrink:0}
.bp-frente-txt{flex:1;min-width:0}
.bp-frente-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bp-frente-top h4{font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1.25;min-width:0}
.bp-selo{font-size:11px;font-weight:800;color:var(--money);background:rgba(15,138,84,.1);border:1px solid rgba(15,138,84,.16);border-radius:999px;padding:3px 9px;white-space:nowrap;flex-shrink:0}
.bp-frente p{font-size:12.8px;color:var(--muted);margin-top:4px;line-height:1.45}
.bp-pen{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.bp-pen span{font-size:11px;font-weight:650;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;color:var(--ink-soft)}
.bp-regras-btn{display:block;margin:14px auto 0;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:9px 18px;font-family:inherit;font-size:12.5px;font-weight:750;color:var(--ink-soft);cursor:pointer;box-shadow:var(--sh-sm)}
/* Modal "Ver regras deste ciclo" */
.bp-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:18px;z-index:50}
.bp-modal{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px;max-width:420px;width:100%;max-height:82vh;overflow-y:auto;box-shadow:var(--sh-md)}
.bp-modal h3{font-size:17px;font-weight:850;margin-bottom:3px}
.bp-modal .sub{font-size:12.5px;color:var(--muted);margin-bottom:16px}
.bp-rg{margin-bottom:16px}
.bp-rg-h{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--brand-deep);margin-bottom:4px}
.bp-rg-row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:13px;padding:6px 0;border-top:1px dashed var(--line)}
.bp-rg-row .imp{font-weight:750;color:#c0392b;white-space:nowrap;font-size:12.5px}
.bp-rg-vazio{font-size:12px;color:var(--muted);padding:5px 0}
.bp-modal-fechar{width:100%;border:none;border-radius:11px;padding:11px;font-size:13.5px;font-weight:850;cursor:pointer;background:linear-gradient(135deg,#F2C63A,var(--brand));color:#0e1319;font-family:inherit}
.bp-ex{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:16px;box-shadow:var(--sh-sm)}
.bp-ex .eh{font-size:14px;font-weight:800}
.bp-ex .es{font-size:12.5px;color:var(--muted);margin-bottom:12px}
.bp-el{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px dashed var(--line);font-size:13.5px}
.bp-el:first-of-type{border-top:none}
.bp-el .l{color:var(--ink-soft)} .bp-el .l small{color:var(--muted)}
.bp-el .r{font-weight:750;color:var(--money)}
.bp-et{margin-top:10px;padding-top:11px;border-top:2px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.bp-et .l{font-weight:800} .bp-et .r{font-weight:850;font-size:19px;color:var(--money)}
.bp-podium{display:grid;grid-template-columns:1fr 1.14fr 1fr;align-items:end;gap:9px;margin-bottom:14px}
.bp-pod{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}
.bp-pod .medal{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:850;font-size:15px;color:#fff;box-shadow:var(--sh-sm);margin-bottom:8px}
.bp-pod.g1 .medal{background:linear-gradient(150deg,#F3B53C,var(--gold));width:48px;height:48px;font-size:17px}
.bp-pod.g2 .medal{background:linear-gradient(150deg,#AEB8C2,var(--silver))}
.bp-pod.g3 .medal{background:linear-gradient(150deg,#D08A54,var(--bronze))}
.bp-pod .who{font-size:13px;font-weight:750;line-height:1.2;width:100%;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bp-pod .tot{font-size:14px;font-weight:850;color:var(--money);margin-top:1px}
.bp-pod .stand{width:100%;margin-top:9px;border-radius:12px 12px 0 0;background:var(--surface);border:1px solid var(--line);border-bottom:none;box-shadow:var(--sh-sm)}
.bp-pod.g1 .stand{height:62px;background:linear-gradient(180deg,var(--brand-tint),var(--surface))}
.bp-pod.g2 .stand{height:44px} .bp-pod.g3 .stand{height:34px}
.bp-list{display:flex;flex-direction:column;gap:8px}
.bp-row{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:12px;box-shadow:var(--sh-sm)}
.bp-pos{width:28px;height:28px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:13px;color:var(--muted);flex-shrink:0}
.bp-row .name{flex:1;min-width:0}
.bp-row .name .n{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bp-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.bp-chip{font-size:11px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--muted)}
.bp-chip b{color:var(--ink)}
.bp-row .tot{font-weight:850;font-size:15px;color:var(--money);white-space:nowrap}
.bp-tips{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:18px;box-shadow:var(--sh-sm)}
.bp-tips h2{font-size:15px;font-weight:800;margin-bottom:14px;letter-spacing:-.01em}
.bp-tip{display:flex;gap:12px;align-items:center;padding:11px 0;border-top:1px dashed var(--line)}
.bp-tip:first-of-type{border-top:none;padding-top:0}
.bp-tip:last-of-type{padding-bottom:0}
.bp-tip-emo{width:36px;height:36px;border-radius:12px;background:var(--brand-tint);display:grid;place-items:center;font-size:17px;flex-shrink:0;line-height:1}
.bp-tip-txt{min-width:0}
.bp-tip-t{font-size:13.5px;font-weight:800;line-height:1.3;color:var(--ink)}
.bp-tip-d{font-size:12.5px;color:var(--muted);line-height:1.45;margin-top:2px}
.bp-foot{text-align:center;font-size:11.5px;color:var(--muted);line-height:1.6}
.bp-state{min-height:60vh;display:grid;place-items:center;text-align:center;color:var(--muted);padding:24px}
`

// Etiquetas do Resultado coletivo quando a loja ainda não cadastrou indicadores.
// Assim que houver indicadores (Bonificação › Configuração), estes dão lugar aos reais.
const COLETIVO_PADRAO = ['Google', 'NPS', 'Metas']

// Uma frente da bonificação: nome (principal) + valor como selo + descrição + etiquetas
// (geradas das regras/indicadores do ciclo — sem percentual fixo no layout).
function Frente({ emo, nome, selo, desc, tags }) {
  return (
    <article className="bp-frente">
      <span className="bp-de">{emo}</span>
      <div className="bp-frente-txt">
        <div className="bp-frente-top">
          <h4>{nome}</h4>
          <span className="bp-selo">{selo}</span>
        </div>
        <p>{desc}</p>
        {tags?.length > 0 && <div className="bp-pen">{tags.map((t, i) => <span key={i}>{t}</span>)}</div>}
      </div>
    </article>
  )
}

// Detalhe opcional: as faixas/impactos reais do ciclo (nada fixo no layout).
function ModalRegras({ tipos, indicadores, coletivaPct, onClose }) {
  const porPilar = [
    ['Assiduidade', tipos.filter((t) => t.pilar === 'ASSIDUIDADE')],
    ['Desempenho', tipos.filter((t) => t.pilar === 'DESEMPENHO')],
    ['Resultado coletivo', tipos.filter((t) => t.pilar === 'COLETIVA')],
  ]
  return (
    <div className="bp-ov" onClick={onClose}>
      <div className="bp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Regras deste ciclo</h3>
        <div className="sub">O que desconta de cada frente neste mês.</div>
        {porPilar.map(([titulo, lista]) => (
          <div className="bp-rg" key={titulo}>
            <div className="bp-rg-h">{titulo}</div>
            {lista.length === 0
              ? <div className="bp-rg-vazio">Nenhuma ocorrência cadastrada nesta frente.</div>
              : lista.map((t, i) => (
                <div className="bp-rg-row" key={i}><span>{t.nome}</span><span className="imp">−{t.percentual}%</span></div>
              ))}
          </div>
        ))}
        {indicadores.length > 0 && (
          <div className="bp-rg">
            <div className="bp-rg-h">Indicadores da loja</div>
            {indicadores.map((n, i) => <div className="bp-rg-row" key={i}><span>{n}</span></div>)}
          </div>
        )}
        <div className="bp-rg">
          <div className="bp-rg-h">Destaque do mês</div>
          <div className="bp-rg-row"><span>Índice de Excelência</span><span className="imp" style={{ color: 'var(--ink-soft)' }}>50% Assiduidade + 35% Desempenho + 15% Contribuições</span></div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>Nota coletiva deste mês: <b>{coletivaPct}%</b>.</div>
        <button type="button" className="bp-modal-fechar" onClick={onClose}>Entendi</button>
      </div>
    </div>
  )
}

export default function BonificacaoPublica() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [verRegras, setVerRegras] = useState(false)

  useEffect(() => {
    setLoading(true); setErro(null)
    api.get(`/public/bonificacao/${token}`) // mês vigente (padrão do backend); histórico é só do admin
      .then((r) => setData(r.data))
      .catch((err) => setErro(err?.response?.data?.error ?? 'Não foi possível carregar a página.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading && !data) return <div className="bp-root"><style>{CSS}</style><div className="bp-state">Carregando…</div></div>
  if (erro) return <div className="bp-root"><style>{CSS}</style><div className="bp-state">{erro}</div></div>

  const { loja, funcionarios = [], config = {}, coletivaPct = 0, tipos = [], indicadores = [], ano, mes } = data || {}
  const c = config
  const maxPossivel = Number(c.tetoAssiduidade || 0) + Number(c.tetoDesempenho || 0) + Number(c.tetoColetiva || 0) + Number(c.bonusTop1 || 0)
  const tAssid = tipos.filter((t) => t.pilar === 'ASSIDUIDADE')
  const tDesemp = tipos.filter((t) => t.pilar === 'DESEMPENHO')
  const ordenados = [...funcionarios].sort((a, b) => (a.posicao || 99) - (b.posicao || 99))
  // Só o pódio é exposto publicamente (o backend também só devolve o Top 3).
  const podio = ordenados.filter((f) => f.posicao <= 3)
  const podOrder = [podio.find((f) => f.posicao === 2), podio.find((f) => f.posicao === 1), podio.find((f) => f.posicao === 3)].filter(Boolean)

  return (
    <div className="bp-root">
      <style>{CSS}</style>
      <main className="bp-wrap">

        <header className="bp-hero">
          <div className="bp-marca">
            {loja?.logoDataUrl
              ? <img className="bp-marca-img" src={loja.logoDataUrl} alt={loja?.nome || 'Logo'} />
              : <span className="bp-marca-fb">{(loja?.nome || 'L').charAt(0).toUpperCase()}</span>}
          </div>
          <div className="bp-eyebrow">Programa de Performance</div>
          <h1>Destaque do Mês</h1>
          <p className="bp-tag">Cada mês é uma nova oportunidade de se destacar, acumular coins e disputar prêmios junto à equipe!</p>
        </header>

        <section>
          <h2 className="bp-sec-title">Como participar</h2>
          <p className="bp-intro">Todo dia 1º um novo ciclo se inicia. Existem <span className="bp-b">4 maneiras</span> de ganhar:</p>
          <div className="bp-pillars">
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">❤️</span><span className="bp-val">{brl(c.tetoAssiduidade)}</span></div><h3>Assiduidade</h3><span className="bp-cat">Presença e pontualidade</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">👊</span><span className="bp-val">{brl(c.tetoDesempenho)}</span></div><h3>Desempenho</h3><span className="bp-cat">Qualidade do trabalho</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">🤝</span><span className="bp-val">{brl(c.tetoColetiva)}</span></div><h3>Coletivo</h3><span className="bp-cat">Equipe</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">🏆</span><span className="bp-val">{brl(c.bonusTop1)}</span></div><h3>Destaque do mês</h3><span className="bp-cat">1º lugar do ciclo</span></article>
          </div>
          <div className="bp-banner"><div className="bs">Ganhe até</div><div className="bb bp-tnum">{brl(maxPossivel)} a mais</div></div>
        </section>

        <section>
          <h2 className="bp-sec-title">Como sua bonificação é formada</h2>
          <p className="bp-intro">Acompanhe o que compõe seu resultado no mês e quais fatores influenciam cada parte da bonificação.</p>
          <div className="bp-detail">
            <Frente emo="❤️" nome="Assiduidade" selo={`até ${brl(c.tetoAssiduidade)}`}
              desc="Reconhece sua presença e pontualidade durante o mês."
              tags={tAssid.map((t) => t.nome)} />
            <Frente emo="👊" nome="Desempenho" selo={`até ${brl(c.tetoDesempenho)}`}
              desc="Representa a qualidade da sua execução no dia a dia."
              tags={tDesemp.map((t) => t.nome)} />
            <Frente emo="🤝" nome="Resultado coletivo" selo={`até ${brl(c.tetoColetiva)}`}
              desc="Mostra o desempenho geral da loja durante o ciclo."
              tags={indicadores.length ? indicadores : COLETIVO_PADRAO} />
            <Frente emo="🏆" nome="Destaque do mês" selo={brl(c.bonusTop1)}
              desc="Reconhece o colaborador com o melhor resultado geral no ciclo."
              tags={['Índice de Excelência', '1º lugar do mês']} />
          </div>
          <button type="button" className="bp-regras-btn" onClick={() => setVerRegras(true)}>Ver regras deste ciclo</button>
        </section>

        {/* Exemplo ilustrativo (nome fictício) — não expõe o resultado de ninguém. */}
        <section>
          <h2 className="bp-sec-title">Exemplo do mês</h2>
          <div className="bp-ex">
            <div className="eh">Junior Lisboa está em 1º 🏆</div>
            <div className="es">Exemplo de como o prêmio é montado:</div>
            <div className="bp-el"><span className="l">Assiduidade <small>· 100%</small></span><span className="r bp-tnum">{brl(c.tetoAssiduidade)}</span></div>
            <div className="bp-el"><span className="l">Desempenho <small>· 100%</small></span><span className="r bp-tnum">{brl(c.tetoDesempenho)}</span></div>
            <div className="bp-el"><span className="l">Coletivo <small>· 100%</small></span><span className="r bp-tnum">{brl(c.tetoColetiva)}</span></div>
            <div className="bp-el"><span className="l">Destaque do mês <small>· 1º lugar</small></span><span className="r bp-tnum">{brl(c.bonusTop1)}</span></div>
            <div className="bp-et"><span className="l">Total</span><span className="r bp-tnum">{brl(maxPossivel)}</span></div>
          </div>
        </section>

        <section>
          <h2 className="bp-sec-title">Ranking de {new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}</h2>
          {podOrder.length === 0 ? (
            <div className="bp-state" style={{ minHeight: 120 }}>O Destaque deste mês ainda não foi definido.</div>
          ) : (
            <>
              <div className="bp-podium">
                {podOrder.map((f) => (
                  <div key={f.funcionarioId} className={'bp-pod ' + MEDAL[f.posicao]}>
                    <div className="medal">{f.posicao}</div>
                    <div className="who">{f.nome}</div>
                    <div className="tot bp-tnum">{brl(f.totalRs)}</div>
                    <div className="stand"></div>
                  </div>
                ))}
              </div>
              {/* Só o pódio: as posições de 4º em diante não são expostas (evita constrangimento). */}
            </>
          )}
        </section>

        <section className="bp-tips">
          <h2>Como ir bem</h2>
          {[
            ['❤️', 'Chegue no horário e não falte', 'Cada ocorrência tira % da sua Assiduidade.'],
            ['👊', 'Capriche no serviço', 'Advertências e erros pesam no Desempenho.'],
            ['🤝', 'Juntos vão mais longe', 'A nota Coletiva da loja vale igual pra todo mundo.'],
            ['🏆', 'Seja o Destaque do mês', 'O 1º lugar do ciclo leva o bônus.'],
          ].map(([emo, titulo, desc]) => (
            <div className="bp-tip" key={titulo}>
              <span className="bp-tip-emo">{emo}</span>
              <div className="bp-tip-txt">
                <div className="bp-tip-t">{titulo}</div>
                <div className="bp-tip-d">{desc}</div>
              </div>
            </div>
          ))}
        </section>

        <footer className="bp-foot">Feito por Agência Na Chapa 🚀</footer>

      </main>

      {verRegras && <ModalRegras tipos={tipos} indicadores={indicadores} coletivaPct={coletivaPct} onClose={() => setVerRegras(false)} />}
    </div>
  )
}
