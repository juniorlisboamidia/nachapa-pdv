// TV Indoor › Telas › Monitorar — "esta TV está realmente funcionando?"
//
// ── A PERGUNTA QUE ONLINE/OFFLINE NÃO RESPONDE ────────────────────────────────────────
// Uma parede pode estar online, batendo heartbeat a cada 60 s, e mesmo assim: sem
// sincronizar a programação há dez minutos, com o único vídeo quebrado, ou mostrando a
// marca da loja porque nada é reproduzível. Do lado de fora, os quatro casos se parecem.
//
// Já foi uma página própria (Monitoramento), com cartões de soma e filtros. Virou um modal
// por TV, aberto da lista de Telas: a lista já dizia online/offline e último sinal, e o que
// faltava — o selo de atenção e o diagnóstico — cabe na própria linha. Uma categoria na
// sidebar para uma pergunta que se faz olhando para UMA TV era uma porta a mais.
//
// ── NADA DE CÓDIGO TÉCNICO NA FRENTE ──────────────────────────────────────────────────
// O gestor lê "Um vídeo parou de avançar e foi pulado". `VIDEO_STALL` existe para o
// suporte e aparece pequeno, no detalhe. Quem monta as frases é o backend: a regra e o
// texto que a explica não podem morar em arquivos diferentes.
//
// ── SEM SCREENSHOT ────────────────────────────────────────────────────────────────────
// Nenhuma imagem da tela é capturada, em lugar nenhum. Diagnóstico aqui é ESTADO, não
// fotografia — banda, privacidade e armazenamento sem necessidade nenhuma.
import { duracao, haQuanto } from '../../lib/duracaoRelativa'
import { ESTADO_PLAYER, ORIGENS, SAUDE, textoDoItem } from '../tvMonitoramentoLinha'

function Linha({ rotulo, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="tvi-mon-par">
      <span className="tvi-mon-chave">{rotulo}</span>
      <span className="tvi-mon-valor">{children}</span>
    </div>
  )
}

// Quatro blocos, nesta ordem: o aparelho, a programação, o que está no ar e o diagnóstico.
// Linha sem valor NÃO aparece — "Regra: —" ocupa espaço para dizer que não tem nada a dizer,
// e uma tela cheia de travessões treina o olho a pular tudo.
//
// `tela` é o objeto do MONITORAMENTO (não o da lista de Telas), e vem sempre da última
// leitura: com o modal aberto por dois minutos, o diagnóstico continua vivo em vez de
// envelhecer. Quem garante isso é quem abre o modal, procurando a TV na lista recém-buscada.
export default function MonitorDaTela({ tela, agoraIso, aoFechar }) {
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
