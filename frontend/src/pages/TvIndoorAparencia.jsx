// Loja Digital › TV Indoor › Aparência — a identidade visual PRÓPRIA do canal.
//
// Seis cores e uma logo. Elas alcançam o fallback institucional e os três layouts de Menu
// Board — e NÃO a arte que o gestor enviou: uma imagem 1920 × 1080 continua sendo exibida
// como foi criada, sem véu, sem overlay, sem tinta por cima.
//
// ── A PRÉVIA É A PAREDE ───────────────────────────────────────────────────────────────
// O mesmo `components/tv/MenuBoard` que a TV desenha, recebendo os mesmos tokens. Admin e
// parede não podem interpretar a paleta de maneiras diferentes — se desenhassem por
// caminhos separados, o gestor aprovaria uma tela e a loja mostraria outra.
//
// ── OS PADRÕES VÊM DA API ─────────────────────────────────────────────────────────────
// Nada de hexadecimal embarcado aqui: o servidor manda `padroes`, `overrides` e `efetivas`,
// e é isso que a tela lê. Uma cópia dos defaults no React envelheceria no primeiro ajuste
// de marca e passaria a mentir sobre o que a loja está vendo.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import MenuBoard from '../components/tv/MenuBoard'
import { reduzirImagem } from '../lib/reduzirImagem'

const MOTIVOS = {
  CHAVE_DESCONHECIDA: 'Uma das cores enviadas não existe.',
  COR_INVALIDA: 'Informe a cor no formato #RRGGBB.',
  FORMATO_INVALIDO: 'Formato inválido.',
  IMAGEM_AUSENTE: 'Escolha uma imagem.',
  IMAGEM_FORMATO: 'Arquivo inválido. Use PNG, JPG ou WEBP.',
  IMAGEM_TIPO: 'O arquivo não é a imagem que o nome diz ser.',
  IMAGEM_GRANDE: 'A imagem ficou grande demais mesmo depois de reduzida.',
}
const erroDe = (e, fallback) => {
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

// Os rótulos das seis cores. Só texto de tela: as CHAVES e os PADRÕES vêm da API.
const ROTULOS = {
  fundo: { nome: 'Fundo', ajuda: 'O chão de todas as telas da TV.' },
  superficie: { nome: 'Superfície', ajuda: 'A caixa dos cards do menu board.' },
  texto: { nome: 'Texto', ajuda: 'Nome do produto, título, o que se lê.' },
  textoApoio: { nome: 'Texto de apoio', ajuda: 'Descrição, preço antigo, o secundário.' },
  destaque: { nome: 'Destaque', ajuda: 'O preço, o título da tela, o que chama atenção.' },
  textoDestaque: { nome: 'Texto do destaque', ajuda: 'O que se escreve EM CIMA do destaque.' },
}

// Um board fictício, só para a prévia ter o que desenhar. Fixo de propósito: a única
// variável aqui é a paleta, e um produto real mudaria de preço no meio da comparação.
const DEMO = {
  layout: 'GRADE',
  titulo: 'Hambúrgueres',
  produtos: [
    { id: '1', nome: 'X Bacon', preco: 31.9, selo: { texto: 'Mais pedido', cor: '#B45309' } },
    { id: '2', nome: 'X Salada', preco: 19.9, precoAnterior: 25, descontoPercentual: 20 },
    { id: '3', nome: 'Especial da casa', preco: 37.9 },
    { id: '4', nome: 'Combo Família', preco: 89.9 },
  ],
}

export default function TvIndoorAparencia() {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  // O rascunho: o que o gestor está mexendo agora, antes de salvar. A prévia desenha DAQUI,
  // então a consequência de cada escolha aparece no mesmo instante.
  const [rascunho, setRascunho] = useState({})
  const [removendoLogo, setRemovendoLogo] = useState(false)
  const arquivoRef = useRef(null)

  const buscar = useCallback(() => api.get('/tv-indoor/aparencia')
    .then((r) => { setDados(r.data); setRascunho(r.data?.overrides ?? {}); setErro(null) })
    .catch(() => setErro('Não foi possível ler a aparência agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  const chaves = dados?.chaves ?? []
  const padroes = dados?.padroes ?? {}
  // As cores que a prévia desenha: o padrão com o rascunho por cima. Sem `useMemo` à mão —
  // o React Compiler está ligado e escrever a memoização o faz desistir do arquivo.
  const efetivas = { ...padroes, ...rascunho }
  const mudou = JSON.stringify(rascunho) !== JSON.stringify(dados?.overrides ?? {})

  const mudarCor = (chave, valor) => setRascunho((r) => ({ ...r, [chave]: valor }))
  // "Usar padrão" tira o override do rascunho — e é o `null` no PUT que o remove do banco.
  const usarPadrao = (chave) => setRascunho((r) => {
    const prox = { ...r }
    delete prox[chave]
    return prox
  })

  async function salvar() {
    setSalvando(true)
    try {
      // O patch manda `null` nas chaves que o gestor devolveu ao padrão: é assim que o
      // servidor sabe a diferença entre "não mexi" e "quero o padrão de volta".
      const tokens = {}
      for (const chave of chaves) tokens[chave] = rascunho[chave] ?? null
      const r = await api.put('/tv-indoor/aparencia', { tokens })
      setDados(r.data)
      setRascunho(r.data?.overrides ?? {})
      setToast({ message: 'Aparência salva. As TVs pegam no próximo minuto.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setSalvando(false) }
  }

  async function enviarLogo(arquivo) {
    if (!arquivo) return
    setSalvando(true)
    try {
      // 640 px de lado e PNG: a logo precisa da transparência, e numa TV ela nunca passa de
      // meia tela. JPEG a achataria contra um fundo branco que não existe.
      const dataUrl = await reduzirImagem(arquivo, 640, 'image/png')
      const r = await api.put('/tv-indoor/aparencia/logo', { dataUrl })
      setDados(r.data)
      setToast({ message: 'Logo atualizada.', type: 'success' })
    } catch (e) {
      setToast({ message: erroDe(e, 'Não foi possível enviar a logo.'), type: 'error' })
    } finally {
      setSalvando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  async function removerLogo() {
    setSalvando(true)
    try {
      const r = await api.delete('/tv-indoor/aparencia/logo')
      setDados(r.data)
      setRemovendoLogo(false)
      setToast({ message: 'Logo removida.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível remover.'), type: 'error' }) } finally { setSalvando(false) }
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

  const logo = dados?.logo ?? {}
  // O diagnóstico é do que ESTÁ SALVO. Enquanto o gestor mexe, a prévia já mostra o
  // resultado — e recalcular contraste a cada tecla seria uma ida ao servidor por dígito.
  const avisos = (dados?.contraste ?? []).filter((p) => p.medido && !p.aaGrande)

  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="page-header">
        <div>
          <h1>Identidade da TV</h1>
          <div className="page-header-sub">
            A identidade do canal: a logo e seis cores. Elas pintam a <strong>tela de repouso</strong> e os
            <strong> menu boards</strong> — as artes que você envia continuam exatamente como foram criadas.
          </div>
        </div>
      </div>

      <div className="tvi-ap-split">
        <div>
          {/* ── MARCA ───────────────────────────────────────────────── */}
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Marca</h2>
              <span className="ttm-meta-txt">
                {logo.origem === 'PROPRIA' && 'usando a logo do TV Indoor'}
                {logo.origem === 'EMPRESA' && 'sem logo própria — usando a logo da loja'}
                {logo.origem === 'INICIAL' && 'sem logo — a TV mostra a inicial do nome'}
              </span>
            </div>

            <div className="ttm-fundo-linha">
              {logo.tem ? <img className="tvi-ap-logo" src={logo.url} alt="Logo do TV Indoor" /> : null}
              <input
                ref={arquivoRef}
                id="tvap-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="ttm-vis-oculto"
                disabled={salvando}
                onChange={(e) => enviarLogo(e.target.files?.[0])}
              />
              <label htmlFor="tvap-logo" className={'btn btn-secondary' + (salvando ? ' desabilitado' : '')}>
                {logo.tem ? 'Trocar a logo' : 'Escolher logo'}
              </label>
              {logo.tem ? (
                <button type="button" className="btn btn-danger" disabled={salvando} onClick={() => setRemovendoLogo(true)}>
                  Remover
                </button>
              ) : null}
            </div>
            <div className="ttm-dica">
              PNG com <strong>fundo transparente</strong> é o ideal: a logo vai direto sobre o fundo da TV, sem
              placa branca atrás. Sem logo própria, a TV usa a logo da loja — e aí ela ganha uma placa clara,
              porque logo de material impresso costuma vir com fundo branco embutido.
            </div>
          </div>

          {/* ── CORES ───────────────────────────────────────────────── */}
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Cores</h2>
              <span className="ttm-meta-txt">
                {Object.keys(rascunho).length === 0 ? 'tudo no padrão' : `${Object.keys(rascunho).length} personalizada(s)`}
              </span>
              <div className="ttm-cab-acao">
                <button type="button" className="btn btn-primary btn-sm" disabled={salvando || !mudou} onClick={salvar}>
                  {salvando ? 'Salvando…' : 'Salvar cores'}
                </button>
              </div>
            </div>

            <div className="tvi-ap-cores">
              {chaves.map((chave) => {
                const personalizada = rascunho[chave] !== undefined
                const valor = efetivas[chave] ?? '#000000'
                return (
                  <div className="tvi-ap-cor" key={chave}>
                    <label className="form-label" htmlFor={`cor-${chave}`}>
                      {ROTULOS[chave]?.nome ?? chave}
                      {personalizada ? <span className="badge badge-slate tvi-ap-marca">personalizada</span> : null}
                    </label>
                    <div className="tvi-ap-cor-linha">
                      {/* O seletor nativo: o gestor escolhe na roda de cores, e o campo ao
                          lado aceita colar o hexadecimal do guia de marca. */}
                      <input
                        id={`cor-${chave}`}
                        type="color"
                        className="tvi-ap-picker"
                        value={valor}
                        disabled={salvando}
                        onChange={(e) => mudarCor(chave, e.target.value)}
                      />
                      <input
                        className="form-input tvi-ap-hex"
                        value={valor}
                        maxLength={7}
                        disabled={salvando}
                        aria-label={`Código da cor ${ROTULOS[chave]?.nome ?? chave}`}
                        onChange={(e) => mudarCor(chave, e.target.value)}
                      />
                      {personalizada ? (
                        <button type="button" className="btn btn-link ttm-usar-padrao" disabled={salvando} onClick={() => usarPadrao(chave)}>
                          Usar padrão
                        </button>
                      ) : null}
                    </div>
                    <div className="ttm-dica">{ROTULOS[chave]?.ajuda}</div>
                  </div>
                )
              })}
            </div>

            {/* O contraste é AVISO, nunca bloqueio: a TV aceita a decisão do gestor. A frase
                fala de leitura na TV, não de WCAG — quem está aqui quer saber se dá para ler
                de longe, não qual é a razão de luminância. */}
            {avisos.length > 0 && (
              <div className="ttm-alerta-admin">
                <strong>Baixo contraste.</strong> Este texto pode ficar difícil de ler na TV:
                <ul className="tvi-ap-avisos">
                  {avisos.map((p) => <li key={p.id}>{p.rotulo}</li>)}
                </ul>
                Dá para salvar assim mesmo — é só conferir na tela da loja antes de deixar no ar.
              </div>
            )}
          </div>
        </div>

        {/* ── PRÉVIA ────────────────────────────────────────────────── */}
        <div className="tvi-ap-previa">
          <div className="ttm-cab-secao">
            <h2 className="ttm-secao-t">Prévia</h2>
            <span className="ttm-meta-txt">é o mesmo desenho que vai para a TV</span>
          </div>
          {/* O MESMO componente do player, com os tokens do rascunho. */}
          <MenuBoard board={DEMO} tokens={efetivas} />
          <div className="ttm-dica">
            Um menu board de exemplo. As artes que você envia em <strong>Conteúdos</strong> não são afetadas por
            estas cores.
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={removendoLogo}
        variant="danger"
        loading={salvando}
        title="Remover a logo do TV Indoor?"
        message=""
        description="A TV volta a usar a logo da loja — ou a inicial do nome, se não houver nenhuma. O arquivo é apagado e precisa ser enviado de novo para voltar."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={removerLogo}
        onCancel={() => setRemovendoLogo(false)}
      />
    </div>
  )
}
