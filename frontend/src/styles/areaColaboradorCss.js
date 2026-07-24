// Design system (CSS-in-JS via <style>) da Área do Colaborador — extraído de
// BonificacaoEu.jsx para ser reusado por qualquer tela que precise do MESMO visual
// (mobile-first, tema claro/escuro por prefers-color-scheme): a própria Área do
// Colaborador (login por WhatsApp) e a execução pública de checklist por PIN
// (ChecklistPublico, link/QR do balcão). Conteúdo inalterado — só mudou de arquivo.
export const AREA_COLABORADOR_CSS = `
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
.be-login{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 18px;background:radial-gradient(120% 50% at 50% -8%,rgba(234,184,2,.16),transparent 62%),radial-gradient(90% 42% at 50% 112%,rgba(234,184,2,.08),transparent 60%),#13172b}
/* Cartão travado no visual claro (fundo da tela é escuro): força os tokens de tema
   pra não escurecer/sumir no modo escuro do celular. */
.be-login-card{--surface:#FFFFFF;--surface-2:#EFEADF;--ink:#0E1319;--ink-soft:#474D55;--muted:#8A8E94;--line:#E5DFD2;--brand:#EAB802;--brand-tint:#FBF2CC;--gold-text:#8A6A00;width:100%;max-width:384px;background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:30px 24px 26px;box-shadow:0 10px 40px rgba(0,0,0,.28);text-align:center;animation:be-rise .45s cubic-bezier(.2,.7,.3,1) both}
.be-login-logo{width:66px;height:66px;border-radius:19px;margin:0 auto 16px;background:#FFFFFF;display:grid;place-items:center;font-size:28px;font-weight:850;color:#0E1319;overflow:hidden;box-shadow:0 4px 14px rgba(14,19,25,.10);border:1px solid rgba(14,19,25,.06)}
.be-login-logo img{width:100%;height:100%;object-fit:cover}
.be-login-oi{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-text)}
.be-login-sub{font-size:14px;color:var(--ink-soft);line-height:1.55;margin:10px 0 14px;text-wrap:balance}
.be-login-sub b{color:var(--ink);font-weight:700}
.be-login-note{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--gold-text);background:var(--brand-tint);border-radius:999px;padding:7px 13px;margin-bottom:18px;line-height:1.2}
.be-login .be-input{text-align:center;font-size:18px;font-weight:700;padding:14px 12px;margin-bottom:12px;transition:border-color .18s,box-shadow .18s}
.be-login .be-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(234,184,2,.18)}
.be-login .be-cod{letter-spacing:.35em;font-size:26px;padding-left:.35em;font-variant-numeric:tabular-nums}
.be-login .be-btn{padding:14px 18px;font-size:15px;box-shadow:0 4px 14px rgba(234,184,2,.4);transition:transform .12s,box-shadow .18s,opacity .18s}
.be-login .be-btn:not(:disabled):active{transform:scale(.985)}
.be-login-erro{font-size:12.5px;color:#dc2626;font-weight:600;margin-bottom:12px}
.be-login-voltar{background:none;border:none;color:var(--muted);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;margin-top:12px;text-decoration:underline}
.be-login-foot{display:inline-flex;align-items:center;gap:6px;margin-top:20px;font-size:12px;color:rgba(255,255,255,.6)}
@keyframes be-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.be-login-card{animation:none}.be-login .be-btn,.be-login .be-input{transition:none}.be-login .be-btn:not(:disabled):active{transform:none}}
`
