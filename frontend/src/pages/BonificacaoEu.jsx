// ÁREA DO COLABORADOR (link privado, sem login — abre por token secreto).
// Mini-app com abas na base: Início (desempenho do mês, sem ranking dos colegas),
// Ponto (minhas marcações), Prêmios (Coins/conquistas/mercado) e Voz (reconhecer/ouvidoria).
// CSS escopado em .be-root. NÃO expõe a pontuação dos colegas (evita comparação).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
const num = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0))
const MEDAL = { 1: 'g1', 2: 'g2', 3: 'g3' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const RAR = {
  COMUM: { label: 'Comum', cor: '#64748b' },
  RARO: { label: 'Raro', cor: '#eab802' },
  EPICO: { label: 'Épico', cor: '#8b5cf6' },
  LENDARIO: { label: 'Lendário', cor: '#f59e0b' },
}
const STAT = {
  PENDENTE: { label: 'Pendente', cor: '#b45309' },
  APROVADO: { label: 'Aprovado', cor: '#a17c00' },
  ENTREGUE: { label: 'Entregue', cor: '#0F8A54' },
  REJEITADO: { label: 'Rejeitado', cor: '#dc2626' },
}
const SIT = {
  ok: { l: 'No horário', c: '#0F8A54' },
  atraso: { l: 'Atraso', c: '#d97706' },
  falta: { l: 'Falta', c: '#dc2626' },
  incompleto: { l: 'Sem saída', c: '#b45309' },
  folga_trabalhada: { l: 'Folga trabalhada', c: '#2563eb' },
  trabalhado: { l: 'Trabalhado', c: '#2563eb' },
}
const OUV_TIPOS_PUB = [['SUGESTAO', 'Sugestão'], ['ELOGIO', 'Elogio'], ['RECLAMACAO', 'Reclamação'], ['DENUNCIA', 'Denúncia'], ['OUTRO', 'Outro']]
const TABS = [['inicio', 'Início', '🏠'], ['ponto', 'Ponto', '🕐'], ['premios', 'Prêmios', '🎁'], ['voz', 'Voz', '💬']]

const CSS = `
.be-root{--bg:#F4EFE7;--surface:#FFFFFF;--surface-2:#FAF6EF;--ink:#211913;--ink-soft:#4E4339;--muted:#8C7C6D;--line:#EAE0D3;--brand:#E85D1B;--brand-deep:#B8430E;--brand-tint:#FBEADF;--money:#0F8A54;--gold:#E0A21A;--silver:#94A0AC;--bronze:#BE7043;--sh-sm:0 1px 2px rgba(46,32,18,.06);--sh-md:0 3px 8px rgba(46,32,18,.06),0 16px 34px rgba(46,32,18,.08);--rd:18px;
  min-height:100dvh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.45}
@media (prefers-color-scheme:dark){.be-root{--bg:#140E08;--surface:#20180F;--surface-2:#1A130C;--ink:#F4EBE1;--ink-soft:#D8CABB;--muted:#A5937F;--line:#332619;--brand:#FB7A3B;--brand-deep:#E85D1B;--brand-tint:#38220F;--money:#3FBE82;--gold:#E7B23E;--sh-sm:0 1px 2px rgba(0,0,0,.4);--sh-md:0 3px 8px rgba(0,0,0,.4),0 18px 36px rgba(0,0,0,.5)}}
.be-root *{box-sizing:border-box}
.be-app{max-width:480px;margin:0 auto;min-height:100dvh;position:relative;display:flex;flex-direction:column}
.be-tnum{font-variant-numeric:tabular-nums}

/* Hero */
.be-hero{position:sticky;top:0;z-index:20;background:linear-gradient(150deg,#F0692A 0%,#D24A12 55%,#A63A0C 100%);color:#fff;padding:14px 18px 18px;border-radius:0 0 24px 24px;box-shadow:0 10px 26px rgba(150,58,12,.28)}
.be-hero-loja{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.9)}
.be-hero-loja .lg{width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.22);display:grid;place-items:center;font-size:12px;font-weight:800;overflow:hidden}
.be-hero-loja .lg img{width:100%;height:100%;object-fit:cover}
.be-hero-main{display:flex;align-items:center;gap:13px;margin-top:12px}
.be-avatar{width:52px;height:52px;border-radius:16px;flex-shrink:0;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.35);display:grid;place-items:center;font-size:22px;font-weight:850;color:#fff}
.be-hero-id{min-width:0}
.be-hero-id .oi{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72)}
.be-hero-id h1{font-size:23px;font-weight:850;letter-spacing:-.02em;margin:1px 0;text-wrap:balance;line-height:1.1}
.be-hero-id .fx{font-size:12.5px;color:rgba(255,255,255,.8);font-weight:600}
.be-hero-chips{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.be-chip{display:inline-flex;align-items:baseline;gap:5px;font-size:15px;font-weight:850;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);color:#fff}
.be-chip small{font-size:10px;font-weight:700;opacity:.82;text-transform:uppercase;letter-spacing:.04em}
.be-chip.gold{background:linear-gradient(135deg,#FBD24E,#E0A21A);color:#4A2F00;border:none;box-shadow:0 3px 10px rgba(0,0,0,.15)}
.be-chip.gold small{opacity:.7}

/* Corpo + abas */
.be-body{flex:1;padding:18px 16px calc(88px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px}
.be-tabs{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;z-index:30;display:flex;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 20px rgba(46,32,18,.08);padding:7px 6px calc(7px + env(safe-area-inset-bottom,0px))}
.be-tab{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:13px;color:var(--muted);font-family:inherit}
.be-tab .ic{font-size:20px;line-height:1;filter:grayscale(.4);opacity:.7;transition:.15s}
.be-tab .lb{font-size:10.5px;font-weight:750}
.be-tab.on{color:var(--brand-deep)}
.be-tab.on .ic{filter:none;opacity:1;transform:translateY(-1px)}
.be-tab.on{background:var(--brand-tint)}

.be-sec-title{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:11px;display:flex;align-items:center;gap:7px}
.be-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:18px;box-shadow:var(--sh-sm)}
.be-b{font-weight:700;color:var(--ink)}
.be-hint{font-size:12px;color:var(--muted);margin-top:12px;line-height:1.5}
.be-hint b{color:var(--brand-deep)}
.be-empty{text-align:center;padding:26px 16px;color:var(--muted);font-size:13px;background:var(--surface);border:1px dashed var(--line);border-radius:var(--rd)}
.be-emptybox{text-align:center;padding:10px 0 4px;color:var(--muted);font-size:13px}
.be-state{min-height:70vh;display:grid;place-items:center;text-align:center;color:var(--muted);padding:24px}

/* Resultado do mês */
.be-mhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.be-mhead .mtot{text-align:right}
.be-mhead .mtot .k{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.be-mhead .mtot .v{font-size:27px;font-weight:850;letter-spacing:-.02em;color:var(--money);line-height:1}
.be-rank-pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;padding:7px 13px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line)}
.be-rank-pill .m{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:850;color:#fff;background:var(--muted)}
.be-rank-pill.g1 .m{background:linear-gradient(150deg,#F3B53C,var(--gold))}
.be-rank-pill.g2 .m{background:linear-gradient(150deg,#AEB8C2,var(--silver))}
.be-rank-pill.g3 .m{background:linear-gradient(150deg,#D08A54,var(--bronze))}
.be-rank-pill .of{color:var(--muted);font-weight:650;font-size:12px}
.be-el{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px dashed var(--line);font-size:13.5px}
.be-el .l{color:var(--ink-soft)} .be-el .l small{color:var(--muted)}
.be-el .r{font-weight:750;color:var(--money)}
.be-el.zero .r{color:var(--muted);font-weight:650}
.be-idx{margin-top:14px;padding:13px;border-radius:14px;background:var(--brand-tint);border:1px solid rgba(232,93,27,.18)}
.be-idx-top{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:800;color:var(--brand-deep)}
.be-idx-top b{font-size:18px}
.be-idx-bar{height:9px;border-radius:999px;background:rgba(232,93,27,.14);overflow:hidden;margin-top:8px}
.be-idx-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--brand),var(--brand-deep))}
.be-idx-sub{font-size:11px;color:var(--brand-deep);opacity:.8;margin-top:7px;font-weight:600}

/* Ponto */
.be-ptres{display:flex;gap:8px;margin-bottom:12px}
.be-ptres-c{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:11px 8px;text-align:center;box-shadow:var(--sh-sm)}
.be-ptres-c .n{font-size:22px;font-weight:850;line-height:1}
.be-ptres-c .l{font-size:10.5px;color:var(--muted);font-weight:700;margin-top:3px;text-transform:uppercase;letter-spacing:.03em}
.be-pt{display:flex;flex-direction:column;gap:7px}
.be-pt-row{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:10px 13px;box-shadow:var(--sh-sm)}
.be-pt-day{width:44px;flex-shrink:0;text-align:center}
.be-pt-day .d{font-size:17px;font-weight:850;line-height:1}
.be-pt-day .w{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase}
.be-pt-hrs{flex:1;display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px}
.be-pt-hrs .ar{color:var(--muted);font-weight:600}
.be-pt-hrs .none{color:var(--muted);font-weight:600;font-size:13px}
.be-pt-st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:4px 9px;border-radius:999px;white-space:nowrap;flex-shrink:0}

/* Evolução */
.be-hist{display:flex;gap:6px;align-items:flex-end;margin-top:8px}
.be-hist-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.be-hist-val{font-size:10px;color:var(--muted);font-weight:700;white-space:nowrap}
.be-hist-bar{width:100%;max-width:42px;height:72px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px 8px 4px 4px;display:flex;align-items:flex-end;overflow:hidden}
.be-hist-bar i{display:block;width:100%;background:linear-gradient(180deg,var(--brand),var(--brand-deep));border-radius:6px 6px 0 0;min-height:3px}
.be-hist-lbl{font-size:10.5px;color:var(--ink-soft);font-weight:650;text-align:center}
.be-hist-pos{color:var(--gold);font-weight:800}

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
.be-ach-prog i{display:block;height:100%;background:var(--brand)}
.be-ach-meta{font-size:10.5px;color:var(--muted);font-weight:600;margin-top:3px}

/* Carteira / Mercado */
.be-wallet{background:radial-gradient(120% 120% at 85% -10%,rgba(224,162,26,.28),transparent 55%),linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--sh-md);text-align:center}
.be-wallet .big{font-size:38px;font-weight:850;letter-spacing:-.02em;line-height:1}
.be-wallet .lbl{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin-top:2px}
.be-wallet .sub{font-size:12.5px;color:var(--muted);margin-top:8px}
.be-coins{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#FBD24E,#E0A21A);color:#4A2F00;font-weight:850;border-radius:999px;padding:6px 13px;font-size:14px;box-shadow:var(--sh-sm)}
.be-shop{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.be-shop-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:5px}
.be-shop-emo{font-size:30px;line-height:1}
.be-shop-nm{font-size:13.5px;font-weight:800;line-height:1.15}
.be-shop-ds{font-size:11px;color:var(--muted);line-height:1.35;flex:1}
.be-shop-cost{font-size:14px;font-weight:850;color:var(--gold);margin-top:2px}
.be-shop-btn{margin-top:5px;border:none;border-radius:10px;padding:8px;font-size:12.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#fff}
.be-shop-btn:disabled{background:var(--surface-2);color:var(--muted);border:1px solid var(--line);cursor:not-allowed}
.be-resg{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.be-resg-row{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;box-shadow:var(--sh-sm)}
.be-resg-row .nm{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.be-st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px;white-space:nowrap}

/* Voz (formulários) */
.be-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:11px;padding:11px 12px;outline:none}
.be-input:focus{border-color:var(--brand)}
.be-btn{width:100%;font-family:inherit;font-size:14.5px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-deep));border:none;border-radius:12px;padding:12px 18px;cursor:pointer;box-shadow:var(--sh-sm)}
.be-btn:disabled{opacity:.55;cursor:default}
.be-mini-title{font-size:12px;font-weight:800;color:var(--muted);margin-bottom:7px;text-transform:uppercase;letter-spacing:.03em}
.be-rec-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px dashed var(--line);font-size:13px}
.be-rec-de{font-weight:750;flex-shrink:0}
.be-rec-msg{color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.be-rec-st{font-weight:750;flex-shrink:0;font-size:12.5px}
.be-ouv-row{padding:9px 0;border-top:1px dashed var(--line)}
.be-ouv-msg{font-size:13px;color:var(--ink);white-space:pre-wrap}
.be-ouv-resp{margin-top:5px;padding:7px 10px;background:rgba(15,138,84,.1);border-radius:9px;font-size:12.5px;color:var(--ink-soft)}

/* Diálogos */
.be-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px;z-index:60}
.be-dlg{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;max-width:340px;width:100%;box-shadow:var(--sh-md);text-align:center}
.be-dlg h3{font-size:17px;font-weight:850;margin-bottom:6px}
.be-dlg p{font-size:13px;color:var(--ink-soft);line-height:1.5;margin-bottom:16px}
.be-dlg-row{display:flex;gap:9px}
.be-dlg-row button{flex:1;border-radius:11px;padding:11px;font-size:13.5px;font-weight:800;cursor:pointer;border:1px solid var(--line)}
.be-dlg-row .ok{border:none;background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#fff}
.be-dlg-row .no{background:var(--surface-2);color:var(--ink-soft)}
.be-dlg-row button:disabled{opacity:.6;cursor:not-allowed}
`

export default function BonificacaoEu() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [confirmar, setConfirmar] = useState(null) // item a resgatar
  const [dataFolga, setDataFolga] = useState('')   // data desejada quando o item é FOLGA
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
    if (confirmar.tipo === 'FOLGA' && !dataFolga) { setAviso('Escolha a data desejada para a folga.'); return }
    setResgatando(true)
    try {
      await api.post(`/public/eu/${token}/resgatar`, { itemId: confirmar.id, dataDesejada: confirmar.tipo === 'FOLGA' ? dataFolga : undefined })
      setConfirmar(null); setDataFolga(''); setAviso('Resgate solicitado! A liderança vai avaliar e te entregar o prêmio. 🎉')
      carregar(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível resgatar.'); setConfirmar(null); setDataFolga('') }
    finally { setResgatando(false) }
  }

  if (loading && !data) return <div className="be-root"><style>{CSS}</style><div className="be-state">Carregando…</div></div>
  if (erro) return <div className="be-root"><style>{CSS}</style><div className="be-state">{erro}</div></div>

  const d = data || {}
  const { loja, funcionario, meu, conquistas = [], conquistasResumo = { total: 0, desbloqueadas: 0 }, coins, moedas = 0, mercado = [], meusResgates = [], colegas = [], reconhecimento = null, ouvidoria = [], contribuicoes = [], historico = [], ponto = null, totalEquipe = 0, ano, mes } = d
  const saldoCoins = Number(coins ?? moedas ?? 0)
  const primeiro = (funcionario?.nome || 'você').split(' ')[0]
  const inicial = (funcionario?.nome || 'C').charAt(0).toUpperCase()

  return (
    <div className="be-root">
      <style>{CSS}</style>
      <div className="be-app">
        <header className="be-hero">
          <span className="be-hero-loja"><span className="lg">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</span>{loja?.nome}</span>
          <div className="be-hero-main">
            <div className="be-avatar">{inicial}</div>
            <div className="be-hero-id">
              <div className="oi">Área do colaborador</div>
              <h1>Olá, {primeiro} 👋</h1>
              {funcionario?.funcao && <div className="fx">{funcionario.funcao}</div>}
            </div>
          </div>
          <div className="be-hero-chips">
            <span className="be-chip gold be-tnum">🪙 {num(saldoCoins)} <small>Coins</small></span>
            {meu?.indice != null && <span className="be-chip be-tnum">⭐ {meu.indice}% <small>Índice</small></span>}
          </div>
        </header>

        <main className="be-body">
          {tab === 'inicio' && <TabInicio meu={meu} totalEquipe={totalEquipe} historico={historico} contribuicoes={contribuicoes} mes={mes} ano={ano} />}
          {tab === 'ponto' && <TabPonto ponto={ponto} ano={ano} mes={mes} />}
          {tab === 'premios' && <TabPremios saldoCoins={saldoCoins} conquistas={conquistas} conquistasResumo={conquistasResumo} mercado={mercado} meusResgates={meusResgates} onResgatar={setConfirmar} />}
          {tab === 'voz' && <TabVoz token={token} colegas={colegas} reconhecimento={reconhecimento} ouvidoria={ouvidoria} onFeito={() => carregar(true)} setAviso={setAviso} />}
        </main>

        <nav className="be-tabs">
          {TABS.map(([id, label, ic]) => (
            <button key={id} type="button" className={'be-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
              <span className="ic">{ic}</span><span className="lb">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Confirmar resgate */}
      {confirmar && (
        <div className="be-ov" onClick={() => !resgatando && (setConfirmar(null), setDataFolga(''))}>
          <div className="be-dlg" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>{confirmar.emoji}</div>
            <h3>Resgatar {confirmar.nome}?</h3>
            <p>Vão sair <b className="be-tnum">🪙 {num(confirmar.custo)} Coins</b> do seu saldo. A liderança avalia e te entrega o prêmio.</p>
            {confirmar.tipo === 'FOLGA' && (
              <div style={{ margin: '4px 0 14px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>Data desejada para a folga 🏖️</label>
                <input type="date" className="be-input" value={dataFolga} onChange={(e) => setDataFolga(e.target.value)} />
              </div>
            )}
            <div className="be-dlg-row">
              <button type="button" className="no" onClick={() => { setConfirmar(null); setDataFolga('') }} disabled={resgatando}>Cancelar</button>
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

/* ══════════ ABA: INÍCIO ══════════ */
function TabInicio({ meu, totalEquipe, historico, contribuicoes, mes, ano }) {
  const mesNome = new Date(ano, (mes || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  const pos = meu?.posicao
  const medalCls = pos && pos <= 3 ? MEDAL[pos] : ''
  const idx = meu?.indice != null ? Math.max(0, Math.min(100, Number(meu.indice))) : null
  return (
    <>
      <section>
        <h2 className="be-sec-title">🗓️ Seu {mesNome}</h2>
        <div className="be-card">
          <div className="be-mhead">
            {pos ? (
              <span className={'be-rank-pill ' + medalCls}><span className="m be-tnum">{pos}</span>{pos}º <span className="of">de {totalEquipe}</span></span>
            ) : <span className="be-rank-pill">Sem posição ainda</span>}
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
              {idx != null && (
                <div className="be-idx">
                  <div className="be-idx-top"><span>⭐ Índice de Excelência</span><b className="be-tnum">{meu.indice}%</b></div>
                  <div className="be-idx-bar"><i style={{ width: idx + '%' }} /></div>
                  <div className="be-idx-sub">50% Assiduidade + 35% Desempenho + 15% Contribuições · define o Destaque do mês</div>
                </div>
              )}
            </>
          ) : (
            <div className="be-emptybox">Seu resultado deste mês ainda não foi lançado. 😉</div>
          )}
          <p className="be-hint">Só você vê esta tela — a pontuação dos colegas não aparece aqui. A cada fechamento você ganha <b>🪙 Coins</b> pra trocar por prêmios. 🚀</p>
        </div>
      </section>

      {contribuicoes.length > 0 && (
        <section>
          <h2 className="be-sec-title">🌟 Suas contribuições do mês</h2>
          <div className="be-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contribuicoes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--money)', fontWeight: 800, flexShrink: 0 }}>+{c.pontos}pt</span>
                {c.coins > 0 && <span className="be-coins" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}>🪙 {c.coins}</span>}
                <span style={{ color: 'var(--ink-soft)' }}>{c.descricao}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {historico.length > 1 && <SecaoHistorico historico={historico} />}
    </>
  )
}

/* ══════════ ABA: PONTO ══════════ */
function TabPonto({ ponto, ano, mes }) {
  const marc = ponto?.marcacoes || []
  const res = ponto?.resumo || { diasTrabalhados: 0, atrasos: 0, faltas: 0 }
  const mesNome = new Date(ano, (mes || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return (
    <section>
      <h2 className="be-sec-title">🕐 Minhas marcações · {mesNome}</h2>
      <div className="be-ptres">
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: 'var(--money)' }}>{res.diasTrabalhados}</div><div className="l">dias</div></div>
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: '#d97706' }}>{res.atrasos}</div><div className="l">atrasos</div></div>
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: '#dc2626' }}>{res.faltas}</div><div className="l">faltas</div></div>
      </div>
      {marc.length === 0 ? (
        <div className="be-empty">Nenhuma marcação registrada neste mês ainda.</div>
      ) : (
        <div className="be-pt">
          {marc.map((m) => {
            const st = SIT[m.situacao] || { l: m.situacao, c: 'var(--muted)' }
            const label = m.situacao === 'atraso' && m.atrasoMin > 0 ? `Atraso ${m.atrasoMin}min` : st.l
            return (
              <div key={m.dia} className="be-pt-row">
                <div className="be-pt-day"><div className="d be-tnum">{String(m.dia).padStart(2, '0')}</div><div className="w">{DOW[m.dow]}</div></div>
                <div className="be-pt-hrs">
                  {m.entrada ? <><span className="be-tnum">{m.entrada}</span><span className="ar">→</span><span className="be-tnum">{m.saida || '--:--'}</span></> : <span className="none">Sem batida</span>}
                </div>
                <span className="be-pt-st" style={{ color: st.c, background: st.c + '1f' }}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
      <p className="be-hint">Entrada e saída de cada dia, do jeito que o ponto registrou. Algo errado? Fale com a liderança na aba <b>Voz</b>.</p>
    </section>
  )
}

/* ══════════ ABA: PRÊMIOS ══════════ */
function TabPremios({ saldoCoins, conquistas, conquistasResumo, mercado, meusResgates, onResgatar }) {
  return (
    <>
      <section>
        <div className="be-wallet">
          <div className="big be-tnum">🪙 {num(saldoCoins)}</div>
          <div className="lbl">Coins disponíveis</div>
          <div className="sub">Junte Coins a cada fechamento e por conquistas, e troque por prêmios no mercado 🎁</div>
        </div>
      </section>

      {conquistas.length > 0 && (
        <section>
          <h2 className="be-sec-title">🏅 Conquistas · {conquistasResumo.desbloqueadas}/{conquistasResumo.total}</h2>
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

      {mercado.length > 0 && (
        <section>
          <h2 className="be-sec-title">🎁 Mercado de prêmios</h2>
          <div className="be-shop">
            {mercado.map((i) => {
              const podeResgatar = !i.esgotado && saldoCoins >= i.custo
              return (
                <div key={i.id} className="be-shop-card">
                  <span className="be-shop-emo">{i.emoji}</span>
                  <div className="be-shop-nm">{i.nome}{i.tipo === 'FOLGA' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-deep)', marginLeft: 4 }}>🏖️ folga</span>}</div>
                  {i.descricao && <div className="be-shop-ds">{i.descricao}</div>}
                  <div className="be-shop-cost be-tnum">🪙 {num(i.custo)}</div>
                  <button type="button" className="be-shop-btn" disabled={!podeResgatar} onClick={() => onResgatar(i)}>
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
                    <span className="nm">{r.itemNome}{r.tipoItem === 'FOLGA' && r.dataDesejada && <span style={{ fontSize: 11, color: 'var(--brand-deep)', fontWeight: 700, marginLeft: 6 }}>🏖️ {new Date(r.dataDesejada).toLocaleDateString('pt-BR')}</span>}</span>
                    <span className="be-tnum" style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 800 }}>🪙 {num(r.custo)}</span>
                    <span className="be-st" style={{ color: st.cor, background: st.cor + '22' }}>{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}

/* ══════════ ABA: VOZ (reconhecer + ouvidoria) ══════════ */
function TabVoz({ token, colegas, reconhecimento, ouvidoria, onFeito, setAviso }) {
  return (
    <>
      {colegas.length > 0 && <SecaoReconhecer token={token} colegas={colegas} reconhecimento={reconhecimento} onFeito={onFeito} setAviso={setAviso} />}
      <SecaoOuvidoria token={token} ouvidoria={ouvidoria} onFeito={onFeito} setAviso={setAviso} />
    </>
  )
}

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
      <h2 className="be-sec-title">🙌 Reconhecer um colega</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Valorize quem te ajudou. Ao aprovar, o colega ganha <b>🪙 {r.coins} Coins</b>. Você tem <b>{restam}</b> de {r.maxMes} este mês.</p>
        {restam > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
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
      <h2 className="be-sec-title">💬 Fale com a liderança</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Sugestões, elogios, reclamações ou denúncias. Marque <b>anônimo</b> se preferir não se identificar.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
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

/* Comparação pessoal entre ciclos — evolução do prêmio nos últimos meses. */
function SecaoHistorico({ historico }) {
  const max = Math.max(1, ...historico.map((h) => Number(h.totalRs) || 0))
  const ult = historico[historico.length - 1]
  const penult = historico[historico.length - 2]
  const delta = ult && penult ? (Number(ult.totalRs) || 0) - (Number(penult.totalRs) || 0) : 0
  return (
    <section>
      <h2 className="be-sec-title">📈 Sua evolução</h2>
      <div className="be-card">
        {penult && (
          <p className="be-hint" style={{ marginTop: 0 }}>
            {delta > 0 ? <>📈 Seu prêmio <b>subiu {brl(delta)}</b> vs. o mês anterior. Mandou bem!</>
              : delta < 0 ? <>📉 Seu prêmio caiu {brl(Math.abs(delta))} vs. o mês anterior. Bora recuperar! 💪</>
                : <>➡️ Seu prêmio ficou estável vs. o mês anterior.</>}
          </p>
        )}
        <div className="be-hist">
          {historico.map((h, i) => {
            const v = Number(h.totalRs) || 0
            return (
              <div key={i} className="be-hist-col">
                <div className="be-hist-val be-tnum">{v > 0 ? brl(v).replace('R$', '').trim() : '—'}</div>
                <div className="be-hist-bar"><i style={{ height: `${Math.round((v / max) * 100)}%` }} /></div>
                <div className="be-hist-lbl">{MES_CURTO[(h.mes || 1) - 1]}{h.posicao ? <span className="be-hist-pos"> · {h.posicao}º</span> : ''}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
