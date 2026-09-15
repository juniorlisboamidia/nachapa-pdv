// Loja Digital › TV Indoor › Playlists — a PROGRAMAÇÃO de cada tela.
//
// A playlist existe desde o V1 (e não "todos os conteúdos ativos aparecem em todas as
// TVs") porque o produto já nasce precisando de TV BALCÃO com uma sequência e TV SALÃO com
// outra. Uma playlist pode servir várias telas.
//
// ── ORDENAÇÃO SEM BIBLIOTECA ──────────────────────────────────────────────────────────
// Subir e descer, com botões. Nada de drag-and-drop aqui: a lista é curta, a tela é usada
// de vez em quando, e uma dependência de DnD para reordenar cinco itens custaria mais do
// que resolve. Os botões funcionam no teclado e no toque sem nenhum tratamento especial —
// que é justamente onde o arrasto não existe.
//
// A ordem é reescrita por POSIÇÃO no servidor: a lista inteira sobe de uma vez, em
// transação. Trocar dois vizinhos deixaria buracos e empates quando duas abas mexem juntas.
import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const STATUS = {
  ATIVO: { texto: 'No ar', cor: 'badge-green' },
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Desligado', cor: 'badge-gray' },
  // Só o vídeo produz este estado: a linha existe, o arquivo não subiu.
  SEM_ARQUIVO: { texto: 'Falta o arquivo', cor: 'badge-red' },
}

const MOTIVOS = {
  NOME_OBRIGATORIO: 'Dê um nome à playlist.',
  ITENS_INVALIDOS: 'A lista de conteúdos não é válida.',
  LIMITE_DE_ITENS: 'A playlist chegou ao limite de conteúdos.',
  REFERENCIA_INVALIDA: 'Um dos itens não existe mais. Recarregue a tela.',
}
const erroDe = (e, fallback) => {
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

/* A duração do vídeo como rótulo. Ela é INFORMATIVA — veio do navegador de quem enviou, o
   servidor não mede vídeo — e quando não veio, a frase diz o que vai acontecer em vez de
   um travessão mudo: o vídeo toca inteiro de qualquer jeito. */
function duracaoDoVideo(v) {
  const ms = Number(v?.duracaoMs)
  if (!Number.isFinite(ms) || ms <= 0) return 'toca até o fim'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function TvIndoorPlaylists() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [conteudos, setConteudos] = useState([])
  const [boards, setBoards] = useState([])
  const [videos, setVideos] = useState([])
  // Qual acervo está aberto à direita: as artes, os menu boards ou os vídeos.
  const [acervo, setAcervo] = useState('CONTEUDOS')
  const [ocupado, setOcupado] = useState(false)
  const [selecionada, setSelecionada] = useState(null) // id
  const [nova, setNova] = useState('')
  const [renomeando, setRenomeando] = useState(null)   // { id, nome }
  const [excluindo, setExcluindo] = useState(null)

  const buscar = useCallback(() => Promise.all([
    api.get('/tv-indoor/playlists'),
    api.get('/tv-indoor/conteudos'),
    // Os menu boards entram no MESMO acervo: a programação alterna arte e cardápio, e a
    // ordem é única. Uma lista separada obrigaria o gestor a montar a sequência em dois
    // lugares e a adivinhar como eles se intercalam.
    api.get('/tv-indoor/menu-boards').catch(() => ({ data: { menuBoards: [] } })),
    api.get('/tv-indoor/videos').catch(() => ({ data: { videos: [] } })),
  ])
    .then(([p, c, b, v]) => {
      setPlaylists(Array.isArray(p.data?.playlists) ? p.data.playlists : [])
      setConteudos(Array.isArray(c.data?.conteudos) ? c.data.conteudos : [])
      setBoards(Array.isArray(b.data?.menuBoards) ? b.data.menuBoards : [])
      setVideos(Array.isArray(v.data?.videos) ? v.data.videos : [])
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler as playlists agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  // A playlist aberta. Sem `useMemo` à mão: o React Compiler está ligado neste projeto, e
  // escrever a memoização faz o compilador desistir do arquivo inteiro.
  const atual = playlists.find((p) => p.id === selecionada)
    // Nenhuma escolhida ainda: abre a primeira. Uma tela que começa vazia com uma lista ao
    // lado obriga um clique que não decide nada.
    ?? playlists[0]
    ?? null

  async function criar(e) {
    e.preventDefault()
    const nome = nova.trim()
    if (!nome || ocupado) return
    setOcupado(true)
    try {
      const r = await api.post('/tv-indoor/playlists', { nome })
      setNova('')
      await buscar()
      if (r.data?.playlist?.id) setSelecionada(r.data.playlist.id)
      setToast({ message: 'Playlist criada. Agora adicione os conteúdos.', type: 'success' })
    } catch (e2) { setToast({ message: erroDe(e2, 'Não foi possível criar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function renomear() {
    const nome = String(renomeando?.nome ?? '').trim()
    if (!nome || ocupado) return
    setOcupado(true)
    try {
      await api.put(`/tv-indoor/playlists/${renomeando.id}`, { nome })
      setRenomeando(null)
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível renomear.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(`/tv-indoor/playlists/${excluindo.id}`)
      setExcluindo(null)
      if (selecionada === excluindo.id) setSelecionada(null)
      await buscar()
      setToast({ message: 'Playlist excluída.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  /* A lista INTEIRA sobe de uma vez, e o servidor reescreve a ordem por posição — é o
     mesmo caminho para adicionar, remover e reordenar. Um endpoint só, uma transação só,
     e nenhuma chance de a programação ficar pela metade.

     Os itens são POLIMÓRFICOS: `{ tipo, conteudoId }`, `{ tipo, menuBoardId }` ou
     `{ tipo, videoId }`. A ordem é uma só e atravessa os três — "promoção, hambúrgueres,
     filme da casa, combos". */
  async function gravarItens(itens) {
    if (!atual) return
    setOcupado(true)
    try {
      const r = await api.put(`/tv-indoor/playlists/${atual.id}/itens`, { itens })
      const atualizada = r.data?.playlist
      if (atualizada) setPlaylists((ps) => ps.map((p) => (p.id === atualizada.id ? atualizada : p)))
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar a programação.'), type: 'error' }) } finally { setOcupado(false) }
  }

  // A programação como o servidor a espera de volta. O `itemId` (a linha da tabela) fica de
  // fora: quem manda é a POSIÇÃO na lista, e o servidor recria as linhas.
  // A referência que cada tipo usa. Um mapa em vez de condicionais espalhados: o dia em
  // que entrar um quarto tipo, é uma linha aqui — e é exatamente o mesmo mapa que o
  // servidor tem em `tvMenuBoard.js`.
  const CAMPO_DE = { IMAGEM: 'conteudoId', MENU_BOARD: 'menuBoardId', VIDEO: 'videoId' }
  const pecaDoItem = (i) => (i.tipo === 'MENU_BOARD' ? i.board : i.tipo === 'VIDEO' ? i.video : i.conteudo)
  const itensAtuais = () => (atual?.itens ?? [])
    .map((i) => ({ tipo: i.tipo, [CAMPO_DE[i.tipo] ?? 'conteudoId']: pecaDoItem(i)?.id }))
  const PREFIXO = { IMAGEM: 'i', MENU_BOARD: 'b', VIDEO: 'v' }
  const idDoItem = (i) => `${PREFIXO[i.tipo] ?? 'i'}${pecaDoItem(i)?.id}`

  const adicionar = (tipo, id) => gravarItens([
    ...itensAtuais(),
    { tipo, [CAMPO_DE[tipo]]: id },
  ])
  const remover = (indice) => gravarItens(itensAtuais().filter((_, i) => i !== indice))
  const mover = (indice, passo) => {
    const itens = itensAtuais()
    const destino = indice + passo
    if (destino < 0 || destino >= itens.length) return
    ;[itens[indice], itens[destino]] = [itens[destino], itens[indice]]
    gravarItens(itens)
  }

  const dentro = new Set((atual?.itens ?? []).map(idDoItem))
  const foraConteudos = conteudos.filter((c) => !dentro.has(`i${c.id}`))
  const foraBoards = boards.filter((b) => !dentro.has(`b${b.id}`))
  // Vídeo SEM ARQUIVO não entra no acervo: adicioná-lo à programação não faria nada na TV
  // (a régua pública o descarta), e uma linha que "some" na parede é o pior tipo de defeito
  // — o gestor jura que configurou. Ele volta para cá assim que o upload terminar.
  const foraVideos = videos.filter((v) => v.temArquivo && !dentro.has(`v${v.id}`))
  const fora = acervo === 'MENU_BOARDS' ? foraBoards : acervo === 'VIDEOS' ? foraVideos : foraConteudos

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
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="page-header">
        <div>
          <h1>Playlists da TV</h1>
          <div className="page-header-sub">
            A sequência que cada tela reproduz. Uma playlist pode servir <strong>várias TVs</strong> — é em
            Telas que você diz qual delas toca o quê.
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-cab-secao">
          <h2 className="ttm-secao-t">Playlists</h2>
          <span className="ttm-meta-txt">{playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}</span>
          <form className="ttm-cab-acao" onSubmit={criar}>
            <input
              className="form-input"
              style={{ width: 200 }}
              placeholder="Nome da nova playlist"
              maxLength={60}
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              aria-label="Nome da nova playlist"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado || !nova.trim()}>Criar</button>
          </form>
        </div>

        {playlists.length === 0 ? (
          <div className="empty-state">
            Nenhuma playlist ainda. Crie uma acima — depois é só escolher os conteúdos e associá-la a uma TV.
          </div>
        ) : (
          <div className="tvi-abas" role="tablist">
            {playlists.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={atual?.id === p.id}
                className={'tvi-aba' + (atual?.id === p.id ? ' on' : '')}
                onClick={() => setSelecionada(p.id)}
              >
                {p.nome}
                <span className="tvi-aba-n">{p.itens.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {atual && (
        <div className="tvi-split">
          {/* ── A programação, na ordem ─────────────────────────────────── */}
          <div className="table-card" style={{ padding: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">{atual.nome}</h2>
              <span className="ttm-meta-txt">
                {atual.itens.length} {atual.itens.length === 1 ? 'conteúdo' : 'conteúdos'} · {atual.noAr} no ar agora
              </span>
              <div className="ttm-cab-acao">
                <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setRenomeando({ id: atual.id, nome: atual.nome })}>
                  Renomear
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(atual)}>
                  Excluir
                </button>
              </div>
            </div>

            {atual.itens.length === 0 ? (
              <div className="empty-state">
                Playlist vazia. As TVs que a usam mostram a marca da loja até você adicionar um conteúdo ao lado.
              </div>
            ) : (
              <ul className="tvi-lista">
                {atual.itens.map((item, i) => {
                  // Os TRÊS tipos na MESMA lista, com a mesma numeração: é a sequência que a
                  // TV vai reproduzir, e ela não se divide por tipo.
                  const board = item.tipo === 'MENU_BOARD'
                  const video = item.tipo === 'VIDEO'
                  const c = pecaDoItem(item)
                  const ligado = board ? c.ativo !== false : c.status === 'ATIVO'
                  return (
                    <li key={idDoItem(item)} className={'tvi-item' + (ligado ? '' : ' off')}>
                      <span className="tvi-ordem">{i + 1}</span>
                      {board
                        ? <span className="tvi-mini estatica tvi-mini-board" aria-hidden="true">MENU</span>
                        : video
                          ? <span className="tvi-mini estatica tvi-mini-video" aria-hidden="true">VÍDEO</span>
                          : <span className="tvi-mini estatica"><img src={c.imagemUrl} alt="" draggable={false} /></span>}
                      <span className="tvi-item-info">
                        <span className="tvi-item-nome">{c.nome}</span>
                        <span className="tvi-item-meta">
                          {board
                            ? <>
                              <span className="badge badge-slate">Menu board</span>
                              <span className={'badge ' + (c.ativo === false ? 'badge-gray' : 'badge-green')}>{c.ativo === false ? 'Desligado' : 'Ligado'}</span>
                            </>
                            : <span className={'badge ' + STATUS[c.status].cor}>{STATUS[c.status].texto}</span>}
                          {/* Vídeo não tem tempo de tela configurável: quem manda é o
                              arquivo. Mostrar "10s" aqui seria mentira. */}
                          {video
                            ? <><span className="badge badge-slate">Vídeo</span><span>{duracaoDoVideo(c)}</span></>
                            : <span>{c.duracaoSegundos}s</span>}
                        </span>
                      </span>
                      <span className="tvi-item-acoes">
                        {/* Subir/descer em vez de arrastar: funciona no teclado e no toque
                            sem nenhum tratamento especial, que é onde o arrasto não existe. */}
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || i === 0} aria-label={`Subir ${c.nome}`} onClick={() => mover(i, -1)}>↑</button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || i === atual.itens.length - 1} aria-label={`Descer ${c.nome}`} onClick={() => mover(i, 1)}>↓</button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => remover(i)}>Tirar</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── O acervo que ainda não está nela ─────────────────────────── */}
          <div className="table-card" style={{ padding: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Adicionar</h2>
              <span className="ttm-meta-txt">{fora.length} {fora.length === 1 ? 'disponível' : 'disponíveis'}</span>
              {/* TRÊS acervos, um seletor: artes, menu boards e vídeos são naturezas
                  diferentes, mas entram na MESMA programação. Listas empilhadas fariam a
                  última sumir embaixo das outras num cardápio grande. */}
              <div className="ttm-cab-acao tvi-abas">
                <button type="button" className={'tvi-aba' + (acervo === 'CONTEUDOS' ? ' on' : '')} onClick={() => setAcervo('CONTEUDOS')}>
                  Conteúdos<span className="tvi-aba-n">{foraConteudos.length}</span>
                </button>
                <button type="button" className={'tvi-aba' + (acervo === 'MENU_BOARDS' ? ' on' : '')} onClick={() => setAcervo('MENU_BOARDS')}>
                  Menu boards<span className="tvi-aba-n">{foraBoards.length}</span>
                </button>
                <button type="button" className={'tvi-aba' + (acervo === 'VIDEOS' ? ' on' : '')} onClick={() => setAcervo('VIDEOS')}>
                  Vídeos<span className="tvi-aba-n">{foraVideos.length}</span>
                </button>
              </div>
            </div>
            {acervo === 'VIDEOS' ? (
              videos.length === 0 ? (
                <div className="empty-state">Nenhum vídeo ainda. Suba os arquivos em <strong>Vídeos</strong>.</div>
              ) : fora.length === 0 ? (
                <div className="empty-state">
                  {videos.some((v) => !v.temArquivo)
                    ? 'Os vídeos que faltam aqui ou já estão nesta playlist, ou ainda não têm arquivo enviado.'
                    : 'Todos os vídeos já estão nesta playlist.'}
                </div>
              ) : (
                <ul className="tvi-lista">
                  {fora.map((v) => (
                    <li key={v.id} className={'tvi-item' + (v.status === 'ATIVO' ? '' : ' off')}>
                      <span className="tvi-mini estatica tvi-mini-video" aria-hidden="true">VÍDEO</span>
                      <span className="tvi-item-info">
                        <span className="tvi-item-nome">{v.nome}</span>
                        <span className="tvi-item-meta">
                          <span className={'badge ' + STATUS[v.status].cor}>{STATUS[v.status].texto}</span>
                          <span>{duracaoDoVideo(v)}</span>
                          {v.largura && v.altura ? <span>{v.largura} × {v.altura}</span> : null}
                        </span>
                      </span>
                      <span className="tvi-item-acoes">
                        <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => adicionar('VIDEO', v.id)}>Adicionar</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : acervo === 'MENU_BOARDS' ? (
              boards.length === 0 ? (
                <div className="empty-state">Nenhum menu board ainda. Crie um em <strong>Menu Boards</strong>.</div>
              ) : fora.length === 0 ? (
                <div className="empty-state">Todos os menu boards já estão nesta playlist.</div>
              ) : (
                <ul className="tvi-lista">
                  {fora.map((b) => (
                    <li key={b.id} className={'tvi-item' + (b.ativo ? '' : ' off')}>
                      <span className="tvi-mini estatica tvi-mini-board" aria-hidden="true">MENU</span>
                      <span className="tvi-item-info">
                        <span className="tvi-item-nome">{b.nome}</span>
                        <span className="tvi-item-meta">
                          <span className={'badge ' + (b.ativo ? 'badge-green' : 'badge-gray')}>{b.ativo ? 'Ligado' : 'Desligado'}</span>
                          <span>{b.qtdItens} {b.qtdItens === 1 ? 'produto' : 'produtos'}</span>
                          <span>{b.duracaoSegundos}s</span>
                        </span>
                      </span>
                      <span className="tvi-item-acoes">
                        <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => adicionar('MENU_BOARD', b.id)}>Adicionar</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : conteudos.length === 0 ? (
              <div className="empty-state">Nenhum conteúdo no acervo. Suba as imagens em <strong>Conteúdos</strong>.</div>
            ) : fora.length === 0 ? (
              <div className="empty-state">Todos os conteúdos do acervo já estão nesta playlist.</div>
            ) : (
              <ul className="tvi-lista">
                {fora.map((c) => (
                  <li key={c.id} className={'tvi-item' + (c.status === 'ATIVO' ? '' : ' off')}>
                    <span className="tvi-mini estatica"><img src={c.imagemUrl} alt="" draggable={false} /></span>
                    <span className="tvi-item-info">
                      <span className="tvi-item-nome">{c.nome}</span>
                      <span className="tvi-item-meta">
                        <span className={'badge ' + STATUS[c.status].cor}>{STATUS[c.status].texto}</span>
                        <span>{c.duracaoSegundos}s</span>
                      </span>
                    </span>
                    <span className="tvi-item-acoes">
                      <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => adicionar('IMAGEM', c.id)}>Adicionar</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {renomeando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><h2>Renomear playlist</h2></div>
            <div style={{ padding: 16 }}>
              <label className="form-label" htmlFor="tvi-pl-nome">Nome</label>
              <input
                id="tvi-pl-nome"
                className="form-input"
                maxLength={60}
                value={renomeando.nome}
                onChange={(e) => setRenomeando((r) => ({ ...r, nome: e.target.value }))}
              />
            </div>
            <div className="ttm-banner-rodape">
              <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setRenomeando(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={ocupado || !renomeando.nome.trim()} onClick={renomear}>
                {ocupado ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!excluindo}
        variant="danger"
        loading={ocupado}
        title="Excluir esta playlist?"
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description="Os conteúdos NÃO são apagados — eles continuam no acervo. As TVs que usavam esta playlist ficam sem programação e passam a mostrar a marca da loja."
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}
