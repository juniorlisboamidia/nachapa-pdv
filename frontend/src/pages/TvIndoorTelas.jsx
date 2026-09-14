// Loja Digital › TV Indoor › Telas — as TVs da loja.
//
// Tela PRÓPRIA do canal, e não a de totens com um filtro: `GET /tv-indoor/telas` devolve só
// `tipo: 'TV_INDOOR'`, filtrado no BANCO. Pedir a lista inteira e esconder metade aqui é
// como um totem reaparece num contador, num "nenhum resultado" errado ou numa ação em lote.
//
// O que é REUSO puro: criar, parear, ativar/desativar, revogar e excluir continuam em
// `/api/aparelhos/*`, a mesma infraestrutura do totem (cookie HttpOnly nascido de um código
// de 6 dígitos digitado NA TV, heartbeat, online < 150 s). Duplicar isso por canal seria
// criar um segundo lugar para o mesmo pareamento divergir.
//
// O que é PRÓPRIO: a programação associada — e é a única coluna que o totem não tem.
//
// Como nos totens, esta tela nunca mostra token: o que ela entrega é o código temporário
// (10 min, uso único) e o endereço fixo /dispositivo, igual para todos os aparelhos.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import BotaoCopiar from '../components/BotaoCopiar'
import { matrizQr } from '../lib/qr'

const erroDe = (e, fallback) => {
  const d = e?.response?.data
  if (d?.erro === 'APARELHO_COM_PEDIDOS') return 'Este aparelho tem histórico e não pode ser excluído. Desative-o em vez de apagar.'
  if (d?.erro === 'PLAYLIST_NAO_ENCONTRADA') return 'Essa playlist não existe mais. Atualize a página.'
  return d?.error ?? d?.erro ?? fallback
}

// "há 2 min" / "agora" — relativo, porque o que o dono quer saber é se a TV está viva, não
// o horário exato do último sinal.
function haQuanto(iso, agora) {
  if (!iso) return null
  const seg = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (seg < 60) return 'agora'
  const min = Math.round(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.round(h / 24)} d`
}

function restante(iso, agora) {
  if (!iso) return 0
  return Math.max(0, Math.floor((new Date(iso).getTime() - agora) / 1000))
}
const mmss = (seg) => `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

// QR do endereço /dispositivo, desenhado da matriz local — nada de serviço externo: a TV
// pode estar numa rede sem internet aberta.
function QrCanvas({ texto, tam = 168 }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !texto) return
    const QUIET = 12
    canvas.width = tam
    canvas.height = tam
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, tam, tam)
    const m = matrizQr(texto)
    const n = m.length
    const cel = (tam - QUIET * 2) / n
    ctx.fillStyle = '#000'
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (m[r][c]) ctx.fillRect(QUIET + c * cel, QUIET + r * cel, Math.ceil(cel), Math.ceil(cel))
      }
    }
  }, [texto, tam])
  return <canvas ref={ref} className="apr-qr" aria-label="QR do endereço do aparelho" />
}

export default function TvIndoorTelas() {
  const [telas, setTelas] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [toast, setToast] = useState(null)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [pareamento, setPareamento] = useState(null)
  const [pareando, setPareando] = useState(null)
  const [confirmacao, setConfirmacao] = useState(null) // { acao, tela }
  const [agindo, setAgindo] = useState(false)
  const [salvandoPlaylist, setSalvandoPlaylist] = useState(null)
  // Relógio próprio: a contagem do código e o "há X min" precisam andar sem refetch.
  const [agora, setAgora] = useState(() => Date.now())

  const notify = (message, type = 'success') => setToast({ message, type })

  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setCarregando(true)
    return api.get('/tv-indoor/telas')
      .then((r) => {
        setTelas(Array.isArray(r.data?.telas) ? r.data.telas : [])
        setPlaylists(Array.isArray(r.data?.playlists) ? r.data.playlists : [])
      })
      .catch((e) => { if (!silencioso) notify(erroDe(e, 'Não foi possível carregar as telas.'), 'error') })
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Lista a cada 30 s (o "online" do servidor é ultimoHeartbeatEm < 150 s) e relógio a cada
  // 1 s. Dois intervalos porque a contagem do código não justifica bater no servidor.
  useEffect(() => {
    const t1 = setInterval(() => carregar(true), 30_000)
    const t2 = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [carregar])

  async function criar(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n || criando) return
    setCriando(true)
    try {
      // A criação é a rota COMPARTILHADA de aparelhos — o que muda é o tipo.
      await api.post('/aparelhos', { nome: n, tipo: 'TV_INDOOR' })
      setNome('')
      notify('TV criada. Agora use "Parear" para gerar o código.')
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível criar a TV.'), 'error')
    } finally {
      setCriando(false)
    }
  }

  async function parear(tela) {
    setPareando(tela.id)
    try {
      const { data } = await api.post(`/aparelhos/${tela.id}/parear`)
      setPareamento({ aparelhoId: tela.id, nome: tela.nome, codigo: data?.codigo, expiraEm: data?.expiraEm, urlDispositivo: data?.urlDispositivo })
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível gerar o código.'), 'error')
    } finally {
      setPareando(null)
    }
  }

  async function alternarAtivo(tela) {
    try {
      await api.patch(`/aparelhos/${tela.id}`, { ativo: !tela.ativo })
      notify(tela.ativo ? `"${tela.nome}" desativada. A TV para de receber a programação.` : `"${tela.nome}" ativada.`)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível atualizar a TV.'), 'error')
    }
  }

  // A associação é a única ação PRÓPRIA do canal. Grava ao escolher: é uma decisão só, num
  // seletor, e o resultado aparece no próprio seletor.
  async function mudarPlaylist(tela, valor) {
    setSalvandoPlaylist(tela.id)
    try {
      const r = await api.put(`/tv-indoor/telas/${tela.id}/playlist`, { playlistId: valor || null })
      const nova = r.data?.tela
      if (nova) setTelas((ts) => ts.map((t) => (t.id === nova.id ? nova : t)))
      notify(valor
        ? `"${tela.nome}" passou a reproduzir “${playlists.find((p) => String(p.id) === String(valor))?.nome ?? 'a playlist'}”.`
        : `"${tela.nome}" ficou sem programação e volta a mostrar a marca da loja.`)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível trocar a programação.'), 'error')
      carregar(true)
    } finally {
      setSalvandoPlaylist(null)
    }
  }

  async function executarConfirmacao() {
    const { acao, tela } = confirmacao
    setAgindo(true)
    try {
      if (acao === 'revogar') {
        await api.post(`/aparelhos/${tela.id}/revogar`)
        notify(`"${tela.nome}" foi desconectada. A TV vai pedir um código novo.`)
      } else {
        await api.delete(`/aparelhos/${tela.id}`)
        notify(`"${tela.nome}" excluída.`)
      }
      if (pareamento?.aparelhoId === tela.id) setPareamento(null)
      setConfirmacao(null)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível concluir a ação.'), 'error')
      setConfirmacao(null)
    } finally {
      setAgindo(false)
    }
  }

  const segRestantes = pareamento ? restante(pareamento.expiraEm, agora) : 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Telas da loja</h1>
          <div className="page-header-sub">
            As TVs que reproduzem a programação. Cada uma é conectada uma única vez, digitando na TV um
            código de 6 dígitos gerado aqui — não existe link secreto para vazar.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="table-card table-card-form" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={criar} className="apr-form">
          <div className="form-group" style={{ margin: 0, flex: '1 1 240px' }}>
            <label className="form-label" htmlFor="tvt-nome">Nome da TV</label>
            <input
              id="tvt-nome"
              className="form-input"
              placeholder="Ex.: TV do salão"
              maxLength={60}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>
            {criando ? 'Criando…' : 'Criar TV'}
          </button>
        </form>
      </div>

      {pareamento && (
        <div className="apr-pareamento">
          <div className="apr-pareamento-info">
            <div className="apr-rotulo">Conectar “{pareamento.nome}”</div>
            <ol className="apr-passos">
              <li>Na TV, abra <strong>{pareamento.urlDispositivo}</strong></li>
              <li>Digite o código abaixo antes de ele expirar</li>
            </ol>
            <div className={'apr-codigo' + (segRestantes === 0 ? ' expirado' : '')}>{pareamento.codigo}</div>
            <div className="apr-contagem">
              {segRestantes > 0
                ? <>Expira em <strong>{mmss(segRestantes)}</strong> · uso único</>
                : <>Código expirado. Gere outro em “Parear”.</>}
            </div>
            <div className="apr-link">
              <span className="apr-link-url">{pareamento.urlDispositivo}</span>
              <BotaoCopiar
                texto={pareamento.urlDispositivo}
                label="Copiar endereço"
                className="btn btn-secondary btn-sm"
                onCopiado={() => notify('Endereço copiado.')}
                onErro={() => notify('Não foi possível copiar. Digite o endereço na TV.', 'error')}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm apr-fechar" onClick={() => setPareamento(null)}>
              Fechar
            </button>
          </div>
          <div className="apr-pareamento-qr">
            <QrCanvas texto={pareamento.urlDispositivo} />
            <div className="apr-qr-legenda">Aponte a câmera ou digite o endereço na TV</div>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : telas.length === 0 ? (
        <div className="empty-state">Nenhuma TV ainda. Crie uma acima para gerar o código de conexão.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>TV</th>
                <th>Conexão</th>
                <th>Sinal</th>
                <th>Programação</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {telas.map((t) => {
                const seg = restante(t.pareamentoExpiraEm, agora)
                const codigoVivo = t.pareamentoAtivo && seg > 0
                return (
                  <tr key={t.id} className={t.ativo ? undefined : 'apr-linha-off'}>
                    <td>
                      <div className="apr-nome">{t.nome}</div>
                      <div className="apr-meta">
                        {!t.ativo && <span className="badge badge-gray">Desativada</span>}
                        <span className="apr-meta-txt">criada em {dataHora(t.criadoEm)}</span>
                      </div>
                    </td>
                    <td>
                      {t.pareado
                        ? <div className="apr-conexao">Conectada <span className="apr-meta-txt">· {dataHora(t.pareadoEm)}</span></div>
                        : <div className="apr-conexao apr-conexao-off">Não conectada</div>}
                      {codigoVivo && (
                        <div className="apr-codigo-inline">código ativo · expira em <strong>{mmss(seg)}</strong></div>
                      )}
                    </td>
                    <td>
                      <div className="apr-sinal">
                        <span className={'apr-dot' + (t.online ? ' on' : '')} aria-hidden="true" />
                        <span>{t.online ? 'Online' : 'Offline'}</span>
                      </div>
                      <div className="apr-meta-txt">
                        {t.ultimoSinalEm ? `último sinal ${haQuanto(t.ultimoSinalEm, agora)}` : 'nunca deu sinal'}
                      </div>
                      {/* A RESOLUÇÃO reportada pela própria TV, no heartbeat: é como o gestor
                          confere, do escritório, que o painel é mesmo 16:9. */}
                      <div className="apr-meta-txt">
                        {t.tela ? `${t.tela.w} × ${t.tela.h} px` : 'resolução não reportada'}
                      </div>
                    </td>
                    <td>
                      <select
                        className="form-input tvi-sel-playlist"
                        aria-label={`Programação de ${t.nome}`}
                        value={t.tvPlaylistId ?? ''}
                        disabled={salvandoPlaylist === t.id || playlists.length === 0}
                        onChange={(e) => mudarPlaylist(t, e.target.value)}
                      >
                        <option value="">Sem programação</option>
                        {playlists.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                      {playlists.length === 0 && (
                        <div className="ttm-meta-txt">Crie uma playlist primeiro.</div>
                      )}
                    </td>
                    <td>
                      <div className="apr-acoes">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={pareando === t.id} onClick={() => parear(t)}>
                          {pareando === t.id ? 'Gerando…' : (t.pareado ? 'Parear de novo' : 'Parear')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternarAtivo(t)}>
                          {t.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!t.pareado} onClick={() => setConfirmacao({ acao: 'revogar', tela: t })}>
                          Revogar
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm apr-excluir" onClick={() => setConfirmacao({ acao: 'excluir', tela: t })}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmacao}
        variant="danger"
        loading={agindo}
        title={confirmacao?.acao === 'revogar' ? 'Desconectar esta TV?' : 'Excluir esta TV?'}
        message={confirmacao ? `“${confirmacao.tela.nome}”` : ''}
        description={confirmacao?.acao === 'revogar'
          ? 'A TV volta para a tela de código imediatamente e só funciona de novo com um código novo. O cadastro e a programação associada ficam.'
          : 'O cadastro é apagado. Os conteúdos e as playlists NÃO são afetados.'}
        confirmLabel={confirmacao?.acao === 'revogar' ? 'Revogar' : 'Excluir'}
        cancelLabel="Cancelar"
        onConfirm={executarConfirmacao}
        onCancel={() => setConfirmacao(null)}
      />
    </div>
  )
}
