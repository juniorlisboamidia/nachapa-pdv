// Loja Digital › TV Indoor › Menu Boards — as telas montadas com o CATÁLOGO REAL da loja.
//
// Aqui o gestor NÃO digita preço. Ele escolhe um layout fechado e diz quais produtos
// aparecem; nome, preço, foto, promoção e disponibilidade vêm do Cardápio Web a cada
// exibição. Mudou o preço lá, mudou na parede no próximo refresh.
//
// ── O QUE ESTA TELA NÃO É ─────────────────────────────────────────────────────────────
// Não é um editor de design. Não há arrastar blocos, escolher quantas colunas, trocar
// fonte ou cor. Três layouts, e cada um é uma composição pensada para 1920 × 1080 — o que
// o gestor decide é o CONTEÚDO.
//
// ── A PRÉVIA É O PLAYER ───────────────────────────────────────────────────────────────
// O mesmo componente (`components/tv/MenuBoard`) e a mesma resolução do servidor
// (`resolverMenuBoard`). Se o admin desenhasse por um caminho e a TV por outro, o gestor
// aprovaria uma tela e a loja mostraria outra.
import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import MenuBoard from '../components/tv/MenuBoard'
// O teto ABSOLUTO da seleção guardada — o mesmo do domínio, que é quem recusa na escrita.
const TETO_SELECAO = 12
import { previaDoBoard } from '../components/tvMenuBoardPrevia'

const MOTIVOS = {
  NOME_OBRIGATORIO: 'Dê um nome ao menu board.',
  LAYOUT_INVALIDO: 'Escolha um dos layouts disponíveis.',
  DURACAO_INVALIDA: 'A duração está fora da faixa permitida.',
  ITENS_INVALIDOS: 'A seleção de produtos não é válida.',
  LIMITE_DE_ITENS: 'Este layout não comporta tantos produtos.',
  DESTAQUE_INVALIDO: 'Só um produto pode ser o destaque, e só no layout que tem destaque.',
}
const ERROS_CATALOGO = {
  CLIENTE_SEM_CW: 'Esta loja ainda não está ligada ao Cardápio Web. Vincule o cliente para montar um menu board.',
  HUB_NAO_CONFIGURADO: 'A ponte com o Cardápio Web ainda não está configurada para esta loja.',
  HUB_INDISPONIVEL: 'Não foi possível ler o cardápio agora. Tente de novo em instantes.',
  CATALOGO_INDISPONIVEL: 'O cardápio não pôde ser lido agora. Tente de novo em instantes.',
}
const erroDe = (e, fallback) => {
  const d = e?.response?.data
  if (d?.erros?.length) return MOTIVOS[d.erros[0].motivo] ?? fallback
  return ERROS_CATALOGO[d?.erro] ?? d?.error ?? fallback
}

const moeda = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—')
const chave = (v) => String(v)

export default function TvIndoorMenuBoards() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [boards, setBoards] = useState([])
  const [layouts, setLayouts] = useState([])
  const [limites, setLimites] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  const buscar = useCallback(() => api.get('/tv-indoor/menu-boards')
    .then((r) => {
      setBoards(Array.isArray(r.data?.menuBoards) ? r.data.menuBoards : [])
      setLayouts(Array.isArray(r.data?.layouts) ? r.data.layouts : [])
      setLimites(r.data?.limites ?? null)
      setErro(null)
    })
    // A LISTAGEM não depende do catálogo: ela abre mesmo com o HUB fora do ar. Quem precisa
    // do cardápio é a edição, e lá o erro é tratado de perto.
    .catch(() => setErro('Não foi possível ler os menu boards agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  async function alternar(b) {
    setOcupado(true)
    try {
      await api.put(`/tv-indoor/menu-boards/${b.id}`, { ativo: !b.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(`/tv-indoor/menu-boards/${excluindo.id}`)
      setExcluindo(null)
      await buscar()
      setToast({ message: 'Menu board excluído.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function salvar(form) {
    setOcupado(true)
    try {
      const corpo = {
        nome: form.nome,
        layout: form.layout,
        duracaoSegundos: Number(form.duracaoSegundos),
        titulo: form.titulo,
        subtitulo: form.subtitulo,
        mostrarLogo: form.mostrarLogo === true,
        mostrarDescricao: form.mostrarDescricao === true,
        mostrarImagem: form.mostrarImagem === true,
        mostrarFita: form.mostrarFita !== false,
        configuracao: { cwCategoriaId: form.cwCategoriaId || undefined, itens: form.itens },
      }
      if (form.id) await api.put(`/tv-indoor/menu-boards/${form.id}`, corpo)
      else await api.post('/tv-indoor/menu-boards', corpo)
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Menu board atualizado.' : 'Menu board criado.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  const rotuloLayout = (id) => layouts.find((l) => l.id === id)?.rotulo ?? id

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
          <h1>Menu boards</h1>
          <div className="page-header-sub">
            Telas montadas com o <strong>cardápio real</strong> da loja. Preço, foto e disponibilidade vêm do
            Cardápio Web — mudou lá, muda na TV. Aqui você escolhe o layout e quais produtos aparecem.
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-cab-secao">
          <h2 className="ttm-secao-t">Menu boards</h2>
          <span className="ttm-meta-txt">
            {boards.length} {boards.length === 1 ? 'board' : 'boards'} · {boards.filter((b) => b.ativo).length} ligados
          </span>
          <div className="ttm-cab-acao">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ocupado}
              onClick={() => setEditando({
                id: null, nome: '', layout: 'GRADE', duracaoSegundos: limites?.duracaoPadrao ?? 20,
                titulo: '', subtitulo: '', cwCategoriaId: '', itens: [],
                // Os defaults do board NOVO são os mesmos do banco: o que o V1 desenhava.
                mostrarLogo: false, mostrarDescricao: false, mostrarImagem: false, mostrarFita: true,
              })}
            >
              Novo menu board
            </button>
          </div>
        </div>

        {boards.length === 0 ? (
          <div className="empty-state">
            Nenhum menu board ainda. Crie um para a TV alternar entre as artes promocionais e o cardápio.
          </div>
        ) : (
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Layout</th>
                <th>Produtos</th>
                <th className="ttm-nowrap">Duração</th>
                <th>Situação</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id} className={b.ativo ? undefined : 'tvi-linha-off'}>
                  <td>
                    <button type="button" className="tvi-nome" disabled={ocupado} onClick={() => setEditando({ ...b, cwCategoriaId: b.cwCategoriaId ?? '', titulo: b.titulo ?? '', subtitulo: b.subtitulo ?? '' })}>
                      {b.nome}
                    </button>
                    {b.titulo ? <div className="ttm-meta-txt">título na tela: {b.titulo}</div> : null}
                  </td>
                  <td>{rotuloLayout(b.layout)}</td>
                  <td className="ttm-nowrap">{b.qtdItens} de {b.maximo}</td>
                  <td className="ttm-nowrap">{b.duracaoSegundos}s</td>
                  <td>
                    <span className={'badge ' + (b.ativo ? 'badge-green' : 'badge-gray')}>{b.ativo ? 'Ligado' : 'Desligado'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="ttm-acoes">
                      <button
                        type="button"
                        className={'intel-switch' + (b.ativo ? ' on' : '')}
                        role="switch"
                        aria-checked={b.ativo}
                        aria-label={`${b.ativo ? 'Desligar' : 'Ligar'} ${b.nome}`}
                        disabled={ocupado}
                        onClick={() => alternar(b)}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(b)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <Editor
          valor={editando}
          layouts={layouts}
          limites={limites}
          ocupado={ocupado}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvar}
          aoAvisar={(m, t = 'error') => setToast({ message: m, type: t })}
        />
      )}

      <ConfirmDialog
        open={!!excluindo}
        variant="danger"
        loading={ocupado}
        title="Excluir este menu board?"
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description="Ele sai de todas as playlists em que estiver. Os produtos do cardápio NÃO são afetados — isto aqui é só a tela."
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────
/* A exibição resolvida para a PRÉVIA. Espelha `exibicaoDoBoard` do servidor, e o formato
   das opções vem de lá (`opcoes`), então não há uma segunda tabela aqui dizendo qual
   template honra qual chave — o que existe é a aplicação da mesma resposta. */
function exibicaoDoForm(form, regra) {
  const oferece = (chave) => (regra.opcoes ?? []).includes(chave)
  return {
    logo: form.mostrarLogo === true,
    fita: form.mostrarFita !== false,
    // Quando o template não oferece a escolha, é porque a composição decide: a Vitrine
    // mostra foto sempre, a Lista mostra descrição sempre.
    imagem: oferece('imagem') ? form.mostrarImagem === true : regra.imagem !== 'NUNCA',
    descricao: oferece('descricao') ? form.mostrarDescricao === true : regra.descricao !== 'NUNCA',
    descricaoSoNoDestaque: regra.descricao === 'HERO',
  }
}

/* Uma MINIATURA do template, desenhada em CSS. Não é imagem: são quatro divs, e um
   wireframe de verdade diz mais do que a palavra "Vitrine" para quem nunca viu a tela. */
function Miniatura({ id }) {
  const blocos = {
    GRADE: <><i /><i /><i /><i /><i /><i /><i /><i /></>,
    DESTAQUE: <><i className="g" /><i /><i /><i /><i /></>,
    LISTA: <><i className="l" /><i className="l" /><i className="l" /><i className="l" /></>,
    VITRINE: <><i className="v" /><i className="v" /><i className="v" /></>,
    OFERTA: <><i className="o" /></>,
  }
  return <span className={'tvi-mini-tpl tpl-' + id.toLowerCase()} aria-hidden="true">{blocos[id] ?? blocos.GRADE}</span>
}

function Editor({ valor, layouts, limites, ocupado, aoFechar, aoSalvar, aoAvisar }) {
  const [form, setForm] = useState(valor)
  const [catalogo, setCatalogo] = useState(null)      // { categorias, desatualizado }
  const [erroCatalogo, setErroCatalogo] = useState(null)
  const [carregandoCat, setCarregandoCat] = useState(true)
  const [filtro, setFiltro] = useState('')            // id da categoria, '' = todas

  useEffect(() => {
    let vivo = true
    api.get('/tv-indoor/catalogo')
      .then((r) => { if (vivo) { setCatalogo(r.data); setErroCatalogo(null) } })
      .catch((e) => { if (vivo) setErroCatalogo(erroDe(e, 'Não foi possível ler o cardápio agora.')) })
      .finally(() => { if (vivo) setCarregandoCat(false) })
    return () => { vivo = false }
  }, [])

  const regra = layouts.find((l) => l.id === form.layout) ?? { maximo: 8, destaque: false }
  const escolhidos = form.itens ?? []

  // Índice do catálogo por id, para resolver os escolhidos. Sem `useMemo` à mão: o React
  // Compiler está ligado neste projeto e escrever a memoização o faz desistir do arquivo.
  const porId = new Map()
  for (const c of catalogo?.categorias ?? []) for (const i of c.itens ?? []) porId.set(chave(i.id), { ...i, categoria: c.nome })

  const mudar = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function alternarProduto(id) {
    const k = chave(id)
    const jaTem = escolhidos.some((i) => chave(i.cwItemId) === k)
    if (jaTem) { mudar('itens', escolhidos.filter((i) => chave(i.cwItemId) !== k)); return }
    /* O teto de ESCOLHA é o absoluto (12), não o do template: dá para preparar uma seleção
       maior e experimentar templates diferentes sem perder nada. O que o template limita é
       quantos APARECEM, e o contador acima diz isso. */
    if (escolhidos.length >= TETO_SELECAO) { aoAvisar(`São no máximo ${TETO_SELECAO} produtos guardados por board.`); return }
    if (escolhidos.length >= regra.maximo) {
      aoAvisar(`${regra.rotulo} mostra ${regra.maximo}. Este produto fica guardado e aparece se você trocar de template.`, 'info')
    }
    mudar('itens', [...escolhidos, { cwItemId: id }])
  }

  const mover = (indice, passo) => {
    const destino = indice + passo
    if (destino < 0 || destino >= escolhidos.length) return
    const copia = escolhidos.slice()
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    mudar('itens', copia)
  }

  // O destaque é exclusivo: marcar um desmarca o outro. Guardar dois seria guardar uma
  // escolha que o layout ignora — o servidor recusa, e a tela não deve nem oferecer.
  const marcarDestaque = (id) => {
    const k = chave(id)
    mudar('itens', escolhidos.map((i) => (chave(i.cwItemId) === k ? { ...i, destaque: true } : { cwItemId: i.cwItemId })))
  }

  /* Trocar de layout pode estourar o teto do novo (DESTAQUE tem 5, GRADE tem 8). Em vez de
     recusar no salvamento — depois de o gestor já ter montado tudo —, a seleção é CORTADA
     na hora, com aviso. E o destaque some quando o layout não o tem: guardá-lo seria manter
     uma escolha invisível. */
  function trocarLayout(novo) {
    const regraNova = layouts.find((l) => l.id === novo) ?? { maximo: 8, destaque: false }
    /* A seleção NÃO é cortada. Antes ela era, e isso destruía trabalho em silêncio: quem
       montou uma grade de oito e clicou na Vitrine para "dar uma olhada" perdia cinco
       produtos sem chance de voltar atrás.

       Agora tudo fica guardado, o board público recebe os N primeiros elegíveis, e voltar
       para a Grade recupera a seleção inteira. O aviso diz quantos aparecem — a informação
       que antes só chegava pela parede. */
    if (escolhidos.length > regraNova.maximo) {
      aoAvisar(`${regraNova.rotulo ?? novo} mostra ${regraNova.maximo} de ${escolhidos.length} produtos. Nada foi perdido: os demais voltam se você trocar de template.`, 'info')
    }
    setForm((f) => ({ ...f, layout: novo }))
  }

  /* A PRÉVIA, montada por `tvMenuBoardPrevia` — e não à mão aqui.

     A regra de promoção, de selo e de indisponível é a MESMA do servidor, e um teste
     (`tvMenuBoardPrevia.test.js`) roda os dois lados nos mesmos casos e falha se eles
     divergirem. É o que impede o gestor de aprovar uma tela e a loja mostrar outra.

     Produto que sumiu do catálogo não entra na prévia — e aparece na lista de escolhidos
     marcado como "não encontrado", que é onde ele precisa ser visto. */
  const previa = previaDoBoard({
    layout: form.layout,
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    escolhidos,
    porId,
    selos: catalogo?.selos,
    // O teto do template: a prévia mostra exatamente o que a parede mostraria, e não a
    // seleção inteira. É a diferença entre "o que eu escolhi" e "o que vai aparecer".
    maximo: regra.maximo,
    exibicao: exibicaoDoForm(form, regra),
  })

  const categorias = catalogo?.categorias ?? []
  const visiveis = filtro ? categorias.filter((c) => chave(c.id) === filtro) : categorias

  function tentarSalvar() {
    if (ocupado) return
    if (!String(form.nome ?? '').trim()) { aoAvisar('Dê um nome para achar este board na lista.'); return }
    aoSalvar(form)
  }

  return (
    // Modal fecha só por botão — regra do projeto.
    <div className="modal-overlay">
      <div className="modal tvi-mb-modal">
        <div className="modal-header"><h2>{form.id ? 'Editar menu board' : 'Novo menu board'}</h2></div>

        <div className="tvi-mb-corpo">
          {/* ── Coluna 1: o que o board é ─────────────────────────────── */}
          <div className="tvi-mb-col">
            <div className="form-group">
              <label className="form-label" htmlFor="mb-nome">Nome <span className="ttm-obrigatorio" aria-hidden="true">*</span></label>
              <input id="mb-nome" className="form-input" maxLength={60} value={form.nome} onChange={(e) => mudar('nome', e.target.value)} placeholder="Ex.: Hambúrgueres" />
              <div className="ttm-dica">Só para achar na lista. Na tela aparece o título abaixo.</div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mb-titulo">Título na tela</label>
              <input id="mb-titulo" className="form-input" maxLength={60} value={form.titulo} onChange={(e) => mudar('titulo', e.target.value)} placeholder="Ex.: OS MAIS PEDIDOS" />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mb-sub">Subtítulo</label>
              <input id="mb-sub" className="form-input" maxLength={100} value={form.subtitulo} onChange={(e) => mudar('subtitulo', e.target.value)} placeholder="Ex.: Escolha o seu favorito" />
              <div className="ttm-dica">Título e subtítulo em branco: o board aparece sem cabeçalho nenhum.</div>
            </div>

            <div className="form-group">
              <label className="form-label">Template</label>
              <div className="tvi-mb-layouts">
                {layouts.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={'tvi-mb-layout' + (form.layout === l.id ? ' on' : '')}
                    aria-pressed={form.layout === l.id}
                    onClick={() => trocarLayout(l.id)}
                  >
                    {/* Wireframe desenhado em CSS: o gestor escolhe olhando a FORMA. "Vitrine"
                        não diz nada para quem nunca viu a tela; três retângulos grandes dizem. */}
                    <Miniatura id={l.id} />
                    <span className="tvi-mb-layout-nome">{l.rotulo}</span>
                    <span className="tvi-mb-layout-max">até {l.maximo}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* EXIBIÇÃO — só os interruptores que ESTE template honra. A lista vem do
                servidor junto com o template: oferecer um controle sem efeito é ensinar o
                gestor a desconfiar da tela inteira. */}
            <div className="form-group">
              <label className="form-label">Exibição</label>
              <div className="tvi-mb-switches">
                {(regra.opcoes ?? []).map((op) => {
                  const campo = { logo: 'mostrarLogo', fita: 'mostrarFita', descricao: 'mostrarDescricao', imagem: 'mostrarImagem' }[op]
                  const rotulo = {
                    logo: 'Mostrar a logo da loja',
                    fita: 'Mostrar as fitas dos produtos',
                    descricao: 'Mostrar a descrição dos produtos',
                    imagem: 'Mostrar as fotos',
                  }[op]
                  const ligado = campo === 'mostrarFita' ? form.mostrarFita !== false : form[campo] === true
                  return (
                    <label key={op} className="tvi-mb-switch">
                      <button
                        type="button"
                        className={'intel-switch' + (ligado ? ' on' : '')}
                        role="switch"
                        aria-checked={ligado}
                        aria-label={rotulo}
                        onClick={() => mudar(campo, !ligado)}
                      />
                      <span>{rotulo}</span>
                    </label>
                  )
                })}
              </div>
              <div className="ttm-dica">
                A logo vem de <strong>TV Indoor › Aparência</strong> — uma marca, uma fonte.
                {regra.imagem === 'SEMPRE' ? ' Este template sempre mostra as fotos.' : ''}
                {regra.descricao === 'SEMPRE' ? ' E sempre mostra a descrição.' : ''}
                {regra.descricao === 'HERO' ? ' A descrição aparece só no produto em destaque.' : ''}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mb-dur">Tempo na tela</label>
              <input
                id="mb-dur" type="number" className="form-input" style={{ maxWidth: 140 }}
                min={limites?.duracaoMin ?? 5} max={limites?.duracaoMax ?? 120}
                value={form.duracaoSegundos} onChange={(e) => mudar('duracaoSegundos', e.target.value)}
              />
              <div className="ttm-dica">
                Segundos, de {limites?.duracaoMin ?? 5} a {limites?.duracaoMax ?? 120}. Um menu precisa de mais tempo que uma arte — quem passa tem de achar o produto e o preço.
              </div>
            </div>

            {/* ── Os escolhidos, na ordem ──────────────────────────────── */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Produtos{' '}
                {/* Quando a seleção passa do que o template mostra, o contador diz os DOIS
                    números: nada foi perdido, e o gestor precisa saber quantos aparecem. */}
                <span className="ttm-contador">
                  {escolhidos.length > regra.maximo
                    ? `${regra.maximo} de ${escolhidos.length} na tela`
                    : `${escolhidos.length}/${regra.maximo}`}
                </span>
              </label>
              {escolhidos.length === 0 ? (
                <div className="ttm-dica">Escolha os produtos na lista ao lado.</div>
              ) : (
                <ul className="tvi-lista">
                  {escolhidos.map((e, i) => {
                    const p = porId.get(chave(e.cwItemId))
                    return (
                      <li className={'tvi-item' + (p ? '' : ' off')} key={chave(e.cwItemId)}>
                        <span className="tvi-ordem">{i + 1}</span>
                        <span className="tvi-item-info">
                          {/* Produto que sumiu do catálogo NÃO é apagado em silêncio: a
                              referência fica, e o gestor decide se remove ou troca. */}
                          <span className="tvi-item-nome">{p ? p.nome : `#${chave(e.cwItemId)}`}</span>
                          <span className="tvi-item-meta">
                            {p
                              ? <>{moeda(typeof p.precoPromocional === 'number' ? p.precoPromocional : p.preco)}
                                {p.status && p.status !== 'ACTIVE' ? <span className="badge badge-gray">Indisponível</span> : null}</>
                              : <span className="ttm-erro">Produto não encontrado no catálogo</span>}
                          </span>
                        </span>
                        <span className="tvi-item-acoes">
                          {regra.destaque && (
                            <button
                              type="button"
                              className={'btn btn-sm ' + (e.destaque ? 'btn-primary' : 'btn-secondary')}
                              title="Usar como destaque"
                              onClick={() => marcarDestaque(e.cwItemId)}
                            >
                              ★
                            </button>
                          )}
                          <button type="button" className="btn btn-secondary btn-sm" disabled={i === 0} aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={i === escolhidos.length - 1} aria-label="Descer" onClick={() => mover(i, 1)}>↓</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternarProduto(e.cwItemId)}>Tirar</button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── Coluna 2: o cardápio ──────────────────────────────────── */}
          <div className="tvi-mb-col">
            <div className="ttm-cab-secao">
              <h3 className="ttm-secao-t">Cardápio</h3>
              {catalogo?.desatualizado && (
                <span className="ttm-meta-txt">mostrando a última leitura boa do cardápio</span>
              )}
              <div className="ttm-cab-acao">
                <select className="form-input" style={{ width: 200 }} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por categoria">
                  <option value="">Todas as categorias</option>
                  {categorias.map((c) => <option key={chave(c.id)} value={chave(c.id)}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            {carregandoCat ? (
              <div className="loading-state">Lendo o cardápio…</div>
            ) : erroCatalogo ? (
              <div className="empty-state">{erroCatalogo}</div>
            ) : (
              <div className="tvi-mb-catalogo">
                {visiveis.map((c) => (
                  <section key={chave(c.id)}>
                    <h4 className="tvi-mb-cat">{c.nome}</h4>
                    <ul className="tvi-lista">
                      {(c.itens ?? []).map((i) => {
                        const dentro = escolhidos.some((e) => chave(e.cwItemId) === chave(i.id))
                        const indisponivel = i.status && i.status !== 'ACTIVE'
                        return (
                          <li className={'tvi-item' + (indisponivel ? ' off' : '')} key={chave(i.id)}>
                            <span className="tvi-item-info">
                              <span className="tvi-item-nome">{i.nome}</span>
                              <span className="tvi-item-meta">
                                {moeda(typeof i.precoPromocional === 'number' ? i.precoPromocional : i.preco)}
                                {/* Indisponível pode ser escolhido: ele volta ao cardápio
                                    amanhã, e o board simplesmente não o mostra enquanto
                                    estiver fora. Esconder aqui obrigaria a refazer a
                                    seleção toda vez que um item faltasse. */}
                                {indisponivel ? <span className="badge badge-gray">Indisponível agora</span> : null}
                              </span>
                            </span>
                            <span className="tvi-item-acoes">
                              <button
                                type="button"
                                className={'btn btn-sm ' + (dentro ? 'btn-secondary' : 'btn-primary')}
                                onClick={() => alternarProduto(i.id)}
                              >
                                {dentro ? 'Tirar' : 'Adicionar'}
                              </button>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* ── Coluna 3: a prévia ────────────────────────────────────── */}
          <div className="tvi-mb-col">
            <div className="ttm-cab-secao">
              <h3 className="ttm-secao-t">Prévia</h3>
              <span className="ttm-meta-txt">é o mesmo desenho que vai para a TV</span>
            </div>
            <MenuBoard board={previa} />
            {previa.produtos.length === 0 && (
              <div className="ttm-dica">
                Sem produto disponível, este board <strong>não entra</strong> na programação: a TV pula para o próximo item.
              </div>
            )}
          </div>
        </div>

        <div className="ttm-banner-rodape">
          <button type="button" className="btn btn-secondary" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
