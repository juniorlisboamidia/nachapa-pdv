// ÁREA DO COLABORADOR — login por WhatsApp (OTP) + mini-app com abas na base:
// Início (desempenho do mês, sem ranking dos colegas), Ponto (minhas marcações),
// Prêmios (Coins/conquistas/mercado) e Sugestões (reconhecer/ouvidoria).
// Acesso pelo link da loja /colaborador/:slug; sessão de ~30 dias no aparelho.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { colabApi, COLAB_TOKEN_KEY } from '../services/api'
import { comprimirFoto } from '../lib/comprimirFoto'

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
const CL_STATUS = { EM_ANDAMENTO: { label: 'Em andamento', cor: '#d97706' }, CONCLUIDA: { label: 'Concluído', cor: '#0F8A54' } }
const TABS = [['inicio', 'Início', '🏠'], ['ponto', 'Ponto', '🕐'], ['checklists', 'Checklists', '✅'], ['premios', 'Prêmios', '🎁'], ['voz', 'Sugestões', '💬']]

const CSS = `
.be-root{--bg:#F4F1EA;--surface:#FFFFFF;--surface-2:#EFEADF;--ink:#0E1319;--ink-soft:#474D55;--muted:#8A8E94;--line:#E5DFD2;--brand:#EAB802;--brand-deep:#C79A05;--brand-tint:#FBF2CC;--money:#0F8A54;--gold:#EAB802;--gold-text:#8A6A00;--silver:#94A0AC;--bronze:#BE7043;--dark:#0E1319;--sh-sm:0 1px 2px rgba(14,19,25,.06);--sh-md:0 3px 8px rgba(14,19,25,.07),0 16px 34px rgba(14,19,25,.08);--rd:18px;
  min-height:100dvh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.45}
@media (prefers-color-scheme:dark){.be-root{--bg:#0E1319;--surface:#171E27;--surface-2:#121821;--ink:#F3EEE3;--ink-soft:#CFC9BD;--muted:#8F97A1;--line:#28313C;--brand:#EAB802;--brand-deep:#C79A05;--brand-tint:#2C2A14;--money:#3FBE82;--gold:#F0C42E;--gold-text:#F0C42E;--sh-sm:0 1px 2px rgba(0,0,0,.4);--sh-md:0 3px 8px rgba(0,0,0,.4),0 18px 36px rgba(0,0,0,.5)}}
.be-root *{box-sizing:border-box}
.be-app{max-width:480px;margin:0 auto;min-height:100dvh;position:relative;display:flex;flex-direction:column}
.be-tnum{font-variant-numeric:tabular-nums}

/* Hero */
.be-hero{position:sticky;top:0;z-index:20;color:#fff;padding:16px 20px 18px;border-radius:0 0 26px 26px;background:radial-gradient(120% 80% at 86% -12%,rgba(234,184,2,.20),transparent 58%),linear-gradient(165deg,#1B2532 0%,#0E1319 62%);box-shadow:0 12px 30px rgba(14,19,25,.32)}
.be-hero-loja{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:750;color:rgba(255,255,255,.9)}
.be-hero-loja .lg{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,#F5CE3A,#EAB802);display:grid;place-items:center;font-size:12px;font-weight:850;color:#0E1319;overflow:hidden}
.be-hero-loja .lg img{width:100%;height:100%;object-fit:cover}
.be-hero-main{display:flex;align-items:center;gap:14px;margin-top:16px}
.be-avatar{width:54px;height:54px;border-radius:16px;flex-shrink:0;background:linear-gradient(145deg,#F5CE3A,#E0A800);display:grid;place-items:center;font-size:23px;font-weight:850;color:#0E1319;box-shadow:0 6px 16px rgba(234,184,2,.28)}
.be-hero-id{min-width:0}
.be-hero-id .oi{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.be-hero-id h1{font-size:24px;font-weight:850;letter-spacing:-.02em;margin:2px 0 1px;text-wrap:balance;line-height:1.08;color:#fff}
.be-hero-id .fx{font-size:12.5px;color:rgba(255,255,255,.66);font-weight:600}
.be-hero-stats{display:flex;align-items:stretch;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1)}
.be-stat{flex:1;text-align:center}
.be-stat .v{font-size:20px;font-weight:850;letter-spacing:-.01em;line-height:1}
.be-stat.coins .v{color:var(--gold)}
.be-stat .k{font-size:10px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:3px}
.be-stat-div{width:1px;background:rgba(255,255,255,.12);margin:2px 0}

/* Corpo + abas */
.be-body{flex:1;padding:18px 16px calc(88px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px}
.be-tabs{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;z-index:30;display:flex;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 20px rgba(46,32,18,.08);padding:7px 6px calc(7px + env(safe-area-inset-bottom,0px))}
.be-tab{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:13px;color:var(--muted);font-family:inherit}
.be-tab .ic{font-size:20px;line-height:1;filter:grayscale(.4);opacity:.7;transition:.15s}
.be-tab .lb{font-size:10.5px;font-weight:750}
.be-tab.on{color:var(--ink)}
.be-tab.on .ic{filter:none;opacity:1;transform:translateY(-1px)}
.be-tab.on{background:var(--brand-tint)}

.be-sec-title{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:11px;display:flex;align-items:center;gap:7px}
.be-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--rd);padding:18px;box-shadow:var(--sh-sm)}
.be-b{font-weight:700;color:var(--ink)}
.be-hint{font-size:12px;color:var(--muted);margin-top:12px;line-height:1.5}
.be-hint b{color:var(--ink)}
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
.be-idx{margin-top:14px;padding:13px;border-radius:14px;background:var(--brand-tint);border:1px solid rgba(234,184,2,.32)}
.be-idx-top{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:800;color:var(--ink)}
.be-idx-top b{font-size:18px}
.be-idx-bar{height:9px;border-radius:999px;background:rgba(234,184,2,.2);overflow:hidden;margin-top:8px}
.be-idx-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#F2C63A,var(--brand))}
.be-idx-sub{font-size:11px;color:var(--ink-soft);margin-top:7px;font-weight:600}

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

/* Checklists */
.be-cl-row{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:11px 13px;box-shadow:var(--sh-sm);width:100%;text-align:left;cursor:pointer;font-family:inherit;color:inherit}
.be-cl-ic{font-size:19px;flex-shrink:0}
.be-cl-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.be-cl-nm{font-size:13.5px;font-weight:800;color:var(--ink)}
.be-cl-meta{font-size:11px;color:var(--muted);font-weight:650}
.be-cl-arrow{color:var(--muted);font-size:17px;flex-shrink:0}
.be-cl-item{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:var(--sh-sm)}
.be-cl-item-tt{font-weight:750;font-size:13.5px;color:var(--ink);margin-bottom:4px}
.be-cl-item-ds{font-size:11.5px;color:var(--muted);margin-bottom:9px;line-height:1.4}
.be-cl-crit{color:#dc2626;font-weight:800}
.be-cl-warn{font-size:11.5px;color:#dc2626;font-weight:700;margin-top:8px}
.be-cl-dica{font-size:11.5px;color:var(--muted);margin-bottom:9px;line-height:1.4;font-style:italic}
.be-cl-alerta{margin-top:8px;padding:9px 11px;border-radius:11px;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.28);font-size:12px;color:#dc2626;font-weight:650;line-height:1.4}
.be-cl-alerta b{font-weight:850}
.be-cl-tempo{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:750;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:5px 12px;margin-bottom:12px}
.be-cl-check{display:inline-flex;align-items:center;gap:7px;border-radius:11px;padding:9px 16px;font-size:13px;font-weight:800;cursor:pointer;border:1.5px solid var(--line);background:var(--surface-2);color:var(--ink-soft);font-family:inherit}
.be-cl-check.on{border-color:var(--money);background:rgba(15,138,84,.14);color:var(--money)}
.be-cl-stars{display:flex;gap:3px}
.be-cl-star{font-size:24px;background:none;border:none;cursor:pointer;padding:0;color:var(--muted);line-height:1}
.be-cl-star.on{color:var(--gold)}
.be-cl-opts{display:flex;gap:6px;flex-wrap:wrap}
.be-cl-opt{border-radius:999px;padding:7px 14px;font-size:12px;font-weight:750;cursor:pointer;border:1.5px solid var(--line);background:var(--surface-2);color:var(--ink-soft);font-family:inherit}
.be-cl-opt.on{border-color:var(--brand-deep);background:var(--brand-tint);color:var(--brand-deep)}
.be-cl-num{display:flex;align-items:center;gap:8px}
.be-cl-num .be-input{max-width:130px}

/* Evolução */
.be-hist{display:flex;gap:6px;align-items:flex-end;margin-top:8px}
.be-hist-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.be-hist-val{font-size:10px;color:var(--muted);font-weight:700;white-space:nowrap}
.be-hist-bar{width:100%;max-width:42px;height:72px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px 8px 4px 4px;display:flex;align-items:flex-end;overflow:hidden}
.be-hist-bar i{display:block;width:100%;background:linear-gradient(180deg,var(--brand),var(--brand-deep));border-radius:6px 6px 0 0;min-height:3px}
.be-hist-lbl{font-size:10.5px;color:var(--ink-soft);font-weight:650;text-align:center}
.be-hist-pos{color:var(--gold-text);font-weight:800}

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
.be-wallet .lbl{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-text);margin-top:2px}
.be-wallet .sub{font-size:12.5px;color:var(--muted);margin-top:8px}
.be-coins{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#F5CE3A,#EAB802);color:#0E1319;font-weight:850;border-radius:999px;padding:6px 13px;font-size:14px;box-shadow:var(--sh-sm)}
.be-shop{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.be-shop-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:5px}
.be-shop-emo{font-size:30px;line-height:1}
.be-shop-nm{font-size:13.5px;font-weight:800;line-height:1.15}
.be-shop-ds{font-size:11px;color:var(--muted);line-height:1.35;flex:1}
.be-shop-cost{font-size:14px;font-weight:850;color:var(--gold-text);margin-top:2px}
.be-shop-btn{margin-top:5px;border:none;border-radius:10px;padding:8px;font-size:12.5px;font-weight:850;cursor:pointer;background:linear-gradient(135deg,#F2C63A,var(--brand));color:#0E1319}
.be-shop-btn:disabled{background:var(--surface-2);color:var(--muted);border:1px solid var(--line);cursor:not-allowed}
.be-resg{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.be-resg-row{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;box-shadow:var(--sh-sm)}
.be-resg-row .nm{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.be-st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px;white-space:nowrap}

/* Voz (formulários) */
.be-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:11px;padding:11px 12px;outline:none}
.be-input:focus{border-color:var(--brand)}
.be-btn{width:100%;font-family:inherit;font-size:14.5px;font-weight:850;color:#0E1319;background:linear-gradient(135deg,#F2C63A,var(--brand));border:none;border-radius:12px;padding:12px 18px;cursor:pointer;box-shadow:var(--sh-sm)}
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
.be-dlg-row .ok{border:none;background:linear-gradient(135deg,#F2C63A,var(--brand));color:#0E1319}
.be-dlg-row .no{background:var(--surface-2);color:var(--ink-soft)}
.be-dlg-row button:disabled{opacity:.6;cursor:not-allowed}

/* Barra do hero + sair */
.be-hero-bar{display:flex;align-items:center;justify-content:space-between;gap:10px}
.be-sair{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);color:#fff;font-family:inherit;font-size:11.5px;font-weight:750;padding:5px 12px;border-radius:999px;cursor:pointer}
.be-state button{cursor:pointer}
/* Login */
.be-login{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 18px;background:radial-gradient(120% 55% at 50% -5%,rgba(234,184,2,.16),transparent 60%),var(--bg)}
.be-login-card{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:28px 22px;box-shadow:var(--sh-md);text-align:center}
.be-login-logo{width:64px;height:64px;border-radius:18px;margin:0 auto 14px;background:linear-gradient(145deg,#F5CE3A,#E0A800);display:grid;place-items:center;font-size:28px;font-weight:850;color:#0E1319;overflow:hidden}
.be-login-logo img{width:100%;height:100%;object-fit:cover}
.be-login-oi{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-text)}
.be-login-loja{font-size:24px;font-weight:850;letter-spacing:-.02em;margin:2px 0 12px;text-wrap:balance}
.be-login-sub{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:16px}
.be-login-sub b{color:var(--ink)}
.be-login .be-input{text-align:center;font-size:17px;font-weight:700;margin-bottom:12px}
.be-login .be-cod{letter-spacing:.35em;font-size:24px;padding-left:.35em}
.be-login-erro{font-size:12.5px;color:#dc2626;font-weight:600;margin-bottom:12px}
.be-login-voltar{background:none;border:none;color:var(--muted);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;margin-top:12px;text-decoration:underline}
.be-login-foot{margin-top:18px;font-size:11.5px;color:var(--muted)}
`

export default function BonificacaoEu() {
  const { slug } = useParams()
  const [sessao, setSessao] = useState(() => localStorage.getItem(COLAB_TOKEN_KEY))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem(COLAB_TOKEN_KEY))
  const [erro, setErro] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [confirmar, setConfirmar] = useState(null) // item a resgatar
  const [dataFolga, setDataFolga] = useState('')   // data desejada quando o item é FOLGA
  const [resgatando, setResgatando] = useState(false)
  const [aviso, setAviso] = useState(null)

  function sair() { localStorage.removeItem(COLAB_TOKEN_KEY); setSessao(null); setData(null); setErro(null) }
  function aoEntrar(token) { localStorage.setItem(COLAB_TOKEN_KEY, token); setSessao(token); setLoading(true) }

  function carregar(silent) {
    if (!localStorage.getItem(COLAB_TOKEN_KEY)) { setLoading(false); return }
    if (!silent) setLoading(true)
    setErro(null)
    colabApi.get('/public/colaborador/me')
      .then((r) => setData(r.data))
      .catch((err) => {
        if (err?.response?.status === 401) { sair() }
        else if (!silent) setErro(err?.response?.data?.error ?? 'Não foi possível carregar a página.')
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [sessao]) // eslint-disable-line react-hooks/exhaustive-deps

  async function resgatar() {
    if (!confirmar) return
    if (confirmar.tipo === 'FOLGA' && !dataFolga) { setAviso('Escolha a data desejada para a folga.'); return }
    setResgatando(true)
    try {
      await colabApi.post('/public/colaborador/resgatar', { itemId: confirmar.id, dataDesejada: confirmar.tipo === 'FOLGA' ? dataFolga : undefined })
      setConfirmar(null); setDataFolga(''); setAviso('Resgate solicitado! A liderança vai avaliar e te entregar o prêmio. 🎉')
      carregar(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível resgatar.'); setConfirmar(null); setDataFolga('') }
    finally { setResgatando(false) }
  }

  if (!sessao) return <LoginColaborador slug={slug} onEntrar={aoEntrar} />
  if (loading && !data) return <div className="be-root"><style>{CSS}</style><div className="be-state">Carregando…</div></div>
  if (erro) return <div className="be-root"><style>{CSS}</style><div className="be-state"><div>{erro}</div><button type="button" className="be-btn" style={{ maxWidth: 200, marginTop: 16 }} onClick={sair}>Entrar de novo</button></div></div>

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
          <div className="be-hero-bar">
            <span className="be-hero-loja"><span className="lg">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</span>{loja?.nome}</span>
            <button type="button" className="be-sair" onClick={sair}>Sair</button>
          </div>
          <div className="be-hero-main">
            <div className="be-avatar">{inicial}</div>
            <div className="be-hero-id">
              <div className="oi">Área do colaborador</div>
              <h1>Olá, {primeiro} 👋</h1>
              {funcionario?.funcao && <div className="fx">{funcionario.funcao}</div>}
            </div>
          </div>
          <div className="be-hero-stats">
            <div className="be-stat coins">
              <div className="v be-tnum">🪙 {num(saldoCoins)}</div>
              <div className="k">Coins</div>
            </div>
            {meu?.indice != null && (
              <>
                <div className="be-stat-div" />
                <div className="be-stat">
                  <div className="v be-tnum">⭐ {meu.indice}%</div>
                  <div className="k">Índice</div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="be-body">
          {tab === 'inicio' && <TabInicio meu={meu} totalEquipe={totalEquipe} historico={historico} contribuicoes={contribuicoes} mes={mes} ano={ano} />}
          {tab === 'ponto' && <TabPonto ponto={ponto} ano={ano} mes={mes} />}
          {tab === 'checklists' && <TabChecklists setAviso={setAviso} />}
          {tab === 'premios' && <TabPremios saldoCoins={saldoCoins} conquistas={conquistas} conquistasResumo={conquistasResumo} mercado={mercado} meusResgates={meusResgates} onResgatar={setConfirmar} />}
          {tab === 'voz' && <TabVoz colegas={colegas} reconhecimento={reconhecimento} ouvidoria={ouvidoria} onFeito={() => carregar(true)} setAviso={setAviso} />}
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

/* ══════════ ABA: CHECKLISTS (execução por função) ══════════ */
function TabChecklists({ setAviso }) {
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [exec, setExec] = useState(null) // execução aberta (troca a tela pela de responder)

  function carregar() {
    setErroCarga(false)
    colabApi.get('/public/colaborador/checklists')
      .then((r) => setDados(r.data))
      .catch(() => { setDados({ hoje: [], disponiveis: [] }); setErroCarga(true) })
  }
  useEffect(() => { carregar() }, [])

  async function abrir(c) {
    try {
      const r = await colabApi.post(`/public/colaborador/checklists/${c.id}/iniciar`)
      setExec(r.data.execucao)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível abrir o checklist.') }
  }

  if (exec) return <ExecutarChecklist exec={exec} setAviso={setAviso} onSair={() => { setExec(null); carregar() }} />
  if (!dados) return <div className="be-empty">Carregando…</div>

  return (
    <>
      <section>
        <h2 className="be-sec-title">✅ Para hoje</h2>
        {dados.hoje.length === 0 ? (
          <div className="be-empty">Nenhum checklist pra hoje. 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dados.hoje.map((c) => <CardChecklist key={c.id} c={c} onAbrir={abrir} />)}
          </div>
        )}
      </section>

      {dados.disponiveis.length > 0 && (
        <section>
          <h2 className="be-sec-title">🗂️ Disponíveis</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dados.disponiveis.map((c) => <CardChecklist key={c.id} c={c} onAbrir={abrir} />)}
          </div>
        </section>
      )}

      {erroCarga && <p className="be-hint">Não foi possível atualizar os checklists agora. Puxe a tela pra cima e tente de novo.</p>}
    </>
  )
}

function CardChecklist({ c, onAbrir }) {
  const st = CL_STATUS[c.status]
  const icone = c.status === 'CONCLUIDA' ? '✅' : c.status === 'EM_ANDAMENTO' ? '📝' : '📋'
  return (
    <button type="button" className="be-cl-row" onClick={() => onAbrir(c)}>
      <span className="be-cl-ic">{icone}</span>
      <span className="be-cl-info">
        <span className="be-cl-nm">{c.nome}</span>
        <span className="be-cl-meta">{c.categoria} · {c.itens} {c.itens === 1 ? 'item' : 'itens'}{c.tempoEstimadoMin > 0 ? ` · ~${c.tempoEstimadoMin} min` : ''}</span>
      </span>
      {c.emAlerta && <span className="be-st" style={{ color: '#dc2626', background: '#dc262622' }}>⚠️ Alerta</span>}
      {st && <span className="be-st" style={{ color: st.cor, background: st.cor + '22' }}>{st.label}</span>}
      <span className="be-cl-arrow">›</span>
    </button>
  )
}

// Execução em andamento: responde item a item (auto-salva por item) e conclui no fim.
function ExecutarChecklist({ exec, setAviso, onSair }) {
  const [respostas, setRespostas] = useState(exec.respostas || {})
  // Metadata das fotos já anexadas — { [chave]: { id, dataUrl? } }. dataUrl só existe
  // localmente logo após tirar a foto (prévia imediata, sem novo fetch); do backend
  // vem só { id } e a miniatura é buscada sob demanda ao abrir o item.
  const [fotos, setFotos] = useState(exec.fotos || {})
  const [concluida, setConcluida] = useState(exec.status === 'CONCLUIDA')
  const [concluindo, setConcluindo] = useState(false)

  async function salvar(chave, valor, observacao) {
    setRespostas((s) => ({ ...s, [chave]: { ...s[chave], valor, observacao } }))
    try {
      // O servidor recalcula "conforme" — o cliente não decide se passou.
      const r = await colabApi.put(`/public/colaborador/execucoes/${exec.id}/resposta`, { itemChave: chave, valor, observacao })
      setRespostas((s) => ({ ...s, [chave]: { ...s[chave], conforme: r.data.conforme } }))
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível salvar a resposta.') }
  }

  function fotoSalva(chave, meta) {
    setFotos((s) => ({ ...s, [chave]: meta }))
  }

  // Item FOTO crítico sem foto ainda anexada — bloqueia o Concluir (o 400 do servidor
  // é a rede de segurança, mas aqui evitamos a viagem ao servidor pra um erro esperado).
  const faltaFotoCritica = exec.itens.some((it) => it.tipo === 'FOTO' && it.critico && !fotos[it.chave])

  async function concluir() {
    if (faltaFotoCritica) { setAviso('Falta anexar uma foto obrigatória.'); return }
    setConcluindo(true)
    try {
      await colabApi.post(`/public/colaborador/execucoes/${exec.id}/concluir`)
      setConcluida(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível concluir o checklist.') }
    finally { setConcluindo(false) }
  }

  if (concluida) {
    return (
      <div className="be-state" style={{ minHeight: '50vh' }}>
        <div>
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>Checklist concluído!</p>
          <button type="button" className="be-btn" style={{ marginTop: 14, maxWidth: 220 }} onClick={onSair}>Voltar</button>
        </div>
      </div>
    )
  }

  return (
    <section>
      <button type="button" className="be-login-voltar" style={{ marginTop: 0, marginBottom: 12 }} onClick={onSair}>‹ Voltar</button>
      {exec.tempoEstimadoMin > 0 && <div className="be-cl-tempo">⏱️ ~{exec.tempoEstimadoMin} min</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {exec.itens.map((it) => (
          <ItemChecklist key={it.chave} item={it} resposta={respostas[it.chave] || {}} onSalvar={salvar} foto={fotos[it.chave] || null} onFoto={fotoSalva} execId={exec.id} setAviso={setAviso} />
        ))}
      </div>
      {faltaFotoCritica && <p className="be-cl-warn" style={{ marginTop: 10 }}>⚠ Falta anexar uma foto obrigatória antes de concluir.</p>}
      <button type="button" className="be-btn" style={{ marginTop: 14 }} onClick={concluir} disabled={concluindo || faltaFotoCritica}>
        {concluindo ? 'Concluindo…' : 'Concluir checklist'}
      </button>
    </section>
  )
}

// Um item do snapshot ({ chave, tipo, titulo, descricao, critico, config }), renderizado
// conforme o tipo.
function ItemChecklist({ item, resposta: r, onSalvar, foto, onFoto, execId, setAviso }) {
  const [texto, setTexto] = useState(r.valor ?? '')
  const [numero, setNumero] = useState(r.valor ?? '')
  return (
    <div className="be-cl-item">
      <div className="be-cl-item-tt">{item.titulo}{item.critico && <span className="be-cl-crit"> *</span>}</div>
      {item.descricao && <div className="be-cl-item-ds">{item.descricao}</div>}
      {item.config?.dica && <div className="be-cl-dica">💡 {item.config.dica}</div>}

      {item.tipo === 'CHECK' && (
        <button type="button" className={'be-cl-check' + (r.valor === true ? ' on' : '')} onClick={() => onSalvar(item.chave, !(r.valor === true), r.observacao)}>
          {r.valor === true ? '✔ Feito' : 'Marcar como feito'}
        </button>
      )}

      {item.tipo === 'AVALIACAO' && (
        <div className="be-cl-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={'be-cl-star' + (n <= (r.valor || 0) ? ' on' : '')} onClick={() => onSalvar(item.chave, n, r.observacao)}>
              {n <= (r.valor || 0) ? '★' : '☆'}
            </button>
          ))}
        </div>
      )}

      {item.tipo === 'TEXTO' && (
        <textarea className="be-input" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => onSalvar(item.chave, texto, r.observacao)} />
      )}

      {item.tipo === 'NUMERICO' && (
        <div className="be-cl-num">
          <input className="be-input" type="number" value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={() => onSalvar(item.chave, numero === '' ? null : Number(numero), r.observacao)} />
          {item.config?.unidade && <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{item.config.unidade}</span>}
        </div>
      )}

      {item.tipo === 'SELECAO' && (
        <div className="be-cl-opts">
          {(item.config?.opcoes || []).map((o) => (
            <button key={o.rotulo} type="button" className={'be-cl-opt' + (r.valor === o.rotulo ? ' on' : '')} onClick={() => onSalvar(item.chave, o.rotulo, r.observacao)}>
              {o.rotulo}
            </button>
          ))}
        </div>
      )}

      {item.tipo === 'FOTO' && (
        <ItemFoto item={item} foto={foto} onFoto={onFoto} execId={execId} setAviso={setAviso} />
      )}

      {r.conforme === false && <div className="be-cl-warn">⚠ Fora do padrão{item.critico ? ' · item crítico' : ''}</div>}
      {r.conforme === false && item.config?.instrucaoAlerta && (
        <div className="be-cl-alerta"><b>O que fazer:</b> {item.config.instrucaoAlerta}</div>
      )}
    </div>
  )
}

// Captura/anexa a foto de um item FOTO. Sem foto: input de câmera + botão "Tirar
// foto". Com foto: miniatura (dataUrl local se acabou de tirar, senão busca sob
// demanda ao montar) + "✓ foto anexada" + botão "Refazer".
function ItemFoto({ item, foto, onFoto, execId, setAviso }) {
  const [enviando, setEnviando] = useState(false)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [previaUrl, setPreviaUrl] = useState(foto?.dataUrl || null)
  const inputId = `be-foto-${item.chave}`

  // Já veio com foto do backend (metadata { id } sem bytes) e ainda não temos prévia
  // local — busca os bytes sob demanda uma vez.
  useEffect(() => {
    if (foto?.id && !foto?.dataUrl && !previaUrl) {
      setCarregandoPrevia(true)
      colabApi.get(`/public/colaborador/fotos/${foto.id}`)
        .then((r) => setPreviaUrl(r.data?.dataUrl || null))
        .catch(() => {}) // miniatura é só conveniência — "✓ foto anexada" já basta
        .finally(() => setCarregandoPrevia(false))
    }
  }, [foto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolher(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo (ex.: refazer)
    if (!file) return
    setEnviando(true)
    try {
      const { dataUrl, largura, altura } = await comprimirFoto(file)
      const r = await colabApi.put(`/public/colaborador/execucoes/${execId}/foto`, { itemChave: item.chave, dataUrl, largura, altura })
      setPreviaUrl(dataUrl) // prévia imediata com o dataUrl comprimido, sem novo fetch
      onFoto(item.chave, { id: r.data.fotoId, dataUrl })
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível salvar a foto.') }
    finally { setEnviando(false) }
  }

  return (
    <div>
      <input id={inputId} type="file" accept="image/*" capture="environment" hidden onChange={aoEscolher} disabled={enviando} />
      {foto ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {previaUrl ? (
            <img src={previaUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 18 }}>
              {carregandoPrevia ? '…' : '📷'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--money)' }}>✓ foto anexada</div>
            <label htmlFor={inputId} className="be-cl-check" style={{ marginTop: 6, padding: '6px 12px', fontSize: 12 }}>
              {enviando ? 'Enviando…' : 'Refazer'}
            </label>
          </div>
        </div>
      ) : (
        <>
          <label htmlFor={inputId} className="be-cl-check">
            📷 {enviando ? 'Enviando…' : 'Tirar foto'}
          </label>
          {item.critico && <div className="be-cl-warn">⚠ Foto obrigatória</div>}
        </>
      )}
    </div>
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
                    <span className="be-rar" style={{ color: r.cor, background: r.cor + '22' }}>{c.nivelAtual || r.label}{(c.coinsBonus ?? c.xpBonus) > 0 && !c.nivelAtual ? ` · +${c.coinsBonus ?? c.xpBonus} 🪙` : ''}</span>
                  ) : p ? (
                    <>
                      <div className="be-ach-prog"><i style={{ width: pct + '%' }} /></div>
                      <div className="be-ach-meta be-tnum">{num(p.atual)} / {num(p.meta)}{p.nivelNome ? ` · ${p.nivelNome}` : ''}</div>
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
                    <span className="be-tnum" style={{ fontSize: 12, color: 'var(--gold-text)', fontWeight: 800 }}>🪙 {num(r.custo)}</span>
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

/* ══════════ ABA: SUGESTÕES (reconhecer + ouvidoria) ══════════ */
function TabVoz({ colegas, reconhecimento, ouvidoria, onFeito, setAviso }) {
  return (
    <>
      {colegas.length > 0 && <SecaoReconhecer colegas={colegas} reconhecimento={reconhecimento} onFeito={onFeito} setAviso={setAviso} />}
      <SecaoOuvidoria ouvidoria={ouvidoria} onFeito={onFeito} setAviso={setAviso} />
    </>
  )
}

function SecaoReconhecer({ colegas, reconhecimento, onFeito, setAviso }) {
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
      await colabApi.post('/public/colaborador/reconhecer', { paraFuncionarioId: Number(para), mensagem: msg })
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

function SecaoOuvidoria({ ouvidoria, onFeito, setAviso }) {
  const [tipo, setTipo] = useState('SUGESTAO')
  const [msg, setMsg] = useState('')
  const [anonimo, setAnonimo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    if (!msg.trim()) { setAviso('Escreva sua mensagem.'); return }
    setEnviando(true)
    try {
      await colabApi.post('/public/colaborador/ouvidoria', { tipo, mensagem: msg, anonimo })
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

/* ══════════ LOGIN por WhatsApp (OTP) ══════════ */
const soFoneDig = (s) => String(s || '').replace(/\D/g, '')
function LoginColaborador({ slug, onEntrar }) {
  const [loja, setLoja] = useState(null)
  const [etapa, setEtapa] = useState('fone') // 'fone' | 'codigo'
  const [fone, setFone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [mascara, setMascara] = useState('')
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    colabApi.get(`/public/colaborador/${slug}/loja`).then((r) => setLoja(r.data)).catch(() => setLoja({ nome: 'Loja' }))
  }, [slug])
  async function pedir() {
    if (soFoneDig(fone).length < 10) { setErro('Digite seu WhatsApp com DDD.'); return }
    setErro(null); setBusy(true)
    try {
      const r = await colabApi.post(`/public/colaborador/${slug}/solicitar`, { telefone: fone })
      setMascara(r.data?.telefoneMascara || ''); setCodigo(''); setEtapa('codigo')
    } catch (e) { setErro(e?.response?.data?.error ?? 'Não foi possível enviar o código.') }
    finally { setBusy(false) }
  }
  async function entrar() {
    if (soFoneDig(codigo).length !== 6) { setErro('Digite o código de 6 dígitos.'); return }
    setErro(null); setBusy(true)
    try {
      const r = await colabApi.post(`/public/colaborador/${slug}/verificar`, { telefone: fone, codigo })
      onEntrar(r.data.token)
    } catch (e) { setErro(e?.response?.data?.error ?? 'Código inválido.') }
    finally { setBusy(false) }
  }
  return (
    <div className="be-root">
      <style>{CSS}</style>
      <div className="be-login">
        <div className="be-login-card">
          <div className="be-login-logo">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</div>
          <div className="be-login-oi">Área do colaborador</div>
          <h1 className="be-login-loja">{loja?.nome || '…'}</h1>
          {etapa === 'fone' ? (
            <>
              <p className="be-login-sub">Digite o WhatsApp que a liderança cadastrou. Você vai receber um código de acesso por lá.</p>
              <input className="be-input" inputMode="numeric" placeholder="(00) 00000-0000" value={fone} onChange={(e) => setFone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pedir()} />
              {erro && <div className="be-login-erro">{erro}</div>}
              <button type="button" className="be-btn" onClick={pedir} disabled={busy}>{busy ? 'Enviando…' : 'Receber código no WhatsApp'}</button>
            </>
          ) : (
            <>
              <p className="be-login-sub">Enviamos um código {mascara && <>para o WhatsApp <b>{mascara}</b></>}. Digite abaixo.</p>
              <input className="be-input be-cod" inputMode="numeric" maxLength={6} placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && entrar()} autoFocus />
              {erro && <div className="be-login-erro">{erro}</div>}
              <button type="button" className="be-btn" onClick={entrar} disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
              <button type="button" className="be-login-voltar" onClick={() => { setEtapa('fone'); setCodigo(''); setErro(null) }}>‹ Trocar número / reenviar código</button>
            </>
          )}
        </div>
        <div className="be-login-foot">🔒 Acesso seguro · Na Chapa</div>
      </div>
    </div>
  )
}
