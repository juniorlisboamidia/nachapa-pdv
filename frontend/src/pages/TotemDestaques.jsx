import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

// Loja Digital › Totem › Destaques da vitrine.
//
// Os produtos que passam na esteira da tela de espera — a metade de baixo da vitrine, duas
// fileiras andando em sentidos contrários.
//
// ── DUAS COLUNAS, E A DA ESQUERDA É A QUE IMPORTA ─────────────────────────────────────
// À esquerda o que já foi escolhido, na ORDEM em que vai passar; à direita o cardápio para
// escolher. É a leitura natural do trabalho: primeiro se vê o que está montado, depois se
// procura o que falta. O contrário — catálogo à esquerda — faria a tela parecer uma busca
// com um carrinho de lado.
//
// ── O QUE ESTA TELA NÃO GUARDA ────────────────────────────────────────────────────────
// Nada além de ids. Nome, preço e foto são do Cardápio Web e aparecem aqui vindos do
// catálogo vivo, a cada carregamento. É por isso que um produto pode virar ÓRFÃO entre uma
// visita e outra: ele saiu do cardápio. A linha continua na lista, marcada, com um botão de
// remover — sumir sozinha esconderia da loja que ela escolheu doze e só oito estão no ar.
//
// ── SALVAR SUBSTITUI ──────────────────────────────────────────────────────────────────
// O PUT manda a lista final, na ordem final. Não há "adicionar" nem "remover" no servidor:
// o que a tela mostra é o que vai ficar gravado, e a ordem sai da posição, nunca de um
// número que o browser inventa.
const erroDe = (e, fallback) => {
  const cod = e?.response?.data?.erro
  const m = {
    CLIENTE_SEM_CW: 'Esta loja não está ligada ao Cardápio Web.',
    HUB_NAO_CONFIGURADO: 'A ponte com o HUB não está configurada.',
    HUB_INDISPONIVEL: 'O HUB não respondeu agora.',
    CATALOGO_INDISPONIVEL: 'O cardápio não veio completo — nada foi alterado.',
    ENTRADA_INVALIDA: 'A lista enviada não é válida.',
  }
  return m[cod] ?? fallback
}

const moeda = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null)

export default function TotemDestaques() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [dados, setDados] = useState(null)
  // A escolha ao vivo, como lista de ids na ordem. É a única coisa que esta tela edita.
  const [ids, setIds] = useState([])
  const [busca, setBusca] = useState('')

  const buscar = useCallback(() => api.get('/totem/destaques')
    .then((r) => {
      setDados(r.data)
      setIds((r.data?.escolhidos ?? []).map((d) => d.cwItemId))
      setErro(null)
    })
    .catch((e) => setErro(erroDe(e, 'Não foi possível ler os destaques agora.')))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  const catalogo = dados?.catalogo ?? []
  const max = dados?.max ?? 12

  // O catálogo indexado, para a coluna da esquerda desenhar cada escolhido sem varrer a
  // lista inteira a cada linha. Sem `useMemo` à mão: o React Compiler está ligado neste
  // projeto e já memoiza — escrevê-lo mesmo assim faz o compilador DESISTIR do arquivo.
  const porId = new Map(catalogo.map((i) => [i.cwItemId, i]))

  const escolhidos = ids.map((id) => porId.get(id) ?? { cwItemId: id, nome: null, orfao: true })
  const gravados = (dados?.escolhidos ?? []).map((d) => d.cwItemId)
  const temMudanca = ids.length !== gravados.length || ids.some((id, i) => id !== gravados[i])

  const alvo = busca.trim().toLowerCase()
  const filtrados = !alvo ? catalogo : catalogo.filter(
    (i) => String(i.nome ?? '').toLowerCase().includes(alvo)
      || String(i.categoria ?? '').toLowerCase().includes(alvo),
  )

  function alternar(id) {
    setIds((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id)
      if (atual.length >= max) {
        setToast({ message: `O limite é ${max} produtos. Tire um antes de pôr outro.`, type: 'error' })
        return atual
      }
      return [...atual, id]
    })
  }

  // Uma casa para cima ou para baixo. Sem arrastar aqui: a lista tem no máximo doze linhas
  // curtas, e dois botões resolvem sem depender de mouse — o que também vale para o tablet
  // que alguns gestores usam.
  function mover(i, passo) {
    const destino = i + passo
    if (destino < 0 || destino >= ids.length) return
    setIds((atual) => {
      const novo = [...atual]
      ;[novo[i], novo[destino]] = [novo[destino], novo[i]]
      return novo
    })
  }

  async function salvar() {
    if (!temMudanca || salvando) return
    setSalvando(true)
    try {
      const r = await api.put('/totem/destaques', { ids })
      setDados((d) => ({ ...d, escolhidos: r.data?.escolhidos ?? [] }))
      setIds((r.data?.escolhidos ?? []).map((d) => d.cwItemId))
      setToast({ message: 'Destaques salvos. Os totens aplicam na próxima vez que carregarem o cardápio.', type: 'success' })
    } catch (e) {
      setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' })
    } finally { setSalvando(false) }
  }

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
          <h1>Destaques da vitrine</h1>
          <div className="page-header-sub">
            Os produtos que passam na esteira da tela de espera, na ordem em que vão passar.
          </div>
        </div>
      </div>

      <div className="ttm-dst-split">
        {/* ── ESCOLHIDOS ── */}
        <section className="table-card" style={{ padding: 16 }}>
          <h2 className="ttm-secao-t">
            Na esteira <span className="ttm-secao-de">{ids.length} de {max}</span>
          </h2>

          {ids.length === 0 ? (
            <div className="ttm-dica" style={{ marginTop: 12 }}>
              Nenhum produto escolhido — a vitrine mostra só a metade de cima. Escolha ao lado.
            </div>
          ) : (
            <ul className="ttm-dst-lista">
              {escolhidos.map((p, i) => (
                <li key={p.cwItemId} className={'ttm-dst' + (p.orfao ? ' orfao' : '')}>
                  <span className="ttm-dst-num">{i + 1}</span>
                  {p.imagem
                    ? <img className="ttm-dst-foto" src={p.imagem} alt="" />
                    : <span className="ttm-dst-foto vazia" aria-hidden="true" />}
                  <div className="ttm-dst-txt">
                    <strong>{p.nome ?? `Produto #${p.cwItemId}`}</strong>
                    {/* Os dois motivos de um escolhido não chegar ao vidro, e cada um tem uma
                        saída diferente: órfão se resolve aqui, sem foto se resolve no CW. */}
                    {p.orfao
                      ? <span className="ttm-dst-aviso">Saiu do cardápio — não aparece no totem</span>
                      : !p.imagem
                        ? <span className="ttm-dst-aviso">Sem foto no cardápio — não aparece na esteira</span>
                        : <span className="ttm-dst-meta">{p.categoria} · {moeda(p.preco)}</span>}
                  </div>
                  <div className="ttm-dst-acoes">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={salvando || i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${p.nome ?? p.cwItemId}`}>↑</button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={salvando || i === ids.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${p.nome ?? p.cwItemId}`}>↓</button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={salvando} onClick={() => alternar(p.cwItemId)} aria-label={`Tirar ${p.nome ?? p.cwItemId} da esteira`}>Tirar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={salvar} disabled={!temMudanca || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </section>

        {/* ── CATÁLOGO ── */}
        <section className="table-card" style={{ padding: 16 }}>
          <h2 className="ttm-secao-t">Cardápio</h2>
          <input
            className="form-input"
            style={{ marginBottom: 12 }}
            value={busca}
            placeholder="Buscar por nome ou categoria"
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar no cardápio"
          />
          {filtrados.length === 0 ? (
            <div className="ttm-dica">Nada com esse nome no cardápio.</div>
          ) : (
            <ul className="ttm-dst-lista rolagem">
              {filtrados.map((p) => {
                const dentro = ids.includes(p.cwItemId)
                return (
                  <li key={p.cwItemId} className={'ttm-dst' + (dentro ? ' dentro' : '')}>
                    {p.imagem
                      ? <img className="ttm-dst-foto" src={p.imagem} alt="" />
                      : <span className="ttm-dst-foto vazia" aria-hidden="true" />}
                    <div className="ttm-dst-txt">
                      <strong>{p.nome ?? `Produto #${p.cwItemId}`}</strong>
                      {/* O sem-foto aparece na lista, e marcado. Escondê-lo faria a loja
                          procurar um produto que está no cardápio e não achar, sem entender
                          por quê. */}
                      {p.imagem
                        ? <span className="ttm-dst-meta">{p.categoria} · {moeda(p.preco)}</span>
                        : <span className="ttm-dst-aviso">Sem foto — não entra na esteira</span>}
                    </div>
                    <button
                      type="button"
                      className={'btn btn-sm ' + (dentro ? 'btn-secondary' : 'btn-primary')}
                      disabled={salvando}
                      onClick={() => alternar(p.cwItemId)}
                    >
                      {dentro ? 'Tirar' : 'Pôr'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
