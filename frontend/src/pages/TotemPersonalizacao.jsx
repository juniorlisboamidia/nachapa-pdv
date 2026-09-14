import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import PreviaVitrine from '../components/PreviaVitrine'
import { razaoDeContraste, normalizarHex, AA_NORMAL } from '../components/totemTema'

// Loja Digital › Totem › Personalização.
//
// Era uma aba dentro de "Aparência do totem". Virou subcategoria própria na sidebar, que é
// como o resto do PDV se organiza: aba dentro de página cria um segundo sistema de
// navegação, e o operador passa a ter de lembrar em qual dos dois procurar.
//
// ── SOBRE O DESIGN SYSTEM, e é o que mais importa deste arquivo ───────────────────────
// O tema do totem nasce INDEPENDENTE do Design System do HUB. Não é intenção: já é fato.
// O `totem.css` recebeu as cores da marca como valores LITERAIS e não consome nada do HUB
// em tempo de execução — o quiosque roda com a rede caindo e continua com a identidade
// certa. O que esta tela faz é deixar a loja SOBRESCREVER esses literais, e o que ela não
// sobrescrever continua vindo da folha.
//
// O caminho futuro é "Importar identidade": um botão que traz os valores do HUB para
// dentro do canal, uma vez, com o gestor vendo o que mudou. Origem opcional, nunca
// dependência de runtime.
const ROTULOS = {
  fundo: 'Fundo', cartao: 'Cartão', texto: 'Texto',
  textoApoio: 'Texto de apoio', acaoFundo: 'Ação', acaoTexto: 'Texto da ação',
}
/* Os dois fundos. O rótulo é o que o gestor lê; a escada é a prévia — três degraus e o
   dourado, que é literalmente o que distingue um do outro. */
const FUNDOS = [
  {
    id: 'PADRAO',
    nome: 'Fundo padrão',
    resumo: 'Escuro. É como o totem sai de fábrica.',
    escada: ['#0f0e0d', '#161513', '#1e1b18', '#fab319'],
  },
  {
    id: 'CLARO',
    nome: 'Fundo claro',
    resumo: 'O mesmo desenho, espelhado. A logo ganha uma placa escura.',
    escada: ['#eae8e4', '#f2f0ec', '#ffffff', '#8a5b00'],
  },
]

const AJUDA = {
  fundo: 'A tela inteira, atrás de tudo.',
  cartao: 'O bloco atrás de cada produto.',
  texto: 'Nome do produto, preço, títulos.',
  textoApoio: 'Descrições e informações secundárias.',
  acaoFundo: 'Botões e a categoria selecionada.',
  acaoTexto: 'O texto escrito em cima dos botões.',
}

export default function TotemPersonalizacao() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [dados, setDados] = useState(null)      // resposta do GET, o que está SALVO
  const [rascunho, setRascunho] = useState({})  // { chave: hex } — o que está na tela
  const [posicao, setPosicao] = useState('esquerda')
  // O fundo que a loja está EDITANDO, que é sempre o que está salvo: trocar de fundo grava
  // na hora, e não fica pendurado no botão Salvar junto com as cores. Ver `trocarFundo`.
  const [fundo, setFundo] = useState('PADRAO')
  const [confirmandoFundo, setConfirmandoFundo] = useState(null)
  // '' na tela significa "sem personalização" e vira `null` no banco. São a MESMA coisa
  // para o gestor (o campo está vazio) e coisas diferentes para o JSON, então a conversão
  // acontece num lugar só, na hora de montar o corpo.
  const [chamada, setChamada] = useState('')
  // Título e subtítulo da vitrine. '' na tela é "sem texto" e vira `null` no banco — aqui
  // ausência NÃO tem padrão de fábrica: a tela simplesmente não desenha a linha.
  const [titulo, setTitulo] = useState('')
  const [subtitulo, setSubtitulo] = useState('')
  // A frase da faixa entre as metades. '' = padrão ("Nossos produtos"), como a chamada.
  const [fraseMeio, setFraseMeio] = useState('')
  const arquivoRef = useRef(null)
  const fundoRef = useRef(null)

  // Não marca estado de forma síncrona: o efeito de montagem só AGENDA o trabalho.
  const buscar = useCallback(() => api.get('/totem/aparencia')
    .then((r) => {
      setDados(r.data)
      // O rascunho nasce das EFETIVAS, não dos overrides: o campo tem de mostrar a cor
      // que está no vidro, mesmo quando ela vem do padrão.
      setRascunho(r.data?.efetivas ?? {})
      setPosicao(r.data?.posicaoCategoriasPadrao ?? 'esquerda')
      setFundo(r.data?.layoutFundo ?? 'PADRAO')
      setChamada(r.data?.chamadaEspera ?? '')
      setTitulo(r.data?.tituloEspera ?? '')
      setSubtitulo(r.data?.subtituloEspera ?? '')
      setFraseMeio(r.data?.fraseMeioEspera ?? '')
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler a aparência agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  if (carregando) return <div className="loading-state">Carregando…</div>
  if (erro) {
    return (
      <div className="empty-state">
        <div style={{ marginBottom: 12 }}>{erro}</div>
        <button type="button" className="btn btn-primary" onClick={() => { setCarregando(true); buscar() }}>Tentar de novo</button>
      </div>
    )
  }

  const chaves = dados?.chaves ?? []
  const padroes = dados?.padroes ?? {}
  const overrides = dados?.overrides ?? {}
  const pares = dados?.contraste ?? []

  // O que mudou em relação ao que está salvo. `null` no patch = remover o override.
  const patch = {}
  for (const k of chaves) {
    const atual = normalizarHex(rascunho[k])
    const efetiva = dados?.efetivas?.[k]
    if (!atual || atual === efetiva) continue
    patch[k] = atual
  }
  const trocouPosicao = posicao !== dados?.posicaoCategoriasPadrao
  const chamadaLimpa = chamada.trim()
  const trocouChamada = chamadaLimpa !== (dados?.chamadaEspera ?? '')
  const chamadaMax = dados?.chamadaMax ?? 32
  const chamadaLonga = [...chamadaLimpa].length > chamadaMax
  const tituloLimpo = titulo.trim()
  const subtituloLimpo = subtitulo.trim()
  const tituloMax = dados?.tituloMax ?? 40
  const subtituloMax = dados?.subtituloMax ?? 90
  const tituloLongo = [...tituloLimpo].length > tituloMax
  const subtituloLongo = [...subtituloLimpo].length > subtituloMax
  const trocouTitulo = tituloLimpo !== (dados?.tituloEspera ?? '')
  const trocouSubtitulo = subtituloLimpo !== (dados?.subtituloEspera ?? '')
  const fraseMeioLimpa = fraseMeio.trim()
  const fraseMeioMax = dados?.fraseMeioMax ?? 30
  const fraseMeioLonga = [...fraseMeioLimpa].length > fraseMeioMax
  const trocouFraseMeio = fraseMeioLimpa !== (dados?.fraseMeioEspera ?? '')
  const algoLongo = chamadaLonga || tituloLongo || subtituloLongo || fraseMeioLonga
  const temMudanca = Object.keys(patch).length > 0 || trocouPosicao || trocouChamada
    || trocouTitulo || trocouSubtitulo || trocouFraseMeio

  // Diagnóstico ao vivo, com as cores do RASCUNHO. Os pares vêm do servidor (é ele que
  // define quais importam); só a razão é recalculada aqui, para não ir ao servidor a
  // cada pixel arrastado no seletor.
  const avisos = pares.map((p) => {
    const r = razaoDeContraste(rascunho[p.frente], rascunho[p.tras])
    return { ...p, r, ruim: r !== null && r < AA_NORMAL }
  }).filter((p) => p.ruim)

  async function salvar() {
    if (!temMudanca || salvando) return
    setSalvando(true)
    try {
      const corpo = {}
      if (Object.keys(patch).length) corpo.tokens = patch
      if (trocouPosicao) corpo.posicaoCategoriasPadrao = posicao
      // Vazio vira `null`: é o caminho explícito de "voltar ao texto de fábrica".
      if (trocouChamada) corpo.chamadaEspera = chamadaLimpa || null
      if (trocouTitulo) corpo.tituloEspera = tituloLimpo || null
      if (trocouSubtitulo) corpo.subtituloEspera = subtituloLimpo || null
      if (trocouFraseMeio) corpo.fraseMeioEspera = fraseMeioLimpa || null
      const r = await api.put('/totem/aparencia', corpo)
      setDados((d) => ({ ...d, ...r.data }))
      setRascunho(r.data?.efetivas ?? rascunho)
      setChamada(r.data?.chamadaEspera ?? '')
      setTitulo(r.data?.tituloEspera ?? '')
      setSubtitulo(r.data?.subtituloEspera ?? '')
      setFraseMeio(r.data?.fraseMeioEspera ?? '')
      setToast({ message: 'Aparência salva. Os totens aplicam na próxima vez que carregarem o cardápio.', type: 'success' })
    } catch (e) {
      const erros = e?.response?.data?.erros
      setToast({ message: erros?.length ? `Não foi possível salvar: ${erros.map((x) => x.chave).join(', ')}.` : 'Não foi possível salvar.', type: 'error' })
    } finally { setSalvando(false) }
  }

  // Voltar UMA cor ao padrão é uma operação de contrato: manda `null` naquela chave.
  async function usarPadrao(chave) {
    if (salvando) return
    setSalvando(true)
    try {
      const r = await api.put('/totem/aparencia', { tokens: { [chave]: null } })
      setDados((d) => ({ ...d, ...r.data }))
      setRascunho((x) => ({ ...x, [chave]: r.data?.efetivas?.[chave] }))
      setToast({ message: `${ROTULOS[chave]} voltou ao padrão.`, type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível restaurar.', type: 'error' })
    } finally { setSalvando(false) }
  }

  /* Trocar o fundo GRAVA na hora, e não espera o botão Salvar.

     Não é atalho: as seis cores são guardadas por fundo, e é o fundo que diz qual conjunto
     está em edição. Deixar a troca pendurada no Salvar junto com as cores criaria a
     pergunta "em qual fundo estas cores vão cair?" — e qualquer resposta seria surpresa
     para metade dos casos.

     Por isso também a confirmação: se houver cor mexida e não salva, ela se perde, porque
     pertence ao fundo que está saindo. O gestor decide, com o modal dizendo o que perde. */
  async function trocarFundo(id) {
    if (salvando || id === fundo) return
    if (temMudanca) { setConfirmandoFundo(id); return }
    await gravarFundo(id)
  }

  async function gravarFundo(id) {
    setSalvando(true)
    setConfirmandoFundo(null)
    try {
      const r = await api.put('/totem/aparencia', { layoutFundo: id })
      setDados((d) => ({ ...d, ...r.data }))
      // O rascunho é REFEITO das efetivas do fundo novo. Manter as cores anteriores na
      // tela mostraria a paleta de um fundo sobre a prévia do outro.
      setRascunho(r.data?.efetivas ?? {})
      setFundo(r.data?.layoutFundo ?? id)
      setPosicao(r.data?.posicaoCategoriasPadrao ?? posicao)
      setToast({ message: `${FUNDOS.find((f) => f.id === id)?.nome} aplicado. Os totens trocam na próxima vez que carregarem o cardápio.`, type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível trocar o fundo.', type: 'error' })
    } finally { setSalvando(false) }
  }

  async function enviarLogo(arquivo) {
    if (!arquivo) return
    setSalvando(true)
    try {
      const dataUrl = await reduzirImagem(arquivo)
      const r = await api.put('/totem/aparencia/logo', { dataUrl })
      setDados((d) => ({ ...d, logo: r.data.logo }))
      setToast({ message: 'Logo do totem atualizada.', type: 'success' })
    } catch (e) {
      const cod = e?.response?.data?.erro
      const msg = cod === 'LOGO_GRANDE' ? `A imagem ficou acima de ${dados?.limiteLogoKb ?? 300} KB mesmo depois de reduzida. Use uma logo mais simples.`
        : cod === 'LOGO_TIPO' || cod === 'LOGO_FORMATO' ? 'Use um arquivo PNG, JPG ou WEBP.'
          : 'Não foi possível enviar a logo.'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSalvando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  /* A foto de fundo sobe NA HORA, como a logo — não espera o Salvar. Uma foto é escolha
     terminada no momento em que se escolhe o arquivo; deixar pendurada no botão junto com
     os textos faria o gestor achar que subiu quando não subiu.
     JPEG a 1920 de lado maior: é fotografia, e PNG guardaria a mesma imagem em três vezes o
     tamanho — o teto de 700 KB é do servidor, não do arquivo que vem do celular. */
  async function enviarFundo(arquivo) {
    if (!arquivo) return
    setSalvando(true)
    try {
      // Lado maior a 1440, e não 1920: o alvo é 1080 × 960, então 1920 só engordaria o
      // arquivo. A folga sobre 1080 existe para uma foto mandada em pé (errada, mas comum)
      // não ficar com menos de 800px de largura depois de reduzida.
      const dataUrl = await reduzirImagem(arquivo, 1440, 'image/jpeg')
      const r = await api.put('/totem/aparencia/fundo', { dataUrl })
      setDados((d) => ({ ...d, fundo: r.data.fundo }))
      setToast({ message: 'Foto de fundo atualizada.', type: 'success' })
    } catch (e) {
      const cod = e?.response?.data?.erro
      const msg = cod === 'IMAGEM_GRANDE' ? `A imagem ficou acima de ${dados?.fundo?.limiteKb ?? 700} KB mesmo depois de reduzida.`
        : cod === 'IMAGEM_TIPO' || cod === 'IMAGEM_FORMATO' ? 'Use um arquivo PNG, JPG ou WEBP.'
          : 'Não foi possível enviar a foto.'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSalvando(false)
      if (fundoRef.current) fundoRef.current.value = ''
    }
  }
  async function removerFundo() {
    setSalvando(true)
    try {
      const r = await api.delete('/totem/aparencia/fundo')
      setDados((d) => ({ ...d, fundo: r.data.fundo }))
      setToast({ message: 'A tela de espera voltou a usar o fundo do template.', type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível tirar a foto.', type: 'error' })
    } finally { setSalvando(false) }
  }
  async function removerLogo() {
    setSalvando(true)
    try {
      const r = await api.delete('/totem/aparencia/logo')
      setDados((d) => ({ ...d, logo: r.data.logo }))
      setToast({ message: 'O totem voltou a usar a logo do Cardápio Web.', type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível remover a logo.', type: 'error' })
    } finally { setSalvando(false) }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Personalização</h1>
          <div className="page-header-sub">
            Como o totem se apresenta ao cliente: identidade, cores e o lado das categorias.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* ── MARCA ── */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">Marca</h2>
        <div className="ttm-nota" style={{ marginTop: 0 }}>
          A logo do Cardápio Web é feita para fundo claro; no vidro preto do totem ela vira uma placa branca.
          Uma logo própria daqui <strong>substitui</strong> a do cardápio, e só no totem.
        </div>
        <div className="ttm-logo-linha">
          <div className="ttm-logo-previa" style={{ background: rascunho.fundo || '#000' }}>
            {dados?.logo?.tem
              ? <img src={dados.logo.url} alt="Logo do totem" />
              : <span className="ttm-dica" style={{ margin: 0 }}>Usando a logo do Cardápio Web</span>}
          </div>
          <div className="ttm-logo-acoes">
            <input
              ref={arquivoRef}
              id="apa-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="form-input"
              disabled={salvando}
              onChange={(e) => enviarLogo(e.target.files?.[0])}
            />
            <div className="ttm-dica">PNG, JPG ou WEBP. A imagem é reduzida antes de subir; o limite é {dados?.limiteLogoKb ?? 300} KB.</div>
            {dados?.logo?.tem && (
              <button type="button" className="btn btn-secondary" onClick={removerLogo} disabled={salvando}>
                Voltar à logo do Cardápio Web
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TELA DE ESPERA (a vitrine) ──
          Logo depois da Marca: é a segunda coisa que identifica a loja no vidro, e a tela que
          fica horas acesa. Tudo EXPOSTO, sem modal — é UMA foto, UM título, UM subtítulo, UMA
          frase do meio e UM botão, o padrão da loja.

          A composição segue o resto do PDV: a foto numa linha como a logo em Marca, e os
          textos numa GRADE de duas colunas (a mesma `ttm-aparencia-grade` das cores), na
          ordem em que aparecem no vidro — título, subtítulo, botão, frase do meio. Nenhum
          campo com largura própria: quem dimensiona é a grade, e a prévia fica ao lado,
          grande o bastante para ser lida. */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">Tela de espera</h2>
        <div className="ttm-nota" style={{ marginTop: 0 }}>
          É a tela <strong>padrão</strong> do totem: fica no vidro sempre que não há banner no ar.
          Deixe em branco o que não quiser mostrar — a tela se compõe sem.
        </div>

        <div className="ttm-vit-split">
          <div>
            <div className="form-group">
              <label className="form-label" htmlFor="apa-fundo">Foto de fundo</label>
              <div className="ttm-fundo-linha">
                {dados?.fundo?.tem ? <img className="ttm-fundo-atual" src={dados.fundo.url} alt="Foto de fundo atual" /> : null}
                <input
                  ref={fundoRef}
                  id="apa-fundo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="ttm-vis-oculto"
                  disabled={salvando}
                  onChange={(e) => enviarFundo(e.target.files?.[0])}
                />
                <label htmlFor="apa-fundo" className={'btn btn-secondary' + (salvando ? ' desabilitado' : '')}>
                  {dados?.fundo?.tem ? 'Trocar a foto' : 'Escolher foto'}
                </label>
                {dados?.fundo?.tem ? (
                  <button type="button" className="btn btn-danger" onClick={removerFundo} disabled={salvando}>
                    Remover
                  </button>
                ) : null}
              </div>
              <div className="ttm-dica">
                {dados?.fundo?.medida?.largura ?? 1080} × {dados?.fundo?.medida?.altura ?? 960} px — a metade de cima da tela.
                PNG, JPG ou WEBP até {dados?.fundo?.limiteKb ?? 700} KB; reduzida antes de subir.
              </div>
            </div>

            {/* Duas colunas FIXAS, não auto-fit: num monitor largo o auto-fit abria quatro e
                deixava o Título sozinho na linha. Título | Subtítulo em cima, Botão | Frase
                do meio embaixo — a ordem de leitura do vidro, sem célula vazia. */}
            <div className="ttm-vit-campos">
              <div className="form-group">
                <label className="form-label" htmlFor="apa-titulo">
                  Título <span className="ttm-contador">{[...tituloLimpo].length}/{tituloMax}</span>
                </label>
                <input
                  id="apa-titulo"
                  className={'form-input' + (tituloLongo ? ' invalido' : '')}
                  value={titulo}
                  disabled={salvando}
                  placeholder="Ex.: Bateu a fome?"
                  onChange={(e) => setTitulo(e.target.value)}
                  aria-invalid={tituloLongo ? 'true' : undefined}
                />
                <div className={tituloLongo ? 'ttm-erro-campo' : 'ttm-dica'} role={tituloLongo ? 'alert' : undefined}>
                  {tituloLongo ? `Passou de ${tituloMax} caracteres.` : 'Em branco, a tela não mostra título.'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="apa-subtitulo">
                  Subtítulo <span className="ttm-contador">{[...subtituloLimpo].length}/{subtituloMax}</span>
                </label>
                <input
                  id="apa-subtitulo"
                  className={'form-input' + (subtituloLongo ? ' invalido' : '')}
                  value={subtitulo}
                  disabled={salvando}
                  placeholder="Ex.: Monte seu pedido em poucos toques e retire no balcão"
                  onChange={(e) => setSubtitulo(e.target.value)}
                  aria-invalid={subtituloLongo ? 'true' : undefined}
                />
                <div className={subtituloLongo ? 'ttm-erro-campo' : 'ttm-dica'} role={subtituloLongo ? 'alert' : undefined}>
                  {subtituloLongo ? `Passou de ${subtituloMax} caracteres.` : 'Em branco, a tela não mostra subtítulo.'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="apa-chamada">
                  Texto do botão <span className="ttm-contador">{[...chamadaLimpa].length}/{chamadaMax}</span>
                </label>
                <input
                  id="apa-chamada"
                  className={'form-input' + (chamadaLonga ? ' invalido' : '')}
                  value={chamada}
                  disabled={salvando}
                  placeholder={dados?.chamadaPadrao ?? 'Toque para começar'}
                  onChange={(e) => setChamada(e.target.value)}
                  aria-invalid={chamadaLonga ? 'true' : undefined}
                />
                <div className={chamadaLonga ? 'ttm-erro-campo' : 'ttm-dica'} role={chamadaLonga ? 'alert' : undefined}>
                  {chamadaLonga
                    ? `Passou de ${chamadaMax} caracteres — quebraria em duas linhas.`
                    : `Em branco, “${dados?.chamadaPadrao ?? 'Toque para começar'}”. O totem escreve em caixa alta.`}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="apa-frase-meio">
                  Frase do meio <span className="ttm-contador">{[...fraseMeioLimpa].length}/{fraseMeioMax}</span>
                </label>
                <input
                  id="apa-frase-meio"
                  className={'form-input' + (fraseMeioLonga ? ' invalido' : '')}
                  value={fraseMeio}
                  disabled={salvando}
                  placeholder={dados?.fraseMeioPadrao ?? 'Nossos produtos'}
                  onChange={(e) => setFraseMeio(e.target.value)}
                  aria-invalid={fraseMeioLonga ? 'true' : undefined}
                />
                <div className={fraseMeioLonga ? 'ttm-erro-campo' : 'ttm-dica'} role={fraseMeioLonga ? 'alert' : undefined}>
                  {fraseMeioLonga
                    ? `Passou de ${fraseMeioMax} caracteres.`
                    : `A faixa entre a foto e as esteiras. Em branco, “${dados?.fraseMeioPadrao ?? 'Nossos produtos'}”.`}
                </div>
              </div>
            </div>
          </div>

          {/* A prévia usa o RASCUNHO (cores e textos ainda não salvos) e a foto já gravada. Os
              produtos da esteira são blocos neutros: eles se escolhem em Destaques da vitrine. */}
          <div className="ttm-vit-lado">
            <div className="ttm-pv-cab"><h3 className="ttm-pv-tit">Prévia</h3></div>
            <PreviaVitrine
              cores={rascunho}
              fundoUrl={dados?.fundo?.tem ? dados.fundo.url : null}
              titulo={tituloLimpo}
              subtitulo={subtituloLimpo}
              chamada={chamadaLimpa || dados?.chamadaPadrao}
              fraseMeio={fraseMeioLimpa || dados?.fraseMeioPadrao}
            />
          </div>
        </div>
      </div>

      {/* ── CORES ── */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">
          Cores <span className="ttm-secao-de">do {FUNDOS.find((f) => f.id === fundo)?.nome.toLowerCase() ?? 'fundo padrão'}</span>
        </h2>
        <div className="ttm-nota" style={{ marginTop: 0 }}>
          O que você não mudar continua com a cor padrão do totem.
        </div>

        <div className="ttm-cores">
          {chaves.map((k) => {
            const personalizada = Object.prototype.hasOwnProperty.call(overrides, k)
            return (
              <div key={k} className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor={`cor-${k}`}>
                  {ROTULOS[k] ?? k}
                  {personalizada && <span className="badge badge-orange" style={{ marginLeft: 8 }}>Personalizada</span>}
                </label>
                <div className="ttm-cor-linha">
                  <input
                    id={`cor-${k}`}
                    type="color"
                    className="ttm-cor-picker"
                    value={normalizarHex(rascunho[k]) ?? padroes[k] ?? '#000000'}
                    disabled={salvando}
                    onChange={(e) => setRascunho((x) => ({ ...x, [k]: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="form-input ttm-cor-hex"
                    value={rascunho[k] ?? ''}
                    maxLength={7}
                    disabled={salvando}
                    onChange={(e) => setRascunho((x) => ({ ...x, [k]: e.target.value }))}
                  />
                </div>
                <div className="ttm-dica">{AJUDA[k]}</div>
                {personalizada && (
                  <button type="button" className="btn btn-link ttm-usar-padrao" onClick={() => usarPadrao(k)} disabled={salvando}>
                    Usar padrão ({padroes[k]})
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Aviso, não bloqueio: a loja salva o que quiser, mas não sem ser avisada. */}
        {avisos.length > 0 && (
          <div className="ttm-aviso-contraste">
            <strong>Baixo contraste</strong> — este texto pode ficar difícil de ler no totem:
            <ul>
              {avisos.map((p) => <li key={p.id}>{p.rotulo}</li>)}
            </ul>
          </div>
        )}

        <Previa cores={rascunho} padroes={padroes} />
      </div>

      {/* ── LAYOUT ── */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">Layout</h2>

        {/* O fundo vem ANTES da posição das categorias: é a decisão maior das duas, e é
            ela que define quais cores a seção acima está editando. */}
        <div className="form-group">
          <span className="form-label">Fundo</span>
          <div className="ttm-fundos" role="radiogroup" aria-label="Fundo do totem">
            {FUNDOS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={fundo === f.id}
                className={'ttm-fundo-opt' + (fundo === f.id ? ' on' : '')}
                disabled={salvando}
                onClick={() => trocarFundo(f.id)}
              >
                {/* A escada, que é literalmente o que separa um fundo do outro:
                    chão, coluna, cartão e o dourado do preço. */}
                <span className="ttm-fundo-escada" aria-hidden="true">
                  {f.escada.map((cor) => <span key={cor} style={{ background: cor }} />)}
                </span>
                <span className="ttm-fundo-txt">
                  <strong>{f.nome}</strong>
                  <span>{f.resumo}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="ttm-dica">
            Cada fundo guarda as SUAS cores. Trocar aqui troca a paleta junto — e voltar traz de volta o que estava.
          </div>
        </div>

        <div className="form-group" style={{ margin: 0, maxWidth: 360 }}>
          <label className="form-label" htmlFor="apa-posicao">Posição das categorias</label>
          <select id="apa-posicao" className="form-input" value={posicao} disabled={salvando} onChange={(e) => setPosicao(e.target.value)}>
            <option value="esquerda">Coluna à esquerda</option>
            <option value="direita">Coluna à direita</option>
          </select>
          <div className="ttm-dica">Vale para todos os totens da loja.</div>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={salvar} disabled={!temMudanca || salvando || algoLongo}>
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>

      <ConfirmDialog
        open={!!confirmandoFundo}
        loading={salvando}
        title="Trocar o fundo agora?"
        message={confirmandoFundo ? FUNDOS.find((f) => f.id === confirmandoFundo)?.nome : ''}
        description="Você mexeu em cores e ainda não salvou. Elas pertencem ao fundo atual e se perdem na troca — cada fundo guarda as suas."
        confirmLabel="Trocar mesmo assim"
        onConfirm={() => gravarFundo(confirmandoFundo)}
        onCancel={() => setConfirmandoFundo(null)}
      />
    </>
  )
}

// Prévia com as cores do rascunho, antes de salvar. Não é o quiosque inteiro: é um card de
// produto e um botão, que é onde as seis cores se encontram.
function Previa({ cores, padroes }) {
  // A reserva vem dos PADRÕES DO FUNDO em vigor, e não de hexadecimais digitados aqui:
  // com dois fundos, um literal escuro pintaria a prévia do claro de preto enquanto o
  // gestor mexe. O padrão já é do fundo certo porque o servidor o devolve assim.
  const c = (k) => normalizarHex(cores[k]) ?? padroes?.[k] ?? '#000000'
  return (
    <div className="ttm-previa" style={{ background: c('fundo') }}>
      <div className="ttm-previa-card" style={{ background: c('cartao') }}>
        <div className="ttm-previa-foto" />
        <div className="ttm-previa-nome" style={{ color: c('texto') }}>X BURGUER</div>
        <div className="ttm-previa-desc" style={{ color: c('textoApoio') }}>Carne 56G, queijo muçarela, alface e tomate</div>
        <div className="ttm-previa-preco" style={{ color: c('texto') }}>R$ 16,00</div>
      </div>
      <div className="ttm-previa-botao" style={{ background: c('acaoFundo'), color: c('acaoTexto') }}>
        Ir para o pagamento
      </div>
    </div>
  )
}

// Reduz no CLIENTE antes de subir: 300 KB é teto de servidor, não de logo. Uma imagem de
// 4000px vinda do celular do gestor passaria do limite sem necessidade nenhuma.
function reduzirImagem(arquivo, lado = 640, formato = 'image/png') {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('leitura'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('imagem'))
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * escala))
        const h = Math.max(1, Math.round(img.height * escala))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // PNG preserva a transparência, que é o que uma logo costuma precisar. A foto de
        // fundo pede JPEG: é fotografia, e transparência ali não serve para nada.
        resolve(formato === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png'))
      }
      img.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
}
