// Página PESSOAL da Bonificação (link privado do funcionário). Sem login — abre por
// token secreto. Mostra: identidade, carteira de Coins, o resultado do mês e o ranking do time
// (com "você" destacado). CSS escopado em .be-root (prefixo be-), tema pelo SO.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
const num = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0))
const MEDAL = { 1: 'g1', 2: 'g2', 3: 'g3' }
const RAR = {
  COMUM: { label: 'Comum', cor: '#64748b' },
  RARO: { label: 'Raro', cor: '#eab802' },
  EPICO: { label: 'Épico', cor: '#8b5cf6' },
  LENDARIO: { label: 'Lendário', cor: '#f59e0b' },
}

const CSS = `
.be-root{--bg:#F5F1EA;--surface:#FFFFFF;--surface-2:#FBF7F1;--ink:#221A14;--ink-soft:#4E4339;--muted:#907F70;--line:#EBE2D6;--brand:#E85D1B;--brand-deep:#B8430E;--brand-tint:#FBEADF;--money:#0F8A54;--gold:#DF9B12;--silver:#94A0AC;--bronze:#BE7043;--xp:#7C5CFF;--xp-deep:#5B3EE0;--xp-tint:#EEE9FF;--sh-sm:0 1px 2px rgba(46,32,18,.06);--sh-md:0 2px 4px rgba(46,32,18,.05),0 14px 30px rgba(46,32,18,.06);--rd:16px;
  min-height:100vh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.45}
@media (prefers-color-scheme:dark){.be-root{--bg:#161009;--surface:#211812;--surface-2:#1B130D;--ink:#F4EBE1;--ink-soft:#D8CABB;--muted:#A5937F;--line:#33261B;--brand:#FB7A3B;--brand-deep:#E85D1B;--brand-tint:#3A2313;--money:#3FBE82;--xp:#9E86FF;--xp-deep:#7C5CFF;--xp-tint:#241A3C;--sh-sm:0 1px 2px rgba(0,0,0,.4);--sh-md:0 2px 4px rgba(0,0,0,.35),0 16px 34px rgba(0,0,0,.45)}}
.be-root *{box-sizing:border-box}
.be-wrap{max-width:480px;margin:0 auto;padding:16px 16px 40px;display:flex;flex-direction:column;gap:22px}
.be-tnum{font-variant-numeric:tabular-nums}
.be-sec-title{font-size:12.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.be-b{font-weight:700;color:var(--ink)}
.be-store{display:flex;align-items:center;gap:9px}
.be-store .lg{width:30px;height:30px;border-radius:9px;background:linear-gradient(150deg,var(--brand),var(--brand-deep));display:grid;place-items:center;font-size:16px;color:#fff;font-weight:800;overflow:hidden}
.be-store .lg img{width:100%;height:100%;object-fit:cover}
.be-store .nm{font-size:14px;font-weight:750}
.be-hi{margin-top:2px}
.be-hi .oi{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand)}
.be-hi h1{font-size:30px;font-weight:850;letter-spacing:-.025em;margin:2px 0 2px;text-wrap:balance}
.be-hi .fx{font-size:13.5px;color:var(--muted);font-weight:600}
/* Cartão de nível/XP — acento violeta */
.be-lvl{background:radial-gradient(130% 130% at 90% -10%,rgba(124,92,255,.22),transparent 58%),linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--sh-md)}
.be-lvl-top{display:flex;align-items:center;gap:14px}
.be-badge{width:60px;height:60px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-weight:850;background:linear-gradient(150deg,var(--xp),var(--xp-deep));box-shadow:0 8px 20px rgba(124,92,255,.4);position:relative}
.be-badge .lv{font-size:11px;font-weight:800;letter-spacing:.06em;opacity:.85;line-height:1}
.be-badge .n{font-size:24px;letter-spacing:-.02em;line-height:1}
.be-lvl-info{flex:1;min-width:0}
.be-lvl-info .nome{font-size:19px;font-weight:850;letter-spacing:-.01em;line-height:1.15}
.be-lvl-info .xp{font-size:12.5px;color:var(--muted);font-weight:650;margin-top:2px}
.be-lvl-info .xp b{color:var(--xp);font-weight:800}
.be-bar{margin-top:16px}
.be-bar-track{height:11px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden}
.be-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--xp),var(--xp-deep));transition:width .5s ease}
.be-bar-meta{display:flex;justify-content:space-between;margin-top:7px;font-size:11.5px;color:var(--muted);font-weight:600}
.be-bar-meta b{color:var(--ink)}
/* Cartão do resultado do mês */
.be-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:18px;box-shadow:var(--sh-sm)}
.be-mhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
.be-mhead .mtot{text-align:right}
.be-mhead .mtot .k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.be-mhead .mtot .v{font-size:26px;font-weight:850;letter-spacing:-.02em;color:var(--money);line-height:1}
.be-rank-pill{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:800;padding:7px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line)}
.be-rank-pill .m{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:850;color:#fff;background:var(--muted)}
.be-rank-pill.g1 .m{background:linear-gradient(150deg,#F3B53C,var(--gold))}
.be-rank-pill.g2 .m{background:linear-gradient(150deg,#AEB8C2,var(--silver))}
.be-rank-pill.g3 .m{background:linear-gradient(150deg,#D08A54,var(--bronze))}
.be-el{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px dashed var(--line);font-size:13.5px}
.be-el .l{color:var(--ink-soft)} .be-el .l small{color:var(--muted)}
.be-el .r{font-weight:750;color:var(--money)}
.be-el.zero .r{color:var(--muted);font-weight:650}
.be-indice{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 13px;border-radius:12px;background:var(--brand-tint);color:var(--brand-deep);font-weight:750;font-size:13.5px}
.be-indice b{color:var(--brand-deep);font-size:16px}
.be-emptybox{text-align:center;padding:10px 0 4px;color:var(--muted);font-size:13px}
.be-hint{font-size:12px;color:var(--muted);margin-top:12px;line-height:1.5}
.be-hint b{color:var(--xp)}
/* Ranking */
.be-list{display:flex;flex-direction:column;gap:8px}
.be-row{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:12px;box-shadow:var(--sh-sm)}
.be-row.eu{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand),var(--sh-sm);background:linear-gradient(180deg,var(--brand-tint),var(--surface))}
.be-pos{width:30px;height:30px;border-radius:9px;background:var(--surface-2);border:1px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:13px;color:var(--muted);flex-shrink:0}
.be-pos.g1{background:linear-gradient(150deg,#F3B53C,var(--gold));color:#fff;border:none}
.be-pos.g2{background:linear-gradient(150deg,#AEB8C2,var(--silver));color:#fff;border:none}
.be-pos.g3{background:linear-gradient(150deg,#D08A54,var(--bronze));color:#fff;border:none}
.be-row .name{flex:1;min-width:0}
.be-row .name .n{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.be-row .name .tag{font-size:11px;font-weight:800;color:var(--brand);letter-spacing:.04em}
.be-row .tot{font-weight:850;font-size:15px;color:var(--money);white-space:nowrap}
.be-foot{text-align:center;font-size:11.5px;color:var(--muted);line-height:1.6}
.be-state{min-height:60vh;display:grid;place-items:center;text-align:center;color:var(--muted);padding:24px}
/* Formulários (reconhecimento / ouvidoria) */
.be-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:11px;padding:11px 12px;outline:none}
.be-input:focus{border-color:var(--brand)}
.be-btn{align-self:flex-start;font-family:inherit;font-size:14px;font-weight:750;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-deep));border:none;border-radius:11px;padding:11px 18px;cursor:pointer;box-shadow:var(--sh-sm)}
.be-btn:disabled{opacity:.55;cursor:default}
.be-mini-title{font-size:12px;font-weight:800;color:var(--muted);margin-bottom:7px;text-transform:uppercase;letter-spacing:.03em}
.be-rec-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px dashed var(--line);font-size:13px}
.be-rec-de{font-weight:750;flex-shrink:0}
.be-rec-msg{color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.be-rec-st{font-weight:750;flex-shrink:0;font-size:12.5px}
.be-ouv-row{padding:9px 0;border-top:1px dashed var(--line)}
.be-ouv-msg{font-size:13px;color:var(--ink);white-space:pre-wrap}
.be-ouv-resp{margin-top:5px;padding:7px 10px;background:rgba(15,138,84,.1);border-radius:9px;font-size:12.5px;color:var(--ink-soft)}
/* Conquistas */
.be-ach{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.be-ach-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:5px;position:relative;overflow:hidden}
.be-ach-card.on{border-color:var(--ac)}
.be-ach-card.on::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--ac)}
.be-ach-card.off{opacity:.66}
.be-ach-emo{font-size:30px;line-height:1}
.be-ach-card.off .be-ach-emo{filter:grayscale(1);opacity:.5}
.be-ach-lock{position:absolute;top:11px;right:12px;font-size:13px;opacity:.5}
.be-ach-nm{font-size:13.5px;font-weight:800;line-height:1.15}
.be-ach-ds{font-size:11px;color:var(--muted);line-height:1.35}
.be-rar{display:inline-block;align-self:flex-start;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:999px;margin-top:2px}
.be-ach-prog{height:6px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden;margin-top:4px}
.be-ach-prog i{display:block;height:100%;background:var(--xp)}
.be-ach-meta{font-size:10.5px;color:var(--muted);font-weight:600;margin-top:3px}
/* Carteira de Coins */
.be-wallet{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.be-wallet-k{font-size:14px;font-weight:800;color:var(--ink)}
.be-wallet-s{font-size:12.5px;color:var(--muted);margin-top:2px;max-width:280px}
/* Mercado */
.be-coins{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#F5C451,#D9A21B);color:#4A2F00;font-weight:850;border-radius:999px;padding:7px 15px;font-size:15px;box-shadow:var(--sh-sm)}
.be-shop{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.be-shop-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:5px}
.be-shop-emo{font-size:30px;line-height:1}
.be-shop-nm{font-size:13.5px;font-weight:800;line-height:1.15}
.be-shop-ds{font-size:11px;color:var(--muted);line-height:1.35;flex:1}
.be-shop-cost{font-size:14px;font-weight:850;color:#B8860B;margin-top:2px}
.be-shop-btn{margin-top:5px;border:none;border-radius:10px;padding:8px;font-size:12.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#fff}
.be-shop-btn:disabled{background:var(--surface-2);color:var(--muted);border:1px solid var(--line);cursor:not-allowed}
.be-resg{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.be-resg-row{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;box-shadow:var(--sh-sm)}
.be-resg-row .nm{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.be-st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px;white-space:nowrap}
.be-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px;z-index:50}
.be-dlg{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;max-width:340px;width:100%;box-shadow:var(--sh-md);text-align:center}
.be-dlg h3{font-size:17px;font-weight:850;margin-bottom:6px}
.be-dlg p{font-size:13px;color:var(--ink-soft);line-height:1.5;margin-bottom:16px}
.be-dlg-row{display:flex;gap:9px}
.be-dlg-row button{flex:1;border-radius:11px;padding:11px;font-size:13.5px;font-weight:800;cursor:pointer;border:1px solid var(--line)}
.be-dlg-row .ok{border:none;background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#fff}
.be-dlg-row .no{background:var(--surface-2);color:var(--ink-soft)}
.be-dlg-row button:disabled{opacity:.6;cursor:not-allowed}
`

const STAT = {
  PENDENTE: { label: 'Pendente', cor: '#b45309' },
  APROVADO: { label: 'Aprovado', cor: '#a17c00' },
  ENTREGUE: { label: 'Entregue', cor: '#0F8A54' },
  REJEITADO: { label: 'Rejeitado', cor: '#dc2626' },
}

export default function BonificacaoEu() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [confirmar, setConfirmar] = useState(null) // item a resgatar
  const [resgatando, setResgatando] = useState(false)
  const [aviso, setAviso] = useState(null)

  function carregar(silent) {
    if (!silent) setLoading(true)
    setErro(null)
    api.get(`/public/eu/${token}`)
      .then((r) => setData(r.data))
      .catch((err) => { if (!silent) setErro(err?.response?.data?.error ?? 'Não foi possível carregar a página.') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function resgatar() {
    if (!confirmar) return
    setResgatando(true)
    try {
      await api.post(`/public/eu/${token}/resgatar`, { itemId: confirmar.id })
      setConfirmar(null); setAviso('Resgate solicitado! A liderança vai avaliar e te entregar o prêmio. 🎉')
      carregar(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível resgatar.') ; setConfirmar(null) }
    finally { setResgatando(false) }
  }

  if (loading && !data) return <div className="be-root"><style>{CSS}</style><div className="be-state">Carregando…</div></div>
  if (erro) return <div className="be-root"><style>{CSS}</style><div className="be-state">{erro}</div></div>

  const { loja, funcionario, meu, ranking = [], conquistas = [], conquistasResumo = { total: 0, desbloqueadas: 0 }, coins, moedas = 0, mercado = [], meusResgates = [], colegas = [], reconhecimento = null, ouvidoria = [], contribuicoes = [], ano, mes } = data || {}
  const saldoCoins = Number(coins ?? moedas ?? 0)
  const mesNome = new Date(ano, (mes || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  const pos = meu?.posicao
  const medalCls = pos && pos <= 3 ? MEDAL[pos] : ''

  return (
    <div className="be-root">
      <style>{CSS}</style>
      <main className="be-wrap">

        <div className="be-store">
          <span className="lg">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</span>
          <span className="nm">{loja?.nome}</span>
        </div>

        <header className="be-hi">
          <div className="oi">Sua jornada</div>
          <h1>Olá, {funcionario?.nome?.split(' ')[0] || 'você'}!</h1>
          {funcionario?.funcao && <div className="fx">{funcionario.funcao}</div>}
        </header>

        {/* Carteira de Coins */}
        <section>
          <div className="be-card be-wallet">
            <div>
              <div className="be-wallet-k">Sua carteira</div>
              <div className="be-wallet-s">Junte Coins a cada fechamento e troque por prêmios no Mercado 🎁</div>
            </div>
            <span className="be-coins be-tnum">🪙 {num(saldoCoins)}</span>
          </div>
        </section>

        {/* Resultado do mês */}
        <section>
          <h2 className="be-sec-title">Seu {mesNome}</h2>
          <div className="be-card">
            <div className="be-mhead">
              {pos ? (
                <span className={'be-rank-pill ' + medalCls}><span className="m be-tnum">{pos}</span>{pos}º lugar</span>
              ) : <span className="be-rank-pill">Sem posição</span>}
              <div className="mtot">
                <div className="k">Seu prêmio</div>
                <div className="v be-tnum">{brl(meu?.totalRs)}</div>
              </div>
            </div>
            {meu ? (
              <>
                <div className="be-el"><span className="l">Assiduidade <small>· {meu.assidPct}%</small></span><span className="r be-tnum">{brl(meu.assidRs)}</span></div>
                <div className="be-el"><span className="l">Desempenho <small>· {meu.desPct}%</small></span><span className="r be-tnum">{brl(meu.desRs)}</span></div>
                <div className="be-el"><span className="l">Coletivo <small>· {meu.coletivaPct}%</small></span><span className="r be-tnum">{brl(meu.colRs)}</span></div>
                <div className={'be-el' + (meu.classificacaoRs > 0 ? '' : ' zero')}><span className="l">Extra <small>· destaque do mês</small></span><span className="r be-tnum">{brl(meu.classificacaoRs)}</span></div>
                {meu.indice != null && (
                  <div className="be-indice">
                    <span>⭐ Índice de Excelência</span>
                    <b className="be-tnum">{meu.indice}%</b>
                  </div>
                )}
              </>
            ) : (
              <div className="be-emptybox">Seu resultado deste mês ainda não foi lançado.</div>
            )}
            <p className="be-hint">O <b>Destaque do Mês</b> (Top 3, que leva o Extra) é por <b>Índice de Excelência</b>: 59% Assiduidade + 41% Desempenho. E a cada fechamento você ganha <b>🪙 Coins</b> pra trocar por prêmios. 🚀</p>
          </div>
        </section>

        {/* Conquistas */}
        {conquistas.length > 0 && (
          <section>
            <h2 className="be-sec-title">Conquistas · {conquistasResumo.desbloqueadas}/{conquistasResumo.total}</h2>
            <div className="be-ach">
              {conquistas.map((c) => {
                const r = RAR[c.raridade] || RAR.COMUM
                const on = c.desbloqueada
                const p = c.progresso
                const pct = p && p.meta ? Math.min(100, Math.round((p.atual / p.meta) * 100)) : 0
                return (
                  <div key={c.id} className={'be-ach-card ' + (on ? 'on' : 'off')} style={on ? { '--ac': r.cor } : undefined}>
                    {!on && <span className="be-ach-lock">🔒</span>}
                    <span className="be-ach-emo">{c.emoji}</span>
                    <div className="be-ach-nm">{c.nome}</div>
                    {c.descricao && <div className="be-ach-ds">{c.descricao}</div>}
                    {on ? (
                      <span className="be-rar" style={{ color: r.cor, background: r.cor + '22' }}>{r.label}{(c.coinsBonus ?? c.xpBonus) > 0 ? ` · +${c.coinsBonus ?? c.xpBonus} 🪙` : ''}</span>
                    ) : p ? (
                      <>
                        <div className="be-ach-prog"><i style={{ width: pct + '%' }} /></div>
                        <div className="be-ach-meta be-tnum">{num(p.atual)} / {num(p.meta)}</div>
                      </>
                    ) : (
                      <span className="be-ach-meta">Concedida pela liderança</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Mercado */}
        {mercado.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <h2 className="be-sec-title" style={{ margin: 0 }}>Mercado de prêmios</h2>
              <span className="be-coins be-tnum">🪙 {num(saldoCoins)}</span>
            </div>
            <div className="be-shop">
              {mercado.map((i) => {
                const podeResgatar = !i.esgotado && saldoCoins >= i.custo
                return (
                  <div key={i.id} className="be-shop-card">
                    <span className="be-shop-emo">{i.emoji}</span>
                    <div className="be-shop-nm">{i.nome}</div>
                    {i.descricao && <div className="be-shop-ds">{i.descricao}</div>}
                    <div className="be-shop-cost be-tnum">🪙 {num(i.custo)}</div>
                    <button type="button" className="be-shop-btn" disabled={!podeResgatar} onClick={() => setConfirmar(i)}>
                      {i.esgotado ? 'Esgotado' : saldoCoins >= i.custo ? 'Resgatar' : `Faltam ${num(i.custo - saldoCoins)}`}
                    </button>
                  </div>
                )
              })}
            </div>
            {meusResgates.length > 0 && (
              <div className="be-resg">
                {meusResgates.map((r) => {
                  const st = STAT[r.status] || { label: r.status, cor: '#888' }
                  return (
                    <div key={r.id} className="be-resg-row">
                      <span style={{ fontSize: 18 }}>{r.itemEmoji}</span>
                      <span className="nm">{r.itemNome}</span>
                      <span className="be-tnum" style={{ fontSize: 12, color: '#B8860B', fontWeight: 800 }}>🪙 {num(r.custo)}</span>
                      <span className="be-st" style={{ color: st.cor, background: st.cor + '22' }}>{st.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Ranking do time */}
        <section>
          <h2 className="be-sec-title">Ranking de {mesNome}</h2>
          {ranking.length === 0 ? (
            <div className="be-state" style={{ minHeight: 120 }}>Nenhum funcionário neste mês.</div>
          ) : (
            <div className="be-list">
              {ranking.map((f) => {
                const eu = f.funcionarioId === meu?.funcionarioId
                const mc = f.posicao && f.posicao <= 3 ? MEDAL[f.posicao] : ''
                return (
                  <div key={f.funcionarioId} className={'be-row' + (eu ? ' eu' : '')}>
                    <div className={'be-pos ' + mc}>{f.posicao}º</div>
                    <div className="name">
                      <div className="n">{f.nome}{eu && <span className="tag"> · você</span>}</div>
                    </div>
                    <div className="tot be-tnum">{brl(f.totalRs)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Reconhecer um colega */}
        {colegas.length > 0 && <SecaoReconhecer token={token} colegas={colegas} reconhecimento={reconhecimento} onFeito={() => carregar(true)} setAviso={setAviso} />}

        {/* Fale com a liderança (Ouvidoria) */}
        <SecaoOuvidoria token={token} ouvidoria={ouvidoria} onFeito={() => carregar(true)} setAviso={setAviso} />

        <footer className="be-foot">Feito por Agência Na Chapa 🚀</footer>

      </main>

      {/* Confirmar resgate */}
      {confirmar && (
        <div className="be-ov" onClick={() => !resgatando && setConfirmar(null)}>
          <div className="be-dlg" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>{confirmar.emoji}</div>
            <h3>Resgatar {confirmar.nome}?</h3>
            <p>Vão sair <b className="be-tnum">🪙 {num(confirmar.custo)} Coins</b> do seu saldo. A liderança avalia e te entrega o prêmio.</p>
            <div className="be-dlg-row">
              <button type="button" className="no" onClick={() => setConfirmar(null)} disabled={resgatando}>Cancelar</button>
              <button type="button" className="ok" onClick={resgatar} disabled={resgatando}>{resgatando ? 'Resgatando…' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso pós-ação */}
      {aviso && (
        <div className="be-ov" onClick={() => setAviso(null)}>
          <div className="be-dlg" onClick={(e) => e.stopPropagation()}>
            <p style={{ marginBottom: 16 }}>{aviso}</p>
            <div className="be-dlg-row"><button type="button" className="ok" onClick={() => setAviso(null)}>Ok</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Reconhecer um colega (peer kudos) — envia p/ aprovação da liderança. (Bloco 4) */
function SecaoReconhecer({ token, colegas, reconhecimento, onFeito, setAviso }) {
  const [para, setPara] = useState('')
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const r = reconhecimento || { maxMes: 3, coins: 10, enviadosMes: 0, recebidos: [], enviados: [] }
  const restam = Math.max(0, (r.maxMes || 0) - (r.enviadosMes || 0))
  async function enviar() {
    if (!para) { setAviso('Escolha um colega.'); return }
    if (!msg.trim()) { setAviso('Escreva um motivo.'); return }
    setEnviando(true)
    try {
      await api.post(`/public/eu/${token}/reconhecer`, { paraFuncionarioId: Number(para), mensagem: msg })
      setPara(''); setMsg(''); setAviso('Reconhecimento enviado! A liderança vai aprovar. 🙌'); onFeito()
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível enviar.') }
    finally { setEnviando(false) }
  }
  return (
    <section>
      <h2 className="be-sec-title">Reconhecer um colega</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Valorize quem te ajudou. Ao aprovar, o colega ganha <b>🪙 {r.coins} Coins</b>. Você tem <b>{restam}</b> de {r.maxMes} este mês.</p>
        {restam > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <select className="be-input" value={para} onChange={(e) => setPara(e.target.value)}>
              <option value="">Escolha o colega…</option>
              {colegas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <textarea className="be-input" rows={2} placeholder="Por que você reconhece esse colega?" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button type="button" className="be-btn" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar reconhecimento'}</button>
          </div>
        ) : <div className="be-emptybox">Você já usou seus reconhecimentos deste mês. 🙌</div>}
        {r.recebidos.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="be-mini-title">Você foi reconhecido por</div>
            {r.recebidos.map((x) => (
              <div key={x.id} className="be-rec-row">
                <span className="be-rec-de">{x.de}</span>
                <span className="be-rec-msg">“{x.mensagem}”</span>
                <span className="be-rec-st" style={{ color: x.status === 'APROVADO' ? 'var(--money)' : x.status === 'REJEITADO' ? '#dc2626' : 'var(--muted)' }}>{x.status === 'APROVADO' ? `🪙 ${x.coins}` : x.status === 'PENDENTE' ? 'aguardando' : 'não aprovado'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* Fale com a liderança (Ouvidoria / Sugestões), opc. anônimo. (Bloco 4) */
const OUV_TIPOS_PUB = [['SUGESTAO', 'Sugestão'], ['ELOGIO', 'Elogio'], ['RECLAMACAO', 'Reclamação'], ['DENUNCIA', 'Denúncia'], ['OUTRO', 'Outro']]
function SecaoOuvidoria({ token, ouvidoria, onFeito, setAviso }) {
  const [tipo, setTipo] = useState('SUGESTAO')
  const [msg, setMsg] = useState('')
  const [anonimo, setAnonimo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    if (!msg.trim()) { setAviso('Escreva sua mensagem.'); return }
    setEnviando(true)
    try {
      await api.post(`/public/eu/${token}/ouvidoria`, { tipo, mensagem: msg, anonimo })
      setMsg(''); setAviso('Mensagem enviada! 💬'); onFeito()
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível enviar.') }
    finally { setEnviando(false) }
  }
  return (
    <section>
      <h2 className="be-sec-title">Fale com a liderança</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Sugestões, elogios, reclamações ou denúncias. Marque <b>anônimo</b> se preferir não se identificar.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <select className="be-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {OUV_TIPOS_PUB.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <textarea className="be-input" rows={3} placeholder="Escreva sua mensagem…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} /> Enviar como anônimo 🕶️
          </label>
          <button type="button" className="be-btn" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar mensagem'}</button>
        </div>
        {ouvidoria.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="be-mini-title">Suas mensagens</div>
            {ouvidoria.map((o) => (
              <div key={o.id} className="be-ouv-row">
                <div className="be-ouv-msg">{o.mensagem}</div>
                {o.resposta && <div className="be-ouv-resp"><b>Resposta:</b> {o.resposta}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
