import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

// Loja Digital › Totem › Personalização › Destaques da vitrine.
//
// Os produtos que passam nas DUAS esteiras da tela de espera — a superior anda para a
// direita, a inferior para a esquerda, e cada uma tem a sua lista. Não se misturam: a loja
// decide o que passa em cada uma e em que ordem, dez em cada.
//
// ── DUAS COLUNAS, E A DA ESQUERDA É A QUE IMPORTA ─────────────────────────────────────
// À esquerda as duas esteiras, cada uma com a sua lista na ORDEM em que vai passar; à
// direita o cardápio para escolher, com um botão por esteira. É a leitura natural do
// trabalho: primeiro se vê o que está montado, depois se procura o que falta.
//
// ── O QUE ESTA TELA NÃO GUARDA ────────────────────────────────────────────────────────
// Nada além de chaves. Nome, preço e foto são do Cardápio Web e chegam aqui do catálogo
// PROJETADO — o mesmo que o cliente vê, com os complementos dos combos expandidos em
// produtos. É por isso que a batata do combo aparece na lista para ser escolhida, e é por
// isso que um produto pode virar ÓRFÃO entre uma visita e outra: saiu do cardápio. A linha
// fica, marcada, com um botão de tirar.
//
// ── SALVAR SUBSTITUI ──────────────────────────────────────────────────────────────────
// O PUT manda as duas listas finais, na ordem final. A ordem sai da posição, nunca de um
// número que o browser inventa.
const ESTEIRAS = [
  { id: 'superior', nome: 'Esteira superior', sentido: 'anda para a direita' },
  { id: 'inferior', nome: 'Esteira inferior', sentido: 'anda para a esquerda' },
]
const VAZIO = { superior: [], inferior: [] }

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
const chavesDe = (escolhidos) => ({
  superior: (escolhidos?.superior ?? []).map((d) => d.chave),
  inferior: (escolhidos?.inferior ?? []).map((d) => d.chave),
})
const iguais = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export default function TotemDestaques() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [dados, setDados] = useState(null)
  // A escolha ao vivo: duas listas de chaves, na ordem. É a única coisa que esta tela edita.
  const [listas, setListas] = useState(VAZIO)
  const [busca, setBusca] = useState('')

  const buscar = useCallback(() => api.get('/totem/destaques')
    .then((r) => {
      setDados(r.data)
      setListas(chavesDe(r.data?.escolhidos))
      setErro(null)
    })
    .catch((e) => setErro(erroDe(e, 'Não foi possível ler os destaques agora.')))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  const catalogo = dados?.catalogo ?? []
  const max = dados?.maxPorEsteira ?? 10

  // Sem `useMemo` à mão: o React Compiler está ligado neste projeto e já memoiza —
  // escrevê-lo faz o compilador DESISTIR do arquivo.
  const porChave = new Map(catalogo.map((i) => [i.chave, i]))
  const gravadas = chavesDe(dados?.escolhidos)
  const temMudanca = !iguais(listas.superior, gravadas.superior) || !iguais(listas.inferior, gravadas.inferior)

  const alvo = busca.trim().toLowerCase()
  const filtrados = !alvo ? catalogo : catalogo.filter(
    (i) => String(i.nome ?? '').toLowerCase().includes(alvo)
      || String(i.categoria ?? '').toLowerCase().includes(alvo),
  )

  // Em qual esteira um produto está, se estiver. Um produto fica numa só.
  const ondeEsta = (chave) => ESTEIRAS.find((e) => listas[e.id].includes(chave))?.id ?? null

  function por(esteira, chave) {
    setListas((atual) => {
      if (atual[esteira].includes(chave)) return atual
      if (atual[esteira].length >= max) {
        setToast({ message: `A ${ESTEIRAS.find((e) => e.id === esteira).nome.toLowerCase()} já tem ${max}. Tire um antes de pôr outro.`, type: 'error' })
        return atual
      }
      // Sai da outra, se estava lá: um produto não passa nas duas.
      const outra = esteira === 'superior' ? 'inferior' : 'superior'
      return { ...atual, [outra]: atual[outra].filter((x) => x !== chave), [esteira]: [...atual[esteira], chave] }
    })
  }

  function tirar(chave) {
    setListas((atual) => ({
      superior: atual.superior.filter((x) => x !== chave),
      inferior: atual.inferior.filter((x) => x !== chave),
    }))
  }

  // Uma casa para cima ou para baixo, dentro da própria esteira. Sem arrastar: dez linhas
  // curtas, e dois botões resolvem sem depender de mouse.
  function mover(esteira, i, passo) {
    const destino = i + passo
    setListas((atual) => {
      const lista = [...atual[esteira]]
      if (destino < 0 || destino >= lista.length) return atual
      ;[lista[i], lista[destino]] = [lista[destino], lista[i]]
      return { ...atual, [esteira]: lista }
    })
  }

  async function salvar() {
    if (!temMudanca || salvando) return
    setSalvando(true)
    try {
      const r = await api.put('/totem/destaques', listas)
      setDados((d) => ({ ...d, escolhidos: r.data?.escolhidos ?? VAZIO }))
      setListas(chavesDe(r.data?.escolhidos))
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

  // Os três motivos de um produto não chegar ao vidro, e cada um tem uma saída diferente:
  // órfão se resolve tirando; sem foto e em falta se resolvem no Cardápio Web.
  const aviso = (p) => (p.orfao
    ? 'Saiu do cardápio — não aparece no totem'
    : !p.imagem
      ? 'Sem foto no cardápio — não aparece na esteira'
      : p.emFalta
        ? 'Em falta no cardápio — não aparece enquanto faltar'
        : null)

  return (
    <>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="page-header">
        <div>
          <h1>Destaques da vitrine</h1>
          <div className="page-header-sub">
            As duas esteiras da tela de espera, cada uma com os seus produtos na ordem em que vão passar.
          </div>
        </div>
      </div>

      <div className="ttm-dst-split">
        {/* ── AS DUAS ESTEIRAS ── */}
        <section className="table-card" style={{ padding: 16 }}>
          {ESTEIRAS.map((e) => {
            const chaves = listas[e.id]
            return (
              <div className="ttm-dst-secao" key={e.id}>
                <h2 className="ttm-secao-t">
                  {e.nome} <span className="ttm-secao-de">{chaves.length} de {max} · {e.sentido}</span>
                </h2>
                {chaves.length === 0 ? (
                  <div className="ttm-dica" style={{ marginTop: 8 }}>Vazia — esta esteira não aparece no totem. Escolha ao lado.</div>
                ) : (
                  <ul className="ttm-dst-lista">
                    {chaves.map((chave, i) => {
                      const p = porChave.get(chave) ?? { chave, nome: null, orfao: true }
                      const problema = aviso(p)
                      return (
                        <li key={chave} className={'ttm-dst' + (p.orfao ? ' orfao' : '')}>
                          <span className="ttm-dst-num">{i + 1}</span>
                          {p.imagem
                            ? <img className="ttm-dst-foto" src={p.imagem} alt="" />
                            : <span className="ttm-dst-foto vazia" aria-hidden="true" />}
                          <div className="ttm-dst-txt">
                            <strong>{p.nome ?? `Produto ${chave}`}</strong>
                            {problema
                              ? <span className="ttm-dst-aviso">{problema}</span>
                              : <span className="ttm-dst-meta">{p.categoria} · {moeda(p.preco)}</span>}
                          </div>
                          <div className="ttm-dst-acoes">
                            <button type="button" className="btn btn-secondary btn-sm" disabled={salvando || i === 0} onClick={() => mover(e.id, i, -1)} aria-label={`Subir ${p.nome ?? chave}`}>↑</button>
                            <button type="button" className="btn btn-secondary btn-sm" disabled={salvando || i === chaves.length - 1} onClick={() => mover(e.id, i, 1)} aria-label={`Descer ${p.nome ?? chave}`}>↓</button>
                            <button type="button" className="btn btn-danger btn-sm" disabled={salvando} onClick={() => tirar(chave)} aria-label={`Tirar ${p.nome ?? chave}`}>Tirar</button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}

          <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={salvar} disabled={!temMudanca || salvando}>
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
            <div className="ttm-dica">{catalogo.length === 0 ? 'O cardápio veio vazio.' : 'Nada com esse nome no cardápio.'}</div>
          ) : (
            <ul className="ttm-dst-lista rolagem">
              {filtrados.map((p) => {
                const onde = ondeEsta(p.chave)
                const problema = aviso(p)
                return (
                  <li key={p.chave} className={'ttm-dst' + (onde ? ' dentro' : '')}>
                    {p.imagem
                      ? <img className="ttm-dst-foto" src={p.imagem} alt="" />
                      : <span className="ttm-dst-foto vazia" aria-hidden="true" />}
                    <div className="ttm-dst-txt">
                      <strong>{p.nome ?? `Produto ${p.chave}`}</strong>
                      {problema
                        ? <span className="ttm-dst-aviso">{problema}</span>
                        : <span className="ttm-dst-meta">{p.categoria} · {moeda(p.preco)}</span>}
                    </div>
                    <div className="ttm-dst-acoes">
                      {onde ? (
                        <>
                          <span className="ttm-dst-onde">{onde === 'superior' ? 'Superior' : 'Inferior'}</span>
                          <button type="button" className="btn btn-danger btn-sm" disabled={salvando} onClick={() => tirar(p.chave)}>Tirar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => por('superior', p.chave)}>Superior</button>
                          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => por('inferior', p.chave)}>Inferior</button>
                        </>
                      )}
                    </div>
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
