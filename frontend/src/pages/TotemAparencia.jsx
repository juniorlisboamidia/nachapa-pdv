import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import { ABAS, abaValida } from '../components/totemAparencia'
import { razaoDeContraste, normalizarHex, AA_NORMAL } from '../components/totemTema'
import TotemBanners from './TotemBanners'

// Loja Digital › Totem › Aparência do totem.
//
// A aba vem da URL (`/totem/aparencia/:aba`) porque a Aparência é FOLHA da sidebar — a
// Sidebar desenha três níveis, e a profundidade extra se resolve aqui dentro em vez de
// aprofundar o menu inteiro da aplicação para servir um caso só.
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
export default function TotemAparencia() {
  const { aba: abaParam } = useParams()
  const aba = abaValida(abaParam)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Aparência do totem</h1>
          <div className="page-header-sub">
            Como o totem se apresenta ao cliente: identidade, cores e o lado das categorias.
          </div>
        </div>
      </div>

      <nav className="ttm-abas" aria-label="Seções da aparência">
        {ABAS.map((a) => (
          <NavLink
            key={a.id}
            to={`/totem/aparencia/${a.id}`}
            className={'ttm-aba' + (a.id === aba ? ' ativa' : '')}
            aria-current={a.id === aba ? 'page' : undefined}
          >
            {a.label}
          </NavLink>
        ))}
      </nav>

      {aba === 'personalizacao' ? <Personalizacao /> : <TotemBanners />}
    </div>
  )
}

// ── Personalização ─────────────────────────────────────────────────────────
const ROTULOS = {
  fundo: 'Fundo', cartao: 'Cartão', texto: 'Texto',
  textoApoio: 'Texto de apoio', acaoFundo: 'Ação', acaoTexto: 'Texto da ação',
}
const AJUDA = {
  fundo: 'O preto da tela inteira.',
  cartao: 'O bloco atrás de cada produto.',
  texto: 'Nome do produto, preço, títulos.',
  textoApoio: 'Descrições e informações secundárias.',
  acaoFundo: 'Botões e a categoria selecionada.',
  acaoTexto: 'O texto escrito em cima dos botões.',
}

function Personalizacao() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [dados, setDados] = useState(null)      // resposta do GET, o que está SALVO
  const [rascunho, setRascunho] = useState({})  // { chave: hex } — o que está na tela
  const [posicao, setPosicao] = useState('esquerda')
  const arquivoRef = useRef(null)

  // Não marca estado de forma síncrona: o efeito de montagem só AGENDA o trabalho.
  const buscar = useCallback(() => api.get('/totem/aparencia')
    .then((r) => {
      setDados(r.data)
      // O rascunho nasce das EFETIVAS, não dos overrides: o campo tem de mostrar a cor
      // que está no vidro, mesmo quando ela vem do padrão.
      setRascunho(r.data?.efetivas ?? {})
      setPosicao(r.data?.posicaoCategoriasPadrao ?? 'esquerda')
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
  const temMudanca = Object.keys(patch).length > 0 || trocouPosicao

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
      const r = await api.put('/totem/aparencia', corpo)
      setDados((d) => ({ ...d, ...r.data }))
      setRascunho(r.data?.efetivas ?? rascunho)
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

      {/* ── CORES ── */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">Cores</h2>
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

        <Previa cores={rascunho} />
      </div>

      {/* ── LAYOUT ── */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 className="ttm-secao-t">Layout</h2>
        <div className="form-group" style={{ margin: 0, maxWidth: 360 }}>
          <label className="form-label" htmlFor="apa-posicao">Posição das categorias</label>
          <select id="apa-posicao" className="form-input" value={posicao} disabled={salvando} onChange={(e) => setPosicao(e.target.value)}>
            <option value="esquerda">Coluna à esquerda</option>
            <option value="direita">Coluna à direita</option>
          </select>
          <div className="ttm-dica">Vale para todos os totens da loja.</div>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={salvar} disabled={!temMudanca || salvando}>
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </>
  )
}

// Prévia com as cores do rascunho, antes de salvar. Não é o quiosque inteiro: é um card de
// produto e um botão, que é onde as seis cores se encontram.
function Previa({ cores }) {
  const c = (k, alt) => normalizarHex(cores[k]) ?? alt
  return (
    <div className="ttm-previa" style={{ background: c('fundo', '#000000') }}>
      <div className="ttm-previa-card" style={{ background: c('cartao', '#131211') }}>
        <div className="ttm-previa-foto" />
        <div className="ttm-previa-nome" style={{ color: c('texto', '#ffffff') }}>X BURGUER</div>
        <div className="ttm-previa-desc" style={{ color: c('textoApoio', '#d79e00') }}>Carne 56G, queijo muçarela, alface e tomate</div>
        <div className="ttm-previa-preco" style={{ color: c('texto', '#ffffff') }}>R$ 16,00</div>
      </div>
      <div className="ttm-previa-botao" style={{ background: c('acaoFundo', '#d79e00'), color: c('acaoTexto', '#000000') }}>
        Ir para o pagamento
      </div>
    </div>
  )
}

// Reduz no CLIENTE antes de subir: 300 KB é teto de servidor, não de logo. Uma imagem de
// 4000px vinda do celular do gestor passaria do limite sem necessidade nenhuma.
function reduzirImagem(arquivo, lado = 640) {
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
        // PNG preserva a transparência, que é o que uma logo costuma precisar.
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
}
