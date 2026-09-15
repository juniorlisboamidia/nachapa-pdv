// Loja Digital › TV Indoor › Vídeos — o terceiro tipo de peça da programação.
//
// ── POR QUE ESTA TELA NÃO É A DE CONTEÚDOS COM UM CAMPO A MAIS ────────────────────────
// Porque um vídeo não é uma imagem grande. Três coisas mudam e cada uma aparece aqui:
//
//  · O ARQUIVO SOBE SOZINHO. Cadastro e arquivo são duas chamadas: o POST cria a linha, o
//    PUT do arquivo manda os bytes. É o que permite a barra de progresso ser REAL (ela lê
//    quantos bytes o navegador já entregou) e é o que faz corrigir um nome não obrigar
//    ninguém a reenviar 80 MB.
//
//  · EXISTE UM VÍDEO SEM ARQUIVO. Entre criar o cadastro e o upload terminar — ou quando o
//    upload falha — a linha existe e não toca. Esse estado tem nome próprio na lista
//    ("Falta o arquivo"), em vez de aparecer como "Desligado", que mentiria sobre a causa.
//
//  · DURAÇÃO NÃO É ESCOLHA. Em Conteúdos o gestor digita quantos segundos a arte fica na
//    tela. Aqui não existe esse campo: quem manda é o arquivo. A duração que a lista mostra
//    é INFORMATIVA — veio do navegador de quem enviou, o servidor não tem ffprobe, e a tela
//    diz isso em vez de fingir uma medição que não houve.
//
// ── ESPAÇO ────────────────────────────────────────────────────────────────────────────
// Vídeo ocupa disco de verdade, e por isso a tela mostra o consumo da loja ANTES de alguém
// escolher um arquivo. Descobrir a cota só no erro do upload é descobrir tarde.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { arquivoConfirmado, ehErroDeProtocolo, erroDeProtocolo, idDoVideoCriado } from '../lib/respostaDeVideo'

const STATUS = {
  ATIVO: { texto: 'No ar', cor: 'badge-green' },
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Desligado', cor: 'badge-gray' },
  // Estado PRÓPRIO do vídeo: a linha existe, o arquivo não. Chamar isso de "Desligado"
  // mandaria o gestor procurar um interruptor que não resolve nada.
  SEM_ARQUIVO: { texto: 'Falta o arquivo', cor: 'badge-red' },
}

const MOTIVOS = {
  NOME_OBRIGATORIO: 'Dê um nome ao vídeo.',
  DATA_INVALIDA: 'A data informada não é válida.',
  JANELA_INVALIDA: 'O fim precisa ser depois do início.',
  VIDEO_TIPO: 'Esse arquivo não é um MP4 nem um WebM. A extensão pode enganar — o que vale é o conteúdo.',
  VIDEO_GRANDE: 'O arquivo passa do tamanho máximo por vídeo.',
  VIDEO_VAZIO: 'O arquivo chegou vazio.',
  COTA_EXCEDIDA: 'A loja chegou ao limite de espaço. Exclua algum vídeo antes de subir este.',
  DISCO_CHEIO: 'O servidor está sem espaço agora. Avise o suporte.',
  UPLOAD_INTERROMPIDO: 'O envio foi interrompido antes do fim. Tente de novo.',
}

const erroDe = (e, fallback) => {
  // Resposta que não é a desta chamada (redirect, proxy, página de erro devolvendo 200) não
  // é "erro do servidor": ninguém recusou nada e repetir do mesmo jeito dá no mesmo. A
  // frase precisa mandar quem lê para o lugar certo, que é a infraestrutura.
  if (ehErroDeProtocolo(e)) {
    return 'O servidor respondeu de um jeito inesperado e o envio foi interrompido por segurança. Nada foi confirmado. Se repetir, é configuração do servidor — avise o suporte.'
  }
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

/* O `datetime-local` fala em hora LOCAL do navegador; o banco guarda instante absoluto. A
   conversão usa o fuso de quem configura, que é o fuso da loja — a agenda não depende de
   onde o servidor está hospedado. (Mesmo par de Conteúdos: os dois domínios são irmãos,
   mas nenhum importa do outro — a duplicação de seis linhas é mais barata que um acoplamento
   entre duas telas que podem divergir.) */
function paraIso(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}
function paraCampo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function textoAgenda(v) {
  if (!v.inicioEm && !v.fimEm) return 'Sem agenda'
  const f = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (v.inicioEm && v.fimEm) return `${f(v.inicioEm)} → ${f(v.fimEm)}`
  if (v.inicioEm) return `A partir de ${f(v.inicioEm)}`
  return `Até ${f(v.fimEm)}`
}

const mb = (bytes) => {
  if (bytes == null) return '—'
  const n = Number(bytes)
  if (!Number.isFinite(n)) return '—'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`
}

const relogio = (ms) => {
  if (!ms) return null
  const s = Math.round(Number(ms) / 1000)
  if (!Number.isFinite(s) || s <= 0) return null
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const vazio = () => ({ id: null, nome: '', inicioEm: '', fimEm: '', arquivo: null, meta: null })
const deVideo = (v) => ({
  id: v.id, nome: v.nome, inicioEm: paraCampo(v.inicioEm), fimEm: paraCampo(v.fimEm),
  arquivo: null, meta: null, temArquivo: v.temArquivo,
})

/* Duração e resolução lidas NO NAVEGADOR, antes de subir. Servem para duas coisas: mostrar
   ao gestor o que ele escolheu (a hora de descobrir que o vídeo tem 4 minutos é agora, não
   quando ele já está na parede) e viajar como metadata informativa nos cabeçalhos.

   Se falhar, segue sem: o arquivo sobe igual. Metadata é conveniência, não requisito — e um
   codec que este navegador não decodifica ainda pode ser perfeitamente válido na TV. */
function lerMetadata(arquivo) {
  return new Promise((resolve) => {
    let url = null
    const el = document.createElement('video')
    const fim = (valor) => { if (url) URL.revokeObjectURL(url); el.removeAttribute('src'); resolve(valor) }
    el.preload = 'metadata'
    el.muted = true
    el.onloadedmetadata = () => fim({
      duracaoMs: Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : null,
      largura: el.videoWidth || null,
      altura: el.videoHeight || null,
    })
    el.onerror = () => fim(null)
    try { url = URL.createObjectURL(arquivo); el.src = url } catch { fim(null) }
  })
}

export default function TvIndoorVideos() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [lista, setLista] = useState([])
  const [limites, setLimites] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)
  const [vendo, setVendo] = useState(null)
  // Quantos por cento do arquivo já subiram. `null` quando não há envio em curso — e é essa
  // distinção que faz a barra aparecer só durante o upload, em vez de ficar zerada na tela.
  const [progresso, setProgresso] = useState(null)

  const buscar = useCallback(() => api.get('/tv-indoor/videos')
    .then((r) => {
      setLista(Array.isArray(r.data?.videos) ? r.data.videos : [])
      setLimites(r.data?.limites ?? null)
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler os vídeos agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  async function alternar(v) {
    setOcupado(true)
    try {
      await api.put(`/tv-indoor/videos/${v.id}`, { ativo: !v.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(`/tv-indoor/videos/${excluindo.id}`)
      setExcluindo(null)
      await buscar()
      setToast({ message: 'Vídeo excluído.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  /* O ARQUIVO vai CRU no corpo, e não em multipart. Do lado do navegador isso é só passar o
     `File` ao axios com o `Content-Type` dele; o `onUploadProgress` do adaptador XHR é a
     barra de verdade — não uma animação fingindo trabalho.

     A metadata viaja em CABEÇALHOS porque o corpo inteiro são os bytes do vídeo. */
  async function enviarArquivo(id, arquivo, meta) {
    setProgresso(0)
    try {
      const cabecalhos = { 'Content-Type': arquivo.type || 'application/octet-stream' }
      // O nome original é só rótulo — o caminho físico é gerado no servidor. Vai limpo de
      // qualquer forma: `encodeURIComponent` porque cabeçalho HTTP não aceita acento, e
      // arquivo de restaurante se chama "Promoção Terça.mp4" na metade das vezes.
      if (arquivo.name) cabecalhos['X-Video-Nome'] = encodeURIComponent(arquivo.name).slice(0, 120)
      if (meta?.duracaoMs) cabecalhos['X-Video-Duracao-Ms'] = String(meta.duracaoMs)
      if (meta?.largura) cabecalhos['X-Video-Largura'] = String(meta.largura)
      if (meta?.altura) cabecalhos['X-Video-Altura'] = String(meta.altura)
      const r = await api.put(`/tv-indoor/videos/${id}/arquivo`, arquivo, {
        headers: cabecalhos,
        onUploadProgress: (e) => {
          if (!e.total) return
          setProgresso(Math.min(99, Math.round((e.loaded * 100) / e.total)))
        },
      })
      // 2xx não basta. Quem diz que o arquivo chegou é o DOMÍNIO (`temArquivo`, que só é
      // verdadeiro com versão e storageKey no banco) — não o HTTP dizendo que a conexão
      // terminou. Sem esta conferência, um proxy que responda 200 com outro corpo faria a
      // tela anunciar um upload que não houve.
      if (!arquivoConfirmado(r?.data)) throw erroDeProtocolo('upload')
      setProgresso(100)
    } finally {
      setProgresso(null)
    }
  }

  /* Salvar é uma SEQUÊNCIA, e o sucesso só existe no fim dela: cadastro → id válido →
     arquivo → confirmação do domínio. Qualquer passo que não fechar interrompe a corrente,
     e nenhum deles sozinho autoriza dizer "Vídeo criado".

     Isto foi escrito depois de um bug de produção em que a tela anunciou criação sem vídeo
     e sem arquivo: o `POST` tomou 301 do Nginx, o navegador converteu em GET, voltou 200
     com a LISTA e o código de então leu `r.data?.video?.id` como `undefined` — e seguiu,
     porque a condição era `if (id && form.arquivo)`. Um `&&` engoliu o defeito. */
  async function salvar(form) {
    setOcupado(true)
    // O que o servidor confirmou ter criado nesta chamada. Guardado porque, se o upload
    // falhar depois, existe um cadastro de verdade lá e a tela não pode fingir que não.
    let criado = null
    try {
      const corpo = { nome: form.nome, inicioEm: paraIso(form.inicioEm), fimEm: paraIso(form.fimEm) }
      let id = form.id
      if (id) {
        await api.put(`/tv-indoor/videos/${id}`, corpo)
      } else {
        const r = await api.post('/tv-indoor/videos', corpo)
        id = idDoVideoCriado(r?.data)
        // Sem id não há o que continuar: não se sabe onde gravar o arquivo, e insistir só
        // produziria um segundo cadastro fantasma.
        if (id === null) throw erroDeProtocolo('criação')
        criado = r.data.video
      }
      if (form.arquivo) await enviarArquivo(id, form.arquivo, form.meta)
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Vídeo atualizado.' : 'Vídeo criado.', type: 'success' })
    } catch (e) {
      await buscar()
      if (criado) {
        /* O cadastro existe, o arquivo não subiu. A estratégia é a mesma do resto do canal:
           a linha NÃO é escondida nem apagada — ela aparece na lista como "Falta o arquivo",
           que é o estado verdadeiro. E o editor continua aberto JÁ COM O ID, para uma nova
           tentativa reenviar só o arquivo em vez de criar um segundo cadastro. */
        setEditando({ ...deVideo(criado), arquivo: form.arquivo, meta: form.meta })
        setToast({ message: erroDe(e, 'O cadastro foi criado, mas o arquivo não subiu. Ele está na lista como “Falta o arquivo” — tente enviar de novo.'), type: 'error' })
      } else {
        setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' })
      }
    } finally { setOcupado(false) }
  }

  const noAr = lista.filter((v) => v.status === 'ATIVO').length
  const semArquivo = lista.filter((v) => !v.temArquivo).length
  const usado = limites?.usadoBytes ?? 0
  const cota = limites?.cotaBytes ?? null
  const porcento = cota ? Math.min(100, Math.round((usado * 100) / cota)) : null

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
          <h1>Vídeos da TV</h1>
          <div className="page-header-sub">
            Os filmes que as TVs reproduzem. Cada um toca <strong>até o fim</strong> e só então a playlist
            passa para o próximo — vídeo não tem tempo de tela configurável.
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-cab-secao">
          <h2 className="ttm-secao-t">Acervo</h2>
          <span className="ttm-meta-txt">
            {lista.length} {lista.length === 1 ? 'vídeo' : 'vídeos'} · {noAr} no ar
            {semArquivo ? ` · ${semArquivo} sem arquivo` : ''}
          </span>
          <div className="ttm-cab-acao">
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => setEditando(vazio())}>
              Novo vídeo
            </button>
          </div>
        </div>

        {/* O espaço ANTES de escolher o arquivo. Cota descoberta no erro do upload é cota
            descoberta tarde — depois de o gestor esperar o envio inteiro. */}
        {cota ? (
          <div className="tvi-espaco">
            <div className="tvi-espaco-barra" role="img" aria-label={`${porcento}% do espaço usado`}>
              <span className={'tvi-espaco-uso' + (porcento >= 90 ? ' cheio' : '')} style={{ width: `${porcento}%` }} />
            </div>
            <span className="ttm-meta-txt">
              {mb(usado)} de {limites.cotaMb} MB usados · até {limites.maxMb} MB por vídeo
            </span>
          </div>
        ) : null}

        {lista.length === 0 ? (
          <div className="empty-state">
            Nenhum vídeo ainda. Formato recomendado: {limites?.recomendacao?.largura ?? 1920} × {limites?.recomendacao?.altura ?? 1080},
            MP4 com {limites?.recomendacao?.codec ?? 'H.264'}. A TV toca <strong>sem som</strong>, então áudio no arquivo
            só ocupa espaço.
          </div>
        ) : (
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Situação</th>
                <th className="ttm-nowrap">Duração</th>
                <th className="ttm-nowrap">Resolução</th>
                <th className="ttm-nowrap">Tamanho</th>
                <th>Agenda</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id} className={v.ativo && v.temArquivo ? undefined : 'tvi-linha-off'}>
                  <td>
                    <button type="button" className="tvi-nome" disabled={ocupado} onClick={() => setEditando(deVideo(v))}>
                      {v.nome}
                    </button>
                    {v.nomeOriginal ? <div className="ttm-meta-txt tvi-arquivo-nome">{decodeURIComponent(v.nomeOriginal)}</div> : null}
                  </td>
                  <td><span className={'badge ' + STATUS[v.status].cor}>{STATUS[v.status].texto}</span></td>
                  {/* Duração e resolução vieram do navegador de quem enviou. O travessão é
                      honesto: o servidor não mede vídeo, e inventar um número seria pior. */}
                  <td className="ttm-nowrap">{relogio(v.duracaoMs) ?? '—'}</td>
                  <td className="ttm-nowrap">{v.largura && v.altura ? `${v.largura} × ${v.altura}` : '—'}</td>
                  <td className="ttm-nowrap">{mb(v.arquivoBytes)}</td>
                  <td className="ttm-meta-txt">{textoAgenda(v)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="ttm-acoes">
                      <button
                        type="button"
                        className={'intel-switch' + (v.ativo ? ' on' : '')}
                        role="switch"
                        aria-checked={v.ativo}
                        aria-label={`${v.ativo ? 'Desligar' : 'Ligar'} ${v.nome}`}
                        disabled={ocupado}
                        onClick={() => alternar(v)}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !v.temArquivo} onClick={() => setVendo(v)}>
                        Ver
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(v)}>
                        Excluir
                      </button>
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
          limites={limites}
          ocupado={ocupado}
          progresso={progresso}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvar}
        />
      )}

      {vendo && (
        // A prévia usa a MESMA rota do arquivo, com Range — o navegador do gestor pede
        // trechos igual ao da TV. Com `controls`, ao contrário da parede: aqui existe
        // alguém para apertar play, e conferir um pedaço do meio é o motivo da tela.
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 860 }}>
            <div className="modal-header"><h2>{vendo.nome}</h2></div>
            <div style={{ padding: 16 }}>
              <div className="tvi-previa">
                <video src={vendo.arquivoUrl} controls autoPlay muted playsInline style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="ttm-dica" style={{ marginTop: 10 }}>
                Na TV o vídeo toca <strong>mudo, sem controles e em tela cheia</strong>, cortando as bordas se a
                proporção não for 16:9. Os controles aqui existem só para você conferir.
              </div>
            </div>
            <div className="ttm-banner-rodape">
              <button type="button" className="btn btn-secondary" onClick={() => setVendo(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!excluindo}
        variant="danger"
        loading={ocupado}
        title="Excluir este vídeo?"
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description="O arquivo é apagado do servidor e o vídeo sai de todas as playlists em que estiver. Se a ideia é só tirar do ar por um tempo, use o interruptor."
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────
function Editor({ valor, limites, ocupado, progresso, aoFechar, aoSalvar }) {
  const [form, setForm] = useState(valor)
  const [faltando, setFaltando] = useState({})
  const [lendo, setLendo] = useState(false)
  const nomeRef = useRef(null)
  const maxMb = limites?.maxMb ?? 200
  const rec = limites?.recomendacao ?? { largura: 1920, altura: 1080, codec: 'H.264' }

  const campo = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFaltando((x) => (x[k] ? { ...x, [k]: null } : x))
  }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    // O tamanho é conferido AQUI também, e não só no servidor. Não é redundância inútil: sem
    // isto o gestor espera o upload inteiro de um arquivo de 400 MB para ouvir que ele não
    // cabe. O servidor continua sendo a autoridade — este é o aviso barato.
    if (arquivo.size > (limites?.maxBytes ?? maxMb * 1024 * 1024)) {
      setFaltando({ arquivo: `Esse arquivo tem ${mb(arquivo.size)} e o limite é ${maxMb} MB por vídeo.` })
      return
    }
    setForm((f) => ({ ...f, arquivo, meta: null }))
    setFaltando((x) => (x.arquivo ? { ...x, arquivo: null } : x))
    setLendo(true)
    const meta = await lerMetadata(arquivo)
    setLendo(false)
    setForm((f) => (f.arquivo === arquivo ? { ...f, meta } : f))
  }

  /* O botão NÃO fica desabilitado por falta de preenchimento: desabilitado é o pior estado
     possível — o gestor aperta, nada acontece, e a tela não diz o que está errado. Quem
     recusa é esta função, que aponta o campo e leva o cursor até lá. */
  function tentarSalvar() {
    if (ocupado) return
    const erros = {}
    if (!String(form.nome ?? '').trim()) erros.nome = 'Dê um nome para achar este vídeo na lista.'
    if (!form.id && !form.arquivo) erros.arquivo = 'Escolha o arquivo do vídeo.'
    if (Object.keys(erros).length) {
      setFaltando(erros)
      if (erros.nome) nomeRef.current?.focus()
      return
    }
    aoSalvar(form)
  }

  const meta = form.meta
  const enviando = progresso !== null

  return (
    // Modal fecha só por botão — regra do projeto. Clique no fundo não descarta trabalho, e
    // durante um upload de 80 MB isso deixaria de ser um detalhe.
    <div className="modal-overlay">
      <div className="modal ttm-banner-modal">
        <div className="modal-header">
          <h2>{form.id ? 'Editar vídeo' : 'Novo vídeo'}</h2>
        </div>
        <div className="ttm-banner-campos" style={{ padding: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="tvv-nome">
              Nome <span className="ttm-obrigatorio" aria-hidden="true">*</span>
            </label>
            <input
              id="tvv-nome"
              ref={nomeRef}
              className={'form-input' + (faltando.nome ? ' invalido' : '')}
              maxLength={60}
              value={form.nome}
              onChange={campo('nome')}
              placeholder="Ex.: Institucional da casa"
              aria-required="true"
              aria-invalid={faltando.nome ? 'true' : undefined}
            />
            {faltando.nome
              ? <div className="ttm-erro-campo" role="alert">{faltando.nome}</div>
              : <div className="ttm-dica">Só para você se achar na lista. O cliente não vê.</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tvv-arq">
              Arquivo {!form.id && <span className="ttm-obrigatorio" aria-hidden="true">*</span>}
            </label>
            <input
              id="tvv-arq"
              type="file"
              className={'form-input' + (faltando.arquivo ? ' invalido' : '')}
              accept="video/mp4,video/webm"
              disabled={enviando}
              aria-invalid={faltando.arquivo ? 'true' : undefined}
              onChange={(e) => escolherArquivo(e.target.files?.[0])}
            />
            {faltando.arquivo ? <div className="ttm-erro-campo" role="alert">{faltando.arquivo}</div> : null}
            {form.id && !form.arquivo ? (
              <div className="ttm-dica">
                {form.temArquivo
                  ? 'Já existe um arquivo enviado. Escolha outro só se quiser substituí-lo — as TVs baixam o novo sozinhas.'
                  : 'Este vídeo ainda não tem arquivo, então não toca em TV nenhuma. Escolha um acima.'}
              </div>
            ) : null}
            <div className="ttm-dica">
              <strong>MP4 ou WebM</strong>, até {maxMb} MB. Recomendado: {rec.largura} × {rec.altura} ({rec.codec}).
              A TV toca <strong>sem som</strong> — áudio no arquivo só ocupa espaço.
            </div>
          </div>

          {/* O que o navegador leu do arquivo escolhido, antes de subir. É a hora certa de
              descobrir que o vídeo tem quatro minutos ou que está em pé. */}
          {form.arquivo ? (
            <div className="tvi-arquivo-resumo">
              <strong>{form.arquivo.name}</strong>
              <span>{mb(form.arquivo.size)}</span>
              {lendo ? <span>lendo…</span> : null}
              {meta?.duracaoMs ? <span>{relogio(meta.duracaoMs)}</span> : null}
              {meta?.largura && meta?.altura ? <span>{meta.largura} × {meta.altura}</span> : null}
              {!lendo && !meta ? <span>duração não identificada aqui</span> : null}
            </div>
          ) : null}

          {/* Progresso REAL: são os bytes que o navegador já entregou. Enquanto ele não
              chega a 100%, nada foi gravado — o servidor só valida e promove o arquivo
              depois do último byte. */}
          {enviando ? (
            <div className="tvi-progresso" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Enviando o vídeo">
              <div className="tvi-progresso-barra"><span style={{ width: `${progresso}%` }} /></div>
              <span className="ttm-meta-txt">
                {progresso < 100 ? `Enviando… ${progresso}%` : 'Conferindo o arquivo no servidor…'}
              </span>
            </div>
          ) : null}

          <div className="ttm-banner-datas">
            <div className="form-group">
              <label className="form-label" htmlFor="tvv-ini">Começa em</label>
              <input id="tvv-ini" type="datetime-local" className="form-input" value={form.inicioEm} onChange={campo('inicioEm')} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="tvv-fim">Termina em</label>
              <input id="tvv-fim" type="datetime-local" className="form-input" value={form.fimEm} onChange={campo('fimEm')} />
            </div>
          </div>
          <div className="ttm-dica">
            Em branco, o vídeo fica no ar enquanto estiver ligado. A agenda diz quando ele pode <strong>começar</strong>:
            um vídeo que já está tocando quando o horário termina vai até o fim, sem corte.
          </div>
        </div>
        <div className="ttm-banner-rodape">
          <button type="button" className="btn btn-secondary" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={ocupado}>
            {enviando ? `Enviando ${progresso}%…` : ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
