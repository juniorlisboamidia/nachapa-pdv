// Loja Digital › TV Indoor › Conteúdos — o ACERVO: as imagens e os vídeos que as TVs reproduzem.
//
// ── UMA LISTA, DOIS ARMAZENAMENTOS ────────────────────────────────────────────────────
// Imagem e vídeo são a mesma coisa para quem monta uma playlist: matéria-prima. Por isso
// ficam numa lista só, com um botão só, e é o ARQUIVO escolhido que decide o caminho. Por
// baixo continuam dois domínios — imagem vive em bytes no banco, vídeo vive em arquivo no
// disco com streaming por faixa — porque os armazenamentos são diferentes por bons motivos,
// e unificar tabelas para unificar uma tela seria pagar caro por nada.
//
// ── O QUE NÃO MORA AQUI ───────────────────────────────────────────────────────────────
// Nem TEMPO NA TELA nem AGENDA. Quanto tempo uma arte fica no ar é decisão da playlist (o
// campo está na linha do item, em Playlists); QUANDO ela vai ao ar é decisão da grade (o
// período da regra, em Programação). Aqui só existe o que a peça É. Foi assim que este
// cadastro deixou de ser três formulários misturados.
//
// Interface OPERACIONAL, não construtor de design: nada de editor, nada de recorte — a
// prévia mostra exatamente o que a TV vai mostrar.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { reduzirImagem } from '../lib/reduzirImagem'
import { arquivoConfirmado, ehErroDeProtocolo, erroDeProtocolo, idDoVideoCriado } from '../lib/respostaDeVideo'

const STATUS = {
  ATIVO: { texto: 'No ar', cor: 'badge-green' },
  // Os dois abaixo não nascem mais (a agenda saiu daqui), mas continuam legíveis caso uma
  // resposta antiga os traga — um status desconhecido não pode derrubar a lista.
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Desligado', cor: 'badge-gray' },
}
const statusDe = (s) => STATUS[s] ?? STATUS.INATIVO

const MOTIVOS = {
  NOME_OBRIGATORIO: 'Dê um nome ao conteúdo.',
  IMAGEM_AUSENTE: 'Escolha uma imagem.',
  IMAGEM_FORMATO: 'Arquivo inválido. Use PNG, JPG ou WEBP.',
  IMAGEM_TIPO: 'O arquivo não é a imagem que o nome diz ser.',
  IMAGEM_GRANDE: 'A imagem ficou grande demais mesmo depois de reduzida.',
  VIDEO_TIPO: 'Esse arquivo não é um MP4 nem um WebM. A extensão pode enganar — o que vale é o conteúdo.',
  VIDEO_GRANDE: 'O arquivo passa do tamanho máximo por vídeo.',
  VIDEO_VAZIO: 'O arquivo chegou vazio.',
  COTA_EXCEDIDA: 'A loja chegou ao limite de espaço. Exclua algum vídeo antes de subir este.',
  DISCO_CHEIO: 'O servidor está sem espaço agora. Avise o suporte.',
  UPLOAD_INTERROMPIDO: 'O envio foi interrompido antes do fim. Tente de novo.',
}

const erroDe = (e, fallback) => {
  // Resposta que não é a desta chamada (redirect, proxy, página de erro devolvendo 200) não
  // é "erro do servidor": ninguém recusou nada e repetir do mesmo jeito dá no mesmo.
  if (ehErroDeProtocolo(e)) {
    return 'O servidor respondeu de um jeito inesperado e o envio foi interrompido por segurança. Nada foi confirmado. Se repetir, é configuração do servidor — avise o suporte.'
  }
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

const mb = (bytes) => {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`
}
const relogio = (ms) => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  const s = Math.round(n / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* O nome nasce do ARQUIVO. É o que o gestor digitaria na maioria das vezes, e um campo
   que já vem preenchido é um campo a menos para recusar. Ele edita se quiser. */
const nomeDoArquivo = (arquivo) => String(arquivo?.name ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 60)

/* Duração e dimensões lidas pelo NAVEGADOR de quem envia, antes de subir. O servidor não
   mede vídeo (não há ffprobe): estes números são informativos, e o player usa o `ended`
   do próprio `<video>` como autoridade. */
function lerMetadata(arquivo) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const fim = (meta) => { URL.revokeObjectURL(url); resolve(meta) }
    v.onloadedmetadata = () => fim({
      duracaoMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null,
      largura: v.videoWidth || null,
      altura: v.videoHeight || null,
    })
    v.onerror = () => fim(null)
    v.src = url
  })
}

const imagemVazia = () => ({ tipo: 'IMAGEM', id: null, nome: '', imagem: null, previa: null })
const deImagem = (c) => ({ tipo: 'IMAGEM', id: c.id, nome: c.nome, imagem: null, previa: c.imagemUrl })
const videoVazio = () => ({ tipo: 'VIDEO', id: null, nome: '', arquivo: null, meta: null, temArquivo: false })
const deVideo = (v) => ({ tipo: 'VIDEO', id: v.id, nome: v.nome, arquivo: null, meta: null, temArquivo: !!v.temArquivo })

export default function TvIndoorConteudos() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [imagens, setImagens] = useState([])
  const [videos, setVideos] = useState([])
  const [limImagem, setLimImagem] = useState(null)
  const [limVideo, setLimVideo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)      // { tipo: 'IMAGEM' | 'VIDEO', ... }
  const [excluindo, setExcluindo] = useState(null)    // linha da lista unificada
  const [vendo, setVendo] = useState(null)            // vídeo em prévia
  const [progresso, setProgresso] = useState(null)    // upload do vídeo, 0–100 ou null
  const arquivoRef = useRef(null)

  /* As duas listas em paralelo. Uma falhando não esconde a outra: vídeo depende do disco
     e imagem do banco, e o gestor ainda consegue trabalhar com o que respondeu. */
  const buscar = useCallback(() => Promise.allSettled([
    api.get('/tv-indoor/conteudos'),
    api.get('/tv-indoor/videos'),
  ]).then(([img, vid]) => {
    if (img.status === 'fulfilled') {
      setImagens(Array.isArray(img.value.data?.conteudos) ? img.value.data.conteudos : [])
      setLimImagem(img.value.data?.limites ?? null)
    }
    if (vid.status === 'fulfilled') {
      setVideos(Array.isArray(vid.value.data?.videos) ? vid.value.data.videos : [])
      setLimVideo(vid.value.data?.limites ?? null)
    }
    setErro(img.status === 'rejected' && vid.status === 'rejected' ? 'Não foi possível ler os conteúdos agora.' : null)
  }).finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  const rota = (linha) => (linha.tipo === 'VIDEO' ? `/tv-indoor/videos/${linha.id}` : `/tv-indoor/conteudos/${linha.id}`)

  async function alternar(linha) {
    setOcupado(true)
    try {
      await api.put(rota(linha), { ativo: !linha.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(rota(excluindo))
      setExcluindo(null)
      await buscar()
      setToast({ message: excluindo.tipo === 'VIDEO' ? 'Vídeo excluído.' : 'Imagem excluída.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  /* O ARQUIVO decide o caminho. Um botão só ("Adicionar"), e o que abre depois é o editor
     certo, já com o arquivo dentro e o nome sugerido. O gestor não precisa saber de antemão
     que imagem e vídeo são cadastros diferentes por baixo — e não deveria precisar. */
  async function adicionar(arquivo) {
    if (!arquivo) return
    if (arquivoRef.current) arquivoRef.current.value = ''
    if (arquivo.type.startsWith('video/')) {
      const maxBytes = limVideo?.maxBytes ?? (limVideo?.maxMb ?? 200) * 1024 * 1024
      if (arquivo.size > maxBytes) {
        setToast({ message: `Esse vídeo tem ${mb(arquivo.size)} e o limite é ${limVideo?.maxMb ?? 200} MB.`, type: 'error' })
        return
      }
      // A metadata é lida DENTRO do editor: ele copia o valor ao abrir e não enxergaria uma
      // atualização feita aqui — ficaria "lendo…" para sempre e subiria sem duração.
      setEditando({ ...videoVazio(), nome: nomeDoArquivo(arquivo), arquivo })
      return
    }
    if (arquivo.type.startsWith('image/')) {
      try {
        const medida = limImagem?.medida ?? { largura: 1920, altura: 1080 }
        const dataUrl = await reduzirImagem(arquivo, medida.largura)
        setEditando({ ...imagemVazia(), nome: nomeDoArquivo(arquivo), imagem: dataUrl, previa: dataUrl })
      } catch {
        setToast({ message: 'Não foi possível ler esse arquivo. Use PNG, JPG, WEBP, MP4 ou WebM.', type: 'error' })
      }
      return
    }
    setToast({ message: 'Esse arquivo não é imagem nem vídeo. Use PNG, JPG, WEBP, MP4 ou WebM.', type: 'error' })
  }

  async function salvarImagem(form) {
    setOcupado(true)
    try {
      if (form.id) {
        await api.put(`/tv-indoor/conteudos/${form.id}`, { nome: form.nome })
        // A imagem vai em chamada SEPARADA de propósito: é a única que incrementa a versão,
        // e quem só corrigiu um título não pode fazer todas as TVs rebaixarem o cache.
        if (form.imagem) await api.put(`/tv-indoor/conteudos/${form.id}/imagem`, { imagem: form.imagem })
      } else {
        await api.post('/tv-indoor/conteudos', { nome: form.nome, imagem: form.imagem })
      }
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Imagem atualizada.' : 'Imagem adicionada.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setOcupado(false) }
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
      // qualquer forma: `encodeURIComponent` porque cabeçalho HTTP não aceita acento.
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
      // 2xx não basta. Quem diz que o arquivo chegou é o DOMÍNIO (`temArquivo`) — não o HTTP
      // dizendo que a conexão terminou. Sem isto, um proxy que responda 200 com outro corpo
      // faria a tela anunciar um upload que não houve.
      if (!arquivoConfirmado(r?.data)) throw erroDeProtocolo('upload')
      setProgresso(100)
    } finally {
      setProgresso(null)
    }
  }

  /* Salvar vídeo é uma SEQUÊNCIA, e o sucesso só existe no fim dela: cadastro → id válido →
     arquivo → confirmação do domínio. Qualquer passo que não fechar interrompe a corrente.

     Isto foi escrito depois de um bug de produção em que a tela anunciou criação sem vídeo
     e sem arquivo: o `POST` tomou 301 do Nginx, o navegador converteu em GET, voltou 200
     com a LISTA e o código de então leu `r.data?.video?.id` como `undefined` — e seguiu,
     porque a condição era `if (id && form.arquivo)`. Um `&&` engoliu o defeito. */
  async function salvarVideo(form) {
    setOcupado(true)
    // O que o servidor confirmou ter criado nesta chamada. Guardado porque, se o upload
    // falhar depois, existe um cadastro de verdade lá e a tela não pode fingir que não.
    let criado = null
    try {
      let id = form.id
      if (id) {
        await api.put(`/tv-indoor/videos/${id}`, { nome: form.nome })
      } else {
        const r = await api.post('/tv-indoor/videos', { nome: form.nome })
        id = idDoVideoCriado(r?.data)
        if (id === null) throw erroDeProtocolo('criação')
        criado = r.data.video
      }
      if (form.arquivo) await enviarArquivo(id, form.arquivo, form.meta)
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Vídeo atualizado.' : 'Vídeo adicionado.', type: 'success' })
    } catch (e) {
      await buscar()
      if (criado) {
        /* O cadastro existe, o arquivo não subiu. A linha NÃO é escondida nem apagada — ela
           aparece na lista como "Falta o arquivo", que é o estado verdadeiro. E o editor
           continua aberto JÁ COM O ID, para uma nova tentativa reenviar só o arquivo em vez
           de criar um segundo cadastro. */
        setEditando({ ...deVideo(criado), arquivo: form.arquivo, meta: form.meta })
        setToast({ message: erroDe(e, 'O cadastro foi criado, mas o arquivo não subiu. Ele está na lista como “Falta o arquivo” — tente enviar de novo.'), type: 'error' })
      } else {
        setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' })
      }
    } finally { setOcupado(false) }
  }

  /* A LISTA ÚNICA. Ordenada por nome, e não por tipo: quem procura "Combo de terça" não
     sabe (nem deveria precisar saber) se aquilo foi subido como imagem ou como vídeo. */
  const lista = [
    ...imagens.map((c) => ({ tipo: 'IMAGEM', id: c.id, nome: c.nome, ativo: c.ativo, status: c.status, previa: c.imagemUrl, bruto: c })),
    ...videos.map((v) => ({ tipo: 'VIDEO', id: v.id, nome: v.nome, ativo: v.ativo, status: v.status, temArquivo: !!v.temArquivo, bruto: v })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const noAr = lista.filter((l) => l.status === 'ATIVO' && (l.tipo === 'IMAGEM' || l.temArquivo)).length
  const semArquivo = videos.filter((v) => !v.temArquivo).length
  const medida = limImagem?.medida ?? { largura: 1920, altura: 1080 }
  const usado = limVideo?.usadoBytes ?? 0
  const cota = limVideo?.cotaBytes ?? null
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
          <h1>Conteúdos da TV</h1>
          <div className="page-header-sub">
            As imagens e os vídeos que as TVs reproduzem — o acervo. <strong>Quanto tempo</strong> cada um fica na
            tela é decisão da playlist; <strong>quando</strong> vai ao ar, da programação.
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-cab-secao">
          <h2 className="ttm-secao-t">Acervo</h2>
          <span className="ttm-meta-txt">
            {imagens.length} {imagens.length === 1 ? 'imagem' : 'imagens'} · {videos.length} {videos.length === 1 ? 'vídeo' : 'vídeos'} · {noAr} no ar
            {semArquivo ? ` · ${semArquivo} sem arquivo` : ''}
          </span>
          <div className="ttm-cab-acao">
            {/* O input fica escondido e o botão o aciona: é o arquivo que decide se abre o
                editor de imagem ou o de vídeo. */}
            <input
              ref={arquivoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
              hidden
              onChange={(e) => adicionar(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => arquivoRef.current?.click()}>
              Adicionar
            </button>
          </div>
        </div>

        <div className="ttm-dica" style={{ marginTop: 0 }}>
          Imagem: <strong>{medida.largura} × {medida.altura}</strong> para TV deitada ou <strong>{medida.altura} × {medida.largura}</strong> para
          TV em pé, PNG/JPG/WEBP até {limImagem?.imagemKb ?? 700} KB. Vídeo: MP4 ou WebM até {limVideo?.maxMb ?? 200} MB, sem som.
        </div>
        {/* O espaço de vídeo ANTES de escolher o arquivo. Cota descoberta no erro do upload é
            cota descoberta tarde — depois de o gestor esperar o envio inteiro. */}
        {cota ? (
          <div className="tvi-espaco">
            <div className="tvi-espaco-barra" role="img" aria-label={`${porcento}% do espaço de vídeo usado`}>
              <span className={'tvi-espaco-uso' + (porcento >= 90 ? ' cheio' : '')} style={{ width: `${porcento}%` }} />
            </div>
            <span className="ttm-meta-txt">{mb(usado)} de {limVideo.cotaMb} MB de vídeo usados</span>
          </div>
        ) : null}

        {lista.length === 0 ? (
          <div className="empty-state">
            Nenhum conteúdo ainda. Enquanto não houver nada no ar, a TV mostra a marca da loja — que é o
            repouso do canal, não um defeito.
          </div>
        ) : (
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Prévia</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th className="ttm-nowrap">Detalhes</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const abrir = () => setEditando(l.tipo === 'VIDEO' ? deVideo(l.bruto) : deImagem(l.bruto))
                const apagado = l.tipo === 'VIDEO' ? !(l.ativo && l.temArquivo) : !l.ativo
                return (
                  <tr key={`${l.tipo}-${l.id}`} className={apagado ? 'tvi-linha-off' : undefined}>
                    <td>
                      {/* A miniatura da imagem é 16:9 com `cover`: o MESMO recorte da TV deitada.
                          O vídeo não tem miniatura (o servidor não extrai quadro): o marcador diz
                          o tipo. */}
                      {l.tipo === 'IMAGEM'
                        ? <button type="button" className="tvi-mini" disabled={ocupado} title="Editar" onClick={abrir}><img src={l.previa} alt="" draggable={false} /></button>
                        : <button type="button" className="tvi-mini tvi-mini-video" disabled={ocupado} title="Editar" onClick={abrir}>VÍDEO</button>}
                    </td>
                    <td>
                      <button type="button" className="tvi-nome" disabled={ocupado} onClick={abrir}>{l.nome}</button>
                      {l.tipo === 'VIDEO' && l.bruto.nomeOriginal
                        ? <div className="ttm-meta-txt tvi-arquivo-nome">{decodeURIComponent(l.bruto.nomeOriginal)}</div>
                        : null}
                    </td>
                    <td><span className="badge badge-slate">{l.tipo === 'VIDEO' ? 'Vídeo' : 'Imagem'}</span></td>
                    <td>
                      {l.tipo === 'VIDEO' && !l.temArquivo
                        ? <span className="badge badge-orange">Falta o arquivo</span>
                        : <span className={'badge ' + statusDe(l.status).cor}>{statusDe(l.status).texto}</span>}
                    </td>
                    <td className="ttm-nowrap ttm-meta-txt">
                      {l.tipo === 'VIDEO'
                        ? [relogio(l.bruto.duracaoMs), l.bruto.largura && l.bruto.altura ? `${l.bruto.largura} × ${l.bruto.altura}` : null, mb(l.bruto.arquivoBytes)].filter(Boolean).join(' · ') || '—'
                        : (l.bruto.imagemBytes ? mb(l.bruto.imagemBytes) : '—')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ttm-acoes">
                        {/* Interruptor de verdade: o rótulo diz o que ele FAZ, não o estado. */}
                        <button
                          type="button"
                          className={'intel-switch' + (l.ativo ? ' on' : '')}
                          role="switch"
                          aria-checked={l.ativo}
                          aria-label={`${l.ativo ? 'Desligar' : 'Ligar'} ${l.nome}`}
                          disabled={ocupado}
                          onClick={() => alternar(l)}
                        />
                        {l.tipo === 'VIDEO' ? (
                          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !l.temArquivo} onClick={() => setVendo(l.bruto)}>
                            Ver
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(l)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editando?.tipo === 'IMAGEM' && (
        <EditorImagem
          valor={editando}
          limites={limImagem}
          ocupado={ocupado}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvarImagem}
          aoAvisar={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {editando?.tipo === 'VIDEO' && (
        <EditorVideo
          valor={editando}
          limites={limVideo}
          ocupado={ocupado}
          progresso={progresso}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvarVideo}
        />
      )}

      {vendo && (
        // A prévia usa a MESMA rota do arquivo, com Range — o navegador do gestor pede
        // trechos igual ao da TV. Com `controls`, ao contrário da parede: aqui existe
        // alguém para apertar play.
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 860 }}>
            <div className="modal-header"><h2>{vendo.nome}</h2></div>
            <div style={{ padding: 16 }}>
              <div className="tvi-previa">
                <video src={vendo.arquivoUrl} controls autoPlay muted playsInline style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="ttm-dica" style={{ marginTop: 10 }}>
                Na TV o vídeo toca <strong>mudo, sem controles e em tela cheia</strong>, cortando as bordas se a
                proporção não for a da tela. Os controles aqui existem só para você conferir.
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
        title={excluindo?.tipo === 'VIDEO' ? 'Excluir este vídeo?' : 'Excluir esta imagem?'}
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description={excluindo?.tipo === 'VIDEO'
          ? 'O arquivo é apagado do servidor e o vídeo sai de todas as playlists em que estiver. Se a ideia é só tirar do ar por um tempo, use o interruptor.'
          : 'A imagem é apagada e sai de todas as playlists em que estiver. Se a ideia é só tirar do ar por um tempo, use o interruptor.'}
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}

// ── Editor de IMAGEM ─────────────────────────────────────────────────────────
function EditorImagem({ valor, limites, ocupado, aoFechar, aoSalvar, aoAvisar }) {
  const [form, setForm] = useState(valor)
  // O que FALTA, por campo. Só aparece depois de tentar salvar: cobrar um campo que o
  // gestor ainda nem chegou a preencher é ruído.
  const [faltando, setFaltando] = useState({})
  const nomeRef = useRef(null)
  const medida = limites?.medida ?? { largura: 1920, altura: 1080 }

  const campo = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFaltando((x) => (x[k] ? { ...x, [k]: null } : x))
  }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    try {
      const dataUrl = await reduzirImagem(arquivo, medida.largura)
      setForm((f) => ({ ...f, imagem: dataUrl, previa: dataUrl }))
      setFaltando((x) => (x.imagem ? { ...x, imagem: null } : x))
    } catch {
      aoAvisar('Não foi possível ler esse arquivo. Use PNG, JPG ou WEBP.')
    }
  }

  /* O botão NÃO fica desabilitado por falta de preenchimento: desabilitado é o pior estado
     possível — o gestor aperta, nada acontece, e a tela não diz o que está errado. Quem
     recusa é esta função, que aponta o campo e leva o cursor até lá. */
  function tentarSalvar() {
    if (ocupado) return
    const erros = {}
    if (!String(form.nome ?? '').trim()) erros.nome = 'Dê um nome para achar esta imagem na lista.'
    if (!form.id && !form.imagem) erros.imagem = 'Escolha a imagem que vai aparecer na TV.'
    if (Object.keys(erros).length) {
      setFaltando(erros)
      if (erros.nome) nomeRef.current?.focus()
      return
    }
    aoSalvar(form)
  }

  return (
    // Modal fecha só por botão — regra do projeto. Clique no fundo não descarta trabalho.
    <div className="modal-overlay">
      <div className="modal ttm-banner-modal">
        <div className="modal-header">
          <h2>{form.id ? 'Editar imagem' : 'Nova imagem'}</h2>
        </div>
        <div className="ttm-banner-corpo">
          {/* A prévia é 16:9 com `cover` — o MESMO recorte da TV deitada. */}
          <div className="tvi-previa">
            {form.previa
              ? <img src={form.previa} alt="" />
              : <div className="ttm-dica" style={{ margin: 0, textAlign: 'center' }}>A prévia aparece aqui</div>}
          </div>

          <div className="ttm-banner-campos">
            <div className="form-group">
              <label className="form-label" htmlFor="tvi-nome">
                Nome <span className="ttm-obrigatorio" aria-hidden="true">*</span>
              </label>
              <input
                id="tvi-nome"
                ref={nomeRef}
                className={'form-input' + (faltando.nome ? ' invalido' : '')}
                maxLength={60}
                value={form.nome}
                onChange={campo('nome')}
                placeholder="Ex.: Combo de terça"
                aria-required="true"
                aria-invalid={faltando.nome ? 'true' : undefined}
              />
              {faltando.nome
                ? <div className="ttm-erro-campo" role="alert">{faltando.nome}</div>
                : <div className="ttm-dica">Só para você se achar na lista. O cliente não vê.</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tvi-img">
                Imagem {!form.id && <span className="ttm-obrigatorio" aria-hidden="true">*</span>}
              </label>
              <input
                id="tvi-img"
                type="file"
                className={'form-input' + (faltando.imagem ? ' invalido' : '')}
                accept="image/png,image/jpeg,image/webp"
                aria-invalid={faltando.imagem ? 'true' : undefined}
                onChange={(e) => escolherArquivo(e.target.files?.[0])}
              />
              {faltando.imagem ? <div className="ttm-erro-campo" role="alert">{faltando.imagem}</div> : null}
              <div className="ttm-dica">
                <strong>{medida.largura} × {medida.altura} px</strong> para TV deitada, ou{' '}
                <strong>{medida.altura} × {medida.largura} px</strong> para TV em pé.
                PNG, JPG ou WEBP, até {limites?.imagemKb ?? 700} KB — a imagem é reduzida antes de subir, sem mudar a proporção.
                Arte no formato errado para a tela é cortada nas bordas para preenchê-la.
              </div>
            </div>
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

// ── Editor de VÍDEO ──────────────────────────────────────────────────────────
function EditorVideo({ valor, limites, ocupado, progresso, aoFechar, aoSalvar }) {
  const [form, setForm] = useState(valor)
  const [faltando, setFaltando] = useState({})
  // Já nasce "lendo" quando chega um arquivo sem metadata (o "Adicionar" da lista): é
  // estado inicial, e não um setState dentro do efeito.
  const [lendo, setLendo] = useState(() => !!(valor.arquivo && !valor.meta))
  const nomeRef = useRef(null)
  const maxMb = limites?.maxMb ?? 200
  const rec = limites?.recomendacao ?? { largura: 1920, altura: 1080, codec: 'H.264' }

  /* O arquivo que veio de fora tem a metadata lida aqui, uma vez. `vivo` evita escrever
     num editor que já fechou. Sem Promise devolvida pelo efeito (regra do projeto). */
  useEffect(() => {
    const arquivo = valor.arquivo
    if (!arquivo || valor.meta) return undefined
    let vivo = true
    lerMetadata(arquivo).then((meta) => {
      if (!vivo) return
      setForm((f) => (f.arquivo === arquivo ? { ...f, meta } : f))
      setLendo(false)
    })
    return () => { vivo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const campo = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFaltando((x) => (x[k] ? { ...x, [k]: null } : x))
  }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    // O tamanho é conferido AQUI também, e não só no servidor: sem isto o gestor espera o
    // upload inteiro de um arquivo de 400 MB para ouvir que ele não cabe.
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
  const lendoAgora = lendo
  const enviando = progresso !== null

  return (
    // Modal fecha só por botão — regra do projeto. Durante um upload de 80 MB isso deixa
    // de ser um detalhe.
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
              <strong>MP4 ou WebM</strong>, até {maxMb} MB. Recomendado: {rec.largura} × {rec.altura} ({rec.codec}) para TV deitada,
              ou {rec.altura} × {rec.largura} para TV em pé. A TV toca <strong>sem som</strong> — áudio no arquivo só ocupa espaço.
              Cada vídeo toca <strong>até o fim</strong>: ele não tem tempo de tela.
            </div>
          </div>

          {form.arquivo ? (
            <div className="tvi-arquivo-resumo">
              <strong>{form.arquivo.name}</strong>
              <span>{mb(form.arquivo.size)}</span>
              {lendoAgora ? <span>lendo…</span> : null}
              {meta?.duracaoMs ? <span>{relogio(meta.duracaoMs)}</span> : null}
              {meta?.largura && meta?.altura ? <span>{meta.largura} × {meta.altura}</span> : null}
              {!lendoAgora && !meta ? <span>duração não identificada aqui</span> : null}
            </div>
          ) : null}

          {/* Progresso REAL: são os bytes que o navegador já entregou. */}
          {enviando ? (
            <div className="tvi-progresso" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Enviando o vídeo">
              <div className="tvi-progresso-barra"><span style={{ width: `${progresso}%` }} /></div>
              <span className="ttm-meta-txt">
                {progresso < 100 ? `Enviando… ${progresso}%` : 'Conferindo o arquivo no servidor…'}
              </span>
            </div>
          ) : null}
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
