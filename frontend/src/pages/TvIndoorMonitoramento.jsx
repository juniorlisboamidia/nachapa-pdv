// Loja Digital › TV Indoor › Monitoramento — "esta TV está realmente funcionando?"
//
// ── A PERGUNTA QUE ONLINE/OFFLINE NÃO RESPONDE ────────────────────────────────────────
// Uma parede pode estar online, batendo heartbeat a cada 60 s, e mesmo assim: sem
// sincronizar a programação há dez minutos, com o único vídeo quebrado, ou mostrando a
// marca da loja porque nada é reproduzível. Do lado de fora, os quatro casos se parecem.
//
// ── PROBLEMA SOBE ─────────────────────────────────────────────────────────────────────
// Ninguém abre esta tela para admirar as que funcionam. A ordenação vem do SERVIDOR, para
// a soma dos cartões e a ordem da lista saírem da mesma fonte — se cada lado contasse do
// seu jeito, um dia não bateria.
//
// ── NADA DE CÓDIGO TÉCNICO NA FRENTE ──────────────────────────────────────────────────
// O gestor lê "Um vídeo parou de avançar e foi pulado". `VIDEO_STALL` existe para o
// suporte e aparece pequeno, no detalhe. Quem monta as frases é o backend: a regra e o
// texto que a explica não podem morar em arquivos diferentes.
//
// ── SEM SCREENSHOT ────────────────────────────────────────────────────────────────────
// Nenhuma imagem da tela é capturada, em lugar nenhum. Diagnóstico aqui é ESTADO, não
// fotografia — banda, privacidade e armazenamento sem necessidade nenhuma.
import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { duracao, haQuanto } from '../lib/duracaoRelativa'
/* A composição de cada linha mora num módulo puro e TESTADO: "o que a linha diz em cada
   estado" é regra de produto, e regra de produto dentro de JSX não tem teste. São cinco
   saúdes × três tipos de item × item removido × fallback — combinações demais para conferir
   no olho a cada mudança. */
import { ORIGENS, composicao, textoDoItem } from '../components/tvMonitoramentoLinha'

// Atualiza sozinho: quem abre esta tela está olhando uma TV agora, e apertar F5 para saber
// se ela voltou é o tipo de trabalho que o sistema deveria fazer. 30 s é o mesmo ritmo da
// gestão de telas — o heartbeat é de 60 s, então nada se perde.
const MS_ATUALIZAR = 30_000

/* UMA linguagem, do cartão ao filtro ao selo. O nome técnico interno continua `SAUDAVEL`;
   o que o gestor lê é "Tudo certo" em todo lugar. Antes o cartão dizia "TUDO CERTO" e o
   filtro dizia "Saudáveis", e duas palavras para a mesma coisa obrigam a pessoa a traduzir
   mentalmente a cada leitura. */
const SAUDE = {
  SAUDAVEL: { texto: 'Tudo certo', cor: 'badge-green', ponto: 'ok' },
  ATENCAO: { texto: 'Atenção', cor: 'badge-orange', ponto: 'alerta' },
  OFFLINE: { texto: 'Offline', cor: 'badge-red', ponto: 'off' },
  SEM_TELEMETRIA: { texto: 'Sem telemetria', cor: 'badge-slate', ponto: 'neutro' },
  SEM_PROGRAMACAO: { texto: 'Sem programação', cor: 'badge-gray', ponto: 'neutro' },
}

const ESTADO_PLAYER = {
  REPRODUZINDO: 'Reproduzindo normalmente',
  INSTITUCIONAL: 'Mostrando a marca da loja',
  SEM_CONTEUDO: 'Sem conteúdo para exibir',
  ATUALIZANDO: 'Iniciando',
  FALHA_TOTAL: 'Nenhum conteúdo pôde ser exibido',
}

/* A ordem dos filtros é a mesma da lista: problema primeiro. "Tudo certo" fecha a fila
   porque é o filtro que ninguém usa com pressa.

   Não há filtro para "Sem programação" e "Sem telemetria" de propósito: são poucos e
   passageiros, e um filtro por estado raro é um botão que ocupa espaço para nunca ser
   clicado. Eles continuam aparecendo em "Todas" e nos cartões do topo. */
const FILTROS = [
  { id: 'TODOS', rotulo: 'Todas' },
  { id: 'ATENCAO', rotulo: 'Atenção' },
  { id: 'OFFLINE', rotulo: 'Offline' },
  { id: 'SAUDAVEL', rotulo: 'Tudo certo' },
]

export default function TvIndoorMonitoramento() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(null)

  const buscar = useCallback(() => api.get('/tv-indoor/monitoramento')
    .then((r) => { setDados(r.data ?? null); setErro(null) })
    .catch(() => setErro('Não foi possível ler o monitoramento agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])
  useEffect(() => {
    const t = setInterval(buscar, MS_ATUALIZAR)
    return () => clearInterval(t)
  }, [buscar])

  const telas = dados?.telas ?? []
  const resumo = dados?.resumo ?? { total: 0 }
  const agoraIso = dados?.agoraServidor ?? null

  const termo = busca.trim().toLowerCase()
  const visiveis = telas.filter((t) => {
    if (termo && !String(t.nome).toLowerCase().includes(termo)) return false
    if (filtro === 'TODOS') return true
    if (filtro === 'SAUDAVEL') return t.saude === 'SAUDAVEL'
    return t.saude === filtro
  })

  // A TV aberta no detalhe vem da lista recém-buscada, não de uma cópia congelada: com o
  // painel aberto por dois minutos, o diagnóstico continua vivo em vez de envelhecer.
  const detalhe = aberta ? telas.find((t) => t.id === aberta) ?? null : null

  if (carregando) return <div className="loading-state">Carregando…</div>
  if (erro) {
    return (
      <div className="empty-state">
        <div style={{ marginBottom: 12 }}>{erro}</div>
        <button type="button" className="btn btn-primary" onClick={() => { setCarregando(true); buscar() }}>Tentar de novo</button>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Monitoramento das TVs</h1>
          <div className="page-header-sub">
            O que cada tela está reproduzindo agora — e o que precisa de atenção. Atualiza sozinho.
          </div>
        </div>
      </div>

      {telas.length === 0 ? (
        <div className="table-card" style={{ padding: 16 }}>
          <div className="empty-state">Nenhuma TV cadastrada ainda. Cadastre uma em <strong>Telas</strong>.</div>
        </div>
      ) : (
        <>
          {/* A REGRA DOS CONTADORES: cada TV está em exatamente UMA saúde, e toda saúde tem
              cartão. Os três primeiros são fixos e mostram zero — um "Atenção 0" é uma
              informação, não um espaço desperdiçado. Os dois especiais só aparecem quando
              existem, e é por isso que a soma SEMPRE fecha com o total: nenhuma TV fica
              escondida para a conta bater. */}
          <div className="tvi-mon-resumo">
            <Cartao rotulo="TVs" valor={resumo.total} />
            <Cartao rotulo="Tudo certo" valor={resumo.SAUDAVEL ?? 0} tom="ok" />
            <Cartao rotulo="Atenção" valor={resumo.ATENCAO ?? 0} tom="alerta" />
            <Cartao rotulo="Offline" valor={resumo.OFFLINE ?? 0} tom="off" />
            {(resumo.SEM_PROGRAMACAO ?? 0) > 0 ? <Cartao rotulo="Sem programação" valor={resumo.SEM_PROGRAMACAO} /> : null}
            {(resumo.SEM_TELEMETRIA ?? 0) > 0 ? <Cartao rotulo="Sem telemetria" valor={resumo.SEM_TELEMETRIA} /> : null}
          </div>

          <div className="table-card" style={{ padding: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Telas</h2>
              <span className="ttm-meta-txt">{visiveis.length} de {telas.length}</span>
              <div className="ttm-cab-acao tvi-abas">
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" className={'tvi-aba' + (filtro === f.id ? ' on' : '')} onClick={() => setFiltro(f.id)}>
                    {f.rotulo}
                  </button>
                ))}
                <input
                  className="form-input"
                  style={{ width: 160 }}
                  placeholder="Buscar por nome"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Buscar TV por nome"
                />
              </div>
            </div>

            {visiveis.length === 0 ? (
              <div className="empty-state">Nenhuma TV neste filtro.</div>
            ) : (
              <ul className="tvi-lista">
                {visiveis.map((t) => {
                  /* A hierarquia da linha, de cima para baixo: nome + saúde, o que está no
                     ar (ou o problema), a programação, e o apoio em muted.

                     A COR forte fica no ponto e no selo. A mensagem vem em texto normal: com
                     três elementos vermelhos gritando a mesma coisa, nenhum deles informa —
                     e o olho passa a ignorar todos. */
                  const c = composicao(t, agoraIso)
                  return (
                    <li key={t.id} className="tvi-mon-linha">
                      <span className={'tvi-ponto ' + SAUDE[t.saude].ponto} aria-hidden="true" />
                      <span className="tvi-item-info">
                        <span className="tvi-mon-cabeca">
                          <span className="tvi-mon-nome">{t.nome}</span>
                          <span className={'badge ' + SAUDE[t.saude].cor}>{SAUDE[t.saude].texto}</span>
                        </span>
                        {c.aviso ? <span className="tvi-mon-aviso">{c.aviso}</span> : null}
                        {c.item ? <span className="tvi-mon-item">{c.item}</span> : null}
                        {c.programacao ? <span className="tvi-mon-prog">{c.programacao}</span> : null}
                        {c.apoio.length ? <span className="tvi-mon-apoio">{c.apoio.join(' · ')}</span> : null}
                      </span>
                      <span className="tvi-item-acoes">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberta(t.id)}>Diagnóstico</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {detalhe ? <Detalhe tela={detalhe} agoraIso={agoraIso} aoFechar={() => setAberta(null)} /> : null}
    </>
  )
}

function Cartao({ rotulo, valor, tom }) {
  return (
    <div className={'tvi-mon-cartao' + (tom ? ` ${tom}` : '')}>
      <span className="tvi-grade-rotulo">{rotulo}</span>
      <strong className="tvi-mon-numero">{valor}</strong>
    </div>
  )
}

function Linha({ rotulo, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="tvi-mon-par">
      <span className="tvi-mon-chave">{rotulo}</span>
      <span className="tvi-mon-valor">{children}</span>
    </div>
  )
}

// ── Detalhe ────────────────────────────────────────────────────────────────
// Quatro blocos, nesta ordem: o aparelho, a programação, o que está no ar e o diagnóstico.
// Linha sem valor NÃO aparece — "Regra: —" ocupa espaço para dizer que não tem nada a dizer,
// e uma tela cheia de travessões treina o olho a pular tudo.
function Detalhe({ tela, agoraIso, aoFechar }) {
  const p = tela.programacao
  const u = tela.falhas?.ultima
  /* OFFLINE não pode fingir que o snapshot é de agora. Os dados continuam úteis — são a
     última coisa que a TV disse antes de sumir —, mas rotulados como PASSADO. Apresentá-los
     como presente faria alguém procurar um vídeo que parou de tocar há quatro horas. */
  const off = tela.saude === 'OFFLINE'
  const rotuloSecao = (agora, conhecido) => (off ? conhecido : agora)
  return (
    // Modal fecha só por botão — regra do projeto.
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{tela.nome}</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <h3 className="tvi-mon-secao">Aparelho</h3>
            <Linha rotulo="Situação">
              <span className={'badge ' + SAUDE[tela.saude].cor}>{SAUDE[tela.saude].texto}</span>
              {tela.online ? ' · Online' : ' · Offline'}
            </Linha>
            <Linha rotulo="Último sinal">{haQuanto(tela.ultimoSinalEm, agoraIso) ?? 'Nunca se comunicou'}</Linha>
            <Linha rotulo="Resolução">{tela.tela?.w && tela.tela?.h ? `${tela.tela.w} × ${tela.tela.h}` : null}</Linha>
            <Linha rotulo="Player ativo há">{off ? null : duracao(tela.uptimeSegundos)}</Linha>
          </section>

          {tela.temTelemetria ? (
            <>
              <section>
                <h3 className="tvi-mon-secao">{rotuloSecao('Programação', 'Programação — último estado conhecido')}</h3>
                <Linha rotulo="Playlist">{p?.playlistNome ?? (p?.playlistId ? 'Playlist removida' : 'Nenhuma')}</Linha>
                <Linha rotulo="Origem">{p?.origem ? ORIGENS[p.origem] : null}</Linha>
                {/* A regra só existe quando a origem é a grade. Mostrá-la vazia numa TV que
                    está na playlist padrão seria inventar um campo que não se aplica. */}
                <Linha rotulo="Regra semanal">{p?.regraDescricao ?? (p?.regraId ? 'Regra removida' : null)}</Linha>
                {p?.caiuNoPadrao ? (
                  <Linha rotulo="Observação">A playlist programada estava sem conteúdo; a TV caiu para a padrão.</Linha>
                ) : null}
                <Linha rotulo={rotuloSecao('Última sincronização', 'Última sincronização conhecida')}>
                  {haQuanto(p?.sincronizadoEm, agoraIso) ?? 'Nunca sincronizou'}
                </Linha>
                <Linha rotulo="Próxima troca">
                  {off ? null : (p?.proximaTrocaEm ? new Date(p.proximaTrocaEm).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sem troca prevista')}
                </Linha>
              </section>

              <section>
                <h3 className="tvi-mon-secao">{rotuloSecao('No ar agora', 'Último item conhecido')}</h3>
                <Linha rotulo="Estado">{off ? null : (ESTADO_PLAYER[tela.estado] ?? tela.estado)}</Linha>
                <Linha rotulo="Item">{textoDoItem(tela.itemAtual)}</Linha>
                {/* A versão importa no vídeo e na arte — é ela que diz se a TV já pegou o
                    arquivo novo depois de uma substituição. No menu board não existe. */}
                <Linha rotulo="Versão da mídia">{tela.itemAtual?.versao ?? null}</Linha>
                <Linha rotulo="Vídeo">{off ? null : (tela.video?.estado === 'BUFFERING' ? 'Carregando' : tela.video?.estado === 'PLAYING' ? 'Reproduzindo' : null)}</Linha>
              </section>

              <section>
                <h3 className="tvi-mon-secao">Diagnóstico</h3>
                <Linha rotulo="Situação">{SAUDE[tela.saude].texto}{tela.mensagem ? ` — ${tela.mensagem}` : ''}</Linha>
                <Linha rotulo="Falhas nesta sessão">{tela.falhas?.totalSessao ?? 0}</Linha>
                {u ? (
                  <Linha rotulo="Última ocorrência">
                    {/* TEXTO HUMANO PRIMEIRO, código depois e pequeno. Ninguém deveria
                        precisar saber o que é `VIDEO_STALL` para entender o que houve. */}
                    <span className="tvi-mon-frase">{u.frase}</span>
                    <span className="tvi-mon-rodape-falha">
                      {u.nome ? <>{u.nome} · </> : null}
                      {haQuanto(u.em, agoraIso) ?? 'momento desconhecido'}
                      {' · '}
                      <code className="tvi-mon-codigo">{u.codigo}</code>
                    </span>
                  </Linha>
                ) : (
                  <Linha rotulo="Última ocorrência">Nenhuma falha nesta sessão.</Linha>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state" style={{ padding: 12 }}>
              Esta TV está se comunicando, mas ainda não informa o que está reproduzindo. Isso acontece quando ela
              ainda não recebeu a versão nova do player — ela continua tocando normalmente. Recarregar a página da
              TV resolve.
            </div>
          )}
        </div>
        <div className="ttm-banner-rodape">
          <button type="button" className="btn btn-secondary" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
