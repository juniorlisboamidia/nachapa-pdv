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
.bp-store{display:flex;align-items:center;gap:9px}
.bp-store .lg{width:30px;height:30px;border-radius:9px;background:linear-gradient(150deg,var(--brand),var(--brand-deep));display:grid;place-items:center;font-size:16px;color:#0e1319;font-weight:800;overflow:hidden}
.bp-store .lg img{width:100%;height:100%;object-fit:cover}
.bp-store .nm{font-size:14px;font-weight:750}
.bp-hero{background:radial-gradient(130% 130% at 88% -10%,rgba(234,184,2,.18),transparent 56%),linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--line);border-radius:22px;padding:24px 22px 26px;box-shadow:var(--sh-md);text-align:center}
.bp-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--brand-deep)}
.bp-hero h1{font-size:34px;font-weight:850;letter-spacing:-.025em;margin:4px 0 10px;text-wrap:balance}
.bp-tag{font-size:14px;color:var(--ink-soft);max-width:34ch;margin:0 auto 18px;line-height:1.5}
.bp-prize{display:inline-flex;flex-direction:column;gap:2px;background:var(--brand-tint);border-radius:14px;padding:12px 22px}
.bp-prize .p1{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand-deep)}
.bp-prize .p2{font-size:28px;font-weight:850;letter-spacing:-.02em;color:var(--brand-deep)}
.bp-prize .p3{font-size:11px;color:var(--brand-deep);opacity:.75}
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
.bp-drow{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;gap:12px;box-shadow:var(--sh-sm)}
.bp-de{width:40px;height:40px;border-radius:11px;background:var(--brand-tint);display:grid;place-items:center;font-size:21px;flex-shrink:0}
.bp-drow h4{font-size:15px;font-weight:800;display:flex;align-items:baseline;gap:8px}
.bp-drow h4 .v{font-size:12.5px;font-weight:800;color:var(--money)}
.bp-drow p{font-size:12.8px;color:var(--muted);margin-top:3px;line-height:1.45}
.bp-pen{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.bp-pen span{font-size:11px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--ink-soft)}
.bp-pen b{color:#8a6d00}
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
.bp-tips{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:16px 16px 6px;box-shadow:var(--sh-sm)}
.bp-tips h2{font-size:15px;font-weight:800;margin-bottom:10px}
.bp-tip{display:flex;gap:10px;padding-bottom:12px;font-size:13.5px;color:var(--ink-soft)}
.bp-tip .dot{width:7px;height:7px;border-radius:50%;background:var(--brand);flex-shrink:0;margin-top:6px}
.bp-foot{text-align:center;font-size:11.5px;color:var(--muted);line-height:1.6}
.bp-state{min-height:60vh;display:grid;place-items:center;text-align:center;color:var(--muted);padding:24px}
`

function Pen({ tipos }) {
  if (!tipos.length) return null
  return <div className="bp-pen">{tipos.map((t, i) => <span key={i}>{t.nome} <b>−{t.percentual}%</b></span>)}</div>
}

export default function BonificacaoPublica() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    setLoading(true); setErro(null)
    api.get(`/public/bonificacao/${token}`) // mês vigente (padrão do backend); histórico é só do admin
      .then((r) => setData(r.data))
      .catch((err) => setErro(err?.response?.data?.error ?? 'Não foi possível carregar a página.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading && !data) return <div className="bp-root"><style>{CSS}</style><div className="bp-state">Carregando…</div></div>
  if (erro) return <div className="bp-root"><style>{CSS}</style><div className="bp-state">{erro}</div></div>

  const { loja, funcionarios = [], config = {}, coletivaPct = 0, tipos = [], ano, mes } = data || {}
  const c = config
  const maxPossivel = Number(c.tetoAssiduidade || 0) + Number(c.tetoDesempenho || 0) + Number(c.tetoColetiva || 0) + Number(c.bonusTop1 || 0)
  const tAssid = tipos.filter((t) => t.pilar === 'ASSIDUIDADE')
  const tDesemp = tipos.filter((t) => t.pilar === 'DESEMPENHO')
  const ordenados = [...funcionarios].sort((a, b) => (a.posicao || 99) - (b.posicao || 99))
  const podio = ordenados.filter((f) => f.posicao <= 3)
  const resto = ordenados.filter((f) => f.posicao > 3)
  const podOrder = [podio.find((f) => f.posicao === 2), podio.find((f) => f.posicao === 1), podio.find((f) => f.posicao === 3)].filter(Boolean)
  const lider = ordenados.find((f) => f.posicao === 1)

  return (
    <div className="bp-root">
      <style>{CSS}</style>
      <main className="bp-wrap">

        <div className="bp-store">
          <span className="lg">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</span>
          <span className="nm">{loja?.nome}</span>
        </div>

        <header className="bp-hero">
          <div className="bp-eyebrow">Programa de Bonificação</div>
          <h1>Destaque do Mês</h1>
          <p className="bp-tag">Cada mês é uma nova oportunidade de acumular pontos, subir de rank e disputar prêmios junto à equipe!</p>
          <div className="bp-prize">
            <span className="p1">Ganhe até</span>
            <span className="p2 bp-tnum">{brl(maxPossivel)}/mês</span>
          </div>
        </header>

        <section>
          <h2 className="bp-sec-title">Como participar</h2>
          <p className="bp-intro">Todo dia 1º um novo ciclo se inicia. Existem <span className="bp-b">4 maneiras</span> de ganhar:</p>
          <div className="bp-pillars">
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">❤️</span><span className="bp-val">{brl(c.tetoAssiduidade)}</span></div><h3>Assiduidade</h3><span className="bp-cat">Presença e pontualidade</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">👊</span><span className="bp-val">{brl(c.tetoDesempenho)}</span></div><h3>Desempenho</h3><span className="bp-cat">Qualidade do trabalho</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">🤝</span><span className="bp-val">{brl(c.tetoColetiva)}</span></div><h3>Coletivo</h3><span className="bp-cat">Equipe</span></article>
            <article className="bp-pillar"><div className="bp-pt"><span className="bp-emo">🏆</span><span className="bp-val">{brl(c.bonusTop1)}</span></div><h3>Extra</h3><span className="bp-cat">Destaque do mês</span></article>
          </div>
          <div className="bp-banner"><div className="bs">Ganhe até</div><div className="bb bp-tnum">{brl(maxPossivel)} a mais</div></div>
        </section>

        <section>
          <h2 className="bp-sec-title">Entenda cada frente</h2>
          <div className="bp-detail">
            <div className="bp-drow"><span className="bp-de">❤️</span><div>
              <h4>Assiduidade <span className="v">até {brl(c.tetoAssiduidade)}</span></h4>
              <p>Você começa o mês com <span className="bp-b">100%</span>. Cada ocorrência desconta uma parte.</p>
              <Pen tipos={tAssid} />
            </div></div>
            <div className="bp-drow"><span className="bp-de">👊</span><div>
              <h4>Desempenho <span className="v">até {brl(c.tetoDesempenho)}</span></h4>
              <p>Começa em <span className="bp-b">100%</span>. Falhas no trabalho descontam pontos.</p>
              <Pen tipos={tDesemp} />
            </div></div>
            <div className="bp-drow"><span className="bp-de">🤝</span><div>
              <h4>Coletivo <span className="v">até {brl(c.tetoColetiva)}</span></h4>
              <p>A nota da <span className="bp-b">loja</span> no mês (avaliações e metas). Vale igual para todos. Este mês: <span className="bp-b">{coletivaPct}%</span>.</p>
            </div></div>
            <div className="bp-drow"><span className="bp-de">🏆</span><div>
              <h4>Extra <span className="v">{brl(c.bonusTop1)}</span></h4>
              <p>O <span className="bp-b">destaque do mês</span> — o 1º colocado no ranking — leva um bônus extra.</p>
            </div></div>
          </div>
        </section>

        {lider && lider.totalRs > 0 && (
          <section>
            <h2 className="bp-sec-title">Exemplo do mês</h2>
            <div className="bp-ex">
              <div className="eh">{lider.nome} está em 1º 🏆</div>
              <div className="es">Veja como o prêmio está montado:</div>
              <div className="bp-el"><span className="l">Assiduidade <small>· {lider.assidPct}%</small></span><span className="r bp-tnum">{brl(lider.assidRs)}</span></div>
              <div className="bp-el"><span className="l">Desempenho <small>· {lider.desPct}%</small></span><span className="r bp-tnum">{brl(lider.desRs)}</span></div>
              <div className="bp-el"><span className="l">Coletivo <small>· {lider.coletivaPct}%</small></span><span className="r bp-tnum">{brl(lider.colRs)}</span></div>
              {lider.classificacaoRs > 0 && <div className="bp-el"><span className="l">Extra <small>· destaque do mês</small></span><span className="r bp-tnum">{brl(lider.classificacaoRs)}</span></div>}
              <div className="bp-et"><span className="l">Total</span><span className="r bp-tnum">{brl(lider.totalRs)}</span></div>
            </div>
          </section>
        )}

        <section>
          <h2 className="bp-sec-title">Ranking de {new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}</h2>
          {ordenados.length === 0 ? (
            <div className="bp-state" style={{ minHeight: 120 }}>Nenhum funcionário neste mês.</div>
          ) : (
            <>
              {podOrder.length > 0 && (
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
              )}
              {resto.length > 0 && (
                <div className="bp-list">
                  {resto.map((f) => (
                    <div key={f.funcionarioId} className="bp-row">
                      <div className="bp-pos">{f.posicao}º</div>
                      <div className="name">
                        <div className="n">{f.nome}</div>
                        <div className="bp-chips">
                          {f.indice != null && <span className="bp-chip">⭐ Índice <b>{f.indice}%</b></span>}
                          <span className="bp-chip">Assiduidade <b>{f.assidPct}%</b></span>
                          <span className="bp-chip">Desempenho <b>{f.desPct}%</b></span>
                          <span className="bp-chip">Coletivo <b>{f.coletivaPct}%</b></span>
                        </div>
                      </div>
                      <div className="tot bp-tnum">{brl(f.totalRs)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="bp-tips">
          <h2>Como ir bem</h2>
          <div className="bp-tip"><span className="dot"></span><span>Chegue no horário e não falte — cada ocorrência tira % da sua Assiduidade.</span></div>
          <div className="bp-tip"><span className="dot"></span><span>Capriche no serviço — advertências e erros pesam no Desempenho.</span></div>
          <div className="bp-tip"><span className="dot"></span><span>Jogue pela equipe — a nota Coletiva da loja vale igual pra todo mundo.</span></div>
          <div className="bp-tip"><span className="dot"></span><span>Seja o Destaque do mês — o 1º lugar leva o Extra.</span></div>
        </section>

        <footer className="bp-foot">Feito por Agência Na Chapa 🚀</footer>

      </main>
    </div>
  )
}
