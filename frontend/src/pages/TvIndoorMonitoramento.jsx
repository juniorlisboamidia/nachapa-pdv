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

// Atualiza sozinho: quem abre esta tela está olhando uma TV agora, e apertar F5 para saber
// se ela voltou é o tipo de trabalho que o sistema deveria fazer. 30 s é o mesmo ritmo da
// gestão de telas — o heartbeat é de 60 s, então nada se perde.
const MS_ATUALIZAR = 30_000

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

const TIPO_ITEM = { IMAGEM: 'Arte', MENU_BOARD: 'Menu board', VIDEO: 'Vídeo' }
const ORIGEM = { REGRA: 'Regra semanal', PADRAO: 'Playlist padrão' }

const FILTROS = [
  { id: 'TODOS', rotulo: 'Todas' },
  { id: 'ATENCAO', rotulo: 'Atenção' },
  { id: 'OFFLINE', rotulo: 'Offline' },
  { id: 'SAUDAVEL', rotulo: 'Saudáveis' },
]

/* "há 18 segundos". Relativo porque é o que a pessoa quer saber — um horário absoluto
   obrigaria a fazer a conta de cabeça, justamente no momento em que ela está com pressa.

   A âncora é o `agoraServidor` da resposta, e não o relógio de quem está olhando: um
   navegador com a hora adiantada mostraria "há 2 horas" numa TV que bateu agora. */
function haQuanto(iso, agoraIso) {
  if (!iso) return null
  const t = Date.parse(iso)
  const base = Date.parse(agoraIso ?? '')
  if (!Number.isFinite(t)) return null
  const s = Math.max(0, Math.round(((Number.isFinite(base) ? base : Date.now()) - t) / 1000))
  if (s < 60) return `há ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  return `há ${h} h ${m % 60} min`
}

function duracao(segundos) {
  if (!Number.isFinite(segundos) || segundos < 0) return null
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${segundos} s`
}

// "Item removido" em vez de um id cru: se a mídia foi apagada entre o heartbeat e agora, o
// gestor precisa entender o que houve, não decifrar `VIDEO 44`.
const nomeDoItem = (item) => item?.nome ?? 'Item removido'

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
                {visiveis.map((t) => (
                  <li key={t.id} className="tvi-mon-linha">
                    <span className={'tvi-ponto ' + SAUDE[t.saude].ponto} aria-hidden="true" />
                    <span className="tvi-item-info">
                      <span className="tvi-item-nome">
                        {t.nome}
                        <span className={'badge ' + SAUDE[t.saude].cor} style={{ marginLeft: 8 }}>{SAUDE[t.saude].texto}</span>
                      </span>
                      {/* A frase do problema vem na FRENTE do resto: é o que a pessoa veio
                          ler. Quando está tudo certo, o que interessa é o que está no ar. */}
                      {t.mensagem && t.saude !== 'SAUDAVEL' ? (
                        <span className="tvi-mon-aviso">{t.mensagem}</span>
                      ) : null}
                      <span className="tvi-item-meta">
                        {t.itemAtual ? <span>{TIPO_ITEM[t.itemAtual.tipo]} · <strong>{nomeDoItem(t.itemAtual)}</strong></span> : null}
                        {t.programacao?.playlistNome ? <span>Playlist {t.programacao.playlistNome}</span> : null}
                        {t.programacao?.origem ? <span>{ORIGEM[t.programacao.origem]}</span> : null}
                        <span>Sinal {haQuanto(t.ultimoSinalEm, agoraIso) ?? 'nunca'}</span>
                        {t.tela ? <span>{t.tela.w} × {t.tela.h}</span> : null}
                      </span>
                    </span>
                    <span className="tvi-item-acoes">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberta(t.id)}>Diagnóstico</button>
                    </span>
                  </li>
                ))}
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
function Detalhe({ tela, agoraIso, aoFechar }) {
  const p = tela.programacao
  const u = tela.falhas?.ultima
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
            <Linha rotulo="Última comunicação">{haQuanto(tela.ultimoSinalEm, agoraIso) ?? 'Nunca se comunicou'}</Linha>
            <Linha rotulo="Resolução">{tela.tela ? `${tela.tela.w} × ${tela.tela.h}` : null}</Linha>
            <Linha rotulo="Player ativo há">{duracao(tela.uptimeSegundos)}</Linha>
          </section>

          {tela.temTelemetria ? (
            <>
              <section>
                <h3 className="tvi-mon-secao">Programação</h3>
                <Linha rotulo="Playlist">{p?.playlistNome ?? (p?.playlistId ? 'Playlist removida' : 'Nenhuma')}</Linha>
                <Linha rotulo="Origem">{p?.origem ? ORIGEM[p.origem] : null}</Linha>
                <Linha rotulo="Regra">{p?.regraDescricao ?? (p?.regraId ? 'Regra removida' : null)}</Linha>
                {p?.caiuNoPadrao ? (
                  <Linha rotulo="Observação">A playlist programada estava sem conteúdo; a TV caiu para a padrão.</Linha>
                ) : null}
                <Linha rotulo="Última sincronização">{haQuanto(p?.sincronizadoEm, agoraIso) ?? 'Nunca'}</Linha>
                <Linha rotulo="Próxima troca">{p?.proximaTrocaEm ? new Date(p.proximaTrocaEm).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sem troca prevista'}</Linha>
              </section>

              <section>
                <h3 className="tvi-mon-secao">No ar agora</h3>
                <Linha rotulo="Estado">{ESTADO_PLAYER[tela.estado] ?? tela.estado}</Linha>
                <Linha rotulo="Item">{tela.itemAtual ? `${TIPO_ITEM[tela.itemAtual.tipo]} · ${nomeDoItem(tela.itemAtual)}` : null}</Linha>
                <Linha rotulo="Versão da mídia">{tela.itemAtual?.versao ?? null}</Linha>
                <Linha rotulo="Vídeo">{tela.video?.estado === 'BUFFERING' ? 'Carregando' : tela.video?.estado === 'PLAYING' ? 'Reproduzindo' : null}</Linha>
              </section>

              <section>
                <h3 className="tvi-mon-secao">Diagnóstico</h3>
                <Linha rotulo="Falhas nesta sessão">{tela.falhas?.totalSessao ?? 0}</Linha>
                {u ? (
                  <>
                    <Linha rotulo="Última ocorrência">
                      {u.frase}
                      {u.nome ? <> <span className="ttm-meta-txt">({u.nome})</span></> : null}
                    </Linha>
                    <Linha rotulo="Quando">{haQuanto(u.em, agoraIso)}</Linha>
                    {/* O código técnico existe para o suporte, e vive aqui — pequeno, no
                        detalhe, nunca como a mensagem principal. */}
                    <Linha rotulo="Código"><code className="tvi-mon-codigo">{u.codigo}</code></Linha>
                  </>
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
