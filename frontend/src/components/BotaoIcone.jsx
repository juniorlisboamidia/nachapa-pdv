// BOTÃO DE ÍCONE — o padrão de ação compacta do PDV.
//
// ── POR QUE É COMPARTILHADO, E NÃO UMA CLASSE COPIADA ─────────────────────────────────
// Ele nasceu nos Banners do Totem como `.ttm-bn-ico`. Copiar aquele nome para a TV Indoor
// funcionaria e seria errado pela mesma razão que o interruptor quebrou lá: uma tela tem o
// desenho certo, a seguinte copia a classe pela metade, e o sistema passa a ter dois
// padrões parecidos que divergem no primeiro ajuste. Aqui existe UM.
//
// ── 40px DE ALVO ──────────────────────────────────────────────────────────────────────
// O desenho tem 20px; o resto é área de toque. A régua de 44px vale para o tablet do balcão
// tanto quanto para o totem, e uma seta de 20px é impossível de acertar com o dedo.
//
// ── DESTRUTIVO SÓ NO HOVER ────────────────────────────────────────────────────────────
// `perigo` deixa o ícone vermelho ao passar o mouse, não em repouso: numa lista de oito
// linhas, oito lixeiras vermelhas viram ruído e param de significar perigo.

const DESENHOS = {
  // A alça de arrastar dos banners. Está aqui, e não no arquivo daquela tela, porque um
  // mesmo gesto com dois desenhos é como o sistema começa a parecer dois sistemas.
  alca: <><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
  subir: <path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  descer: <path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  // A mesma lixeira dos Banners: o gesto de remover precisa ter um desenho só no sistema.
  lixeira: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16" /><path d="M9.5 7V5h5v2" /><path d="M6.5 7l1 12.5h9L17.5 7" /><path d="M10 11v5.5M14 11v5.5" /></g>,
  // "Tirar da lista" NÃO é "excluir": o produto continua no cardápio, ele só sai daqui — por
  // isso um X, e não a lixeira. O traço que estava aqui antes lia como "menos"/"diminuir",
  // que é outra operação; o X diz "remove este daqui" sem prometer que algo foi apagado.
  tirar: <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  lapis: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14.5 6.5l3 3" /></g>,
  olho: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
}

export function Icone({ nome }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {DESENHOS[nome] ?? null}
    </svg>
  )
}

/* `titulo` vira `title` E `aria-label`: sem texto visível, ele é a ÚNICA coisa que diz o
   que o botão faz — para quem passa o mouse e para quem usa leitor de tela. Por isso é
   obrigatório na prática, e por isso o rótulo diz a AÇÃO ("Subir Super Box"), não o ícone. */
export default function BotaoIcone({ icone, titulo, perigo = false, ...resto }) {
  return (
    <button
      type="button"
      className={'app-ico' + (perigo ? ' perigo' : '')}
      title={titulo}
      aria-label={titulo}
      {...resto}
    >
      <Icone nome={icone} />
    </button>
  )
}
