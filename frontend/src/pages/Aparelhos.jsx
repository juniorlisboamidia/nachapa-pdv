// Loja Digital › Totem › Gestão de totens — os tablets DESTE canal (spec §3.2/§3.4).
//
// A tela era "Aparelhos" e cuidava de totem e TV indoor juntos. Com a Loja Digital
// organizada em canais, cada canal cuida dos seus: aqui só entra `tipo: 'TOTEM'`, no GET
// e no POST. Quando o canal TV Indoor existir, ele terá a tela dele — e ela vai reusar
// esta infraestrutura inteira, porque `Dispositivo`, pareamento e heartbeat são
// compartilhados por baixo. O que se separa é a interface, não a fundação.
//
// Verificado em produção antes de fechar o filtro: não existia nenhum `TV_INDOOR`
// cadastrado. Se existisse, filtrar por TOTEM o deixaria sem tela nenhuma — invisível,
// impossível de renomear, revogar ou excluir — e sem erro algum para denunciar isso.
//
// A diferença central em relação aos Aparelhos da cozinha (Etiquetas.jsx) é a
// credencial: ali o token vai na URL e o link É o segredo; aqui o tablet se identifica
// por um cookie HttpOnly que nasce de um código de 6 dígitos digitado NO tablet. Por
// isso esta tela nunca mostra token nenhum — o que ela entrega é o código temporário
// (10 min, uso único) e o endereço fixo /dispositivo, igual para todos os aparelhos.
//
// "Revogar" mata a credencial: o tablet cai para a tela de código no próximo request.
// "Excluir" só funciona em aparelho que nunca mandou pedido (o histórico do outbox é
// auditoria — o backend responde APARELHO_COM_PEDIDOS).
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import BotaoCopiar from '../components/BotaoCopiar'
import { matrizQr } from '../lib/qr'
// "último sinal agora" / "há 4min": o formato é o do resto do sistema, inclusive o do modal de
// monitoramento — antes esta página tinha uma cópia própria, e os dois divergiam na mesma tela.
import { haQuantoNaLista } from '../lib/duracaoRelativa'

const erroDe = (e, fallback) => {
  const d = e?.response?.data
  if (d?.erro === 'APARELHO_COM_PEDIDOS') return 'Este aparelho já enviou pedidos e não pode ser excluído. Desative-o em vez de apagar — o histórico do totem é auditoria.'
  return d?.error ?? d?.erro ?? fallback
}

// Contagem regressiva do código (mm:ss). Zero = expirado.
function restante(iso, agora) {
  if (!iso) return 0
  return Math.max(0, Math.floor((new Date(iso).getTime() - agora) / 1000))
}
const mmss = (seg) => `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`

const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

// QR do endereço /dispositivo, desenhado da matriz local (lib/qr.js) — nada de serviço
// externo de QR: o tablet pode estar numa rede sem internet aberta.
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

export default function Aparelhos() {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [toast, setToast] = useState(null)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  // Código de pareamento em cartaz: { aparelhoId, nome, codigo, expiraEm, urlDispositivo }
  const [pareamento, setPareamento] = useState(null)
  const [pareando, setPareando] = useState(null)
  const [confirmacao, setConfirmacao] = useState(null) // { acao:'revogar'|'excluir', aparelho }
  const [agindo, setAgindo] = useState(false)
  // Relógio próprio: a contagem do código e o "há X min" precisam andar sem refetch.
  const [agora, setAgora] = useState(() => Date.now())

  const notify = (message, type = 'success') => setToast({ message, type })

  function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true)
    // O filtro vai no SERVIDOR, não numa peneira aqui: pedir a lista inteira e esconder
    // metade dela na tela é como um aparelho de outro canal reaparece num contador, num
    // "nenhum resultado" errado ou numa ação em lote.
    api.get('/aparelhos', { params: { tipo: 'TOTEM' } })
      .then((r) => setLista(Array.isArray(r.data?.aparelhos) ? r.data.aparelhos : []))
      .catch((e) => { if (!silencioso) notify(erroDe(e, 'Não foi possível carregar os aparelhos.'), 'error') })
      .finally(() => setCarregando(false))
  }

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lista a cada 30 s (o "online" do servidor é ultimoHeartbeatEm < 150 s) e relógio a
  // cada 1 s. Dois intervalos porque a contagem do código não justifica bater no servidor.
  useEffect(() => {
    const t1 = setInterval(() => carregar(true), 30_000)
    const t2 = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function criar(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n || criando) return
    setCriando(true)
    try {
      await api.post('/aparelhos', { nome: n, tipo: 'TOTEM' })
      setNome('')
      notify('Aparelho criado. Agora use "Parear" para gerar o código do tablet.')
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível criar o aparelho.'), 'error')
    } finally {
      setCriando(false)
    }
  }

  async function parear(ap) {
    setPareando(ap.id)
    try {
      const { data } = await api.post(`/aparelhos/${ap.id}/parear`)
      setPareamento({ aparelhoId: ap.id, nome: ap.nome, codigo: data?.codigo, expiraEm: data?.expiraEm, urlDispositivo: data?.urlDispositivo })
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível gerar o código.'), 'error')
    } finally {
      setPareando(null)
    }
  }

  async function alternarAtivo(ap) {
    try {
      await api.patch(`/aparelhos/${ap.id}`, { ativo: !ap.ativo })
      notify(ap.ativo ? `"${ap.nome}" desativado. O tablet para de responder.` : `"${ap.nome}" ativado.`)
      carregar(true)
    } catch (err) {
      notify(erroDe(err, 'Não foi possível atualizar o aparelho.'), 'error')
    }
  }

  async function executarConfirmacao() {
    const { acao, aparelho } = confirmacao
    setAgindo(true)
    try {
      if (acao === 'revogar') {
        await api.post(`/aparelhos/${aparelho.id}/revogar`)
        notify(`"${aparelho.nome}" foi desconectado. O tablet vai pedir um código novo.`)
      } else {
        await api.delete(`/aparelhos/${aparelho.id}`)
        notify(`"${aparelho.nome}" excluído.`)
      }
      if (pareamento?.aparelhoId === aparelho.id) setPareamento(null)
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
          <h1>Gestão de totens</h1>
          <div className="page-header-sub">
            Os tablets que rodam o <strong>totem de autoatendimento</strong>. Cada um é conectado uma única vez,
            digitando no tablet um código de 6 dígitos gerado aqui — não existe link secreto para vazar.
            Perdeu o tablet? <strong>Revogue</strong> e ele para na hora.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="table-card table-card-form" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={criar} className="apr-form">
          <div className="form-group" style={{ margin: 0, flex: '1 1 240px' }}>
            <label className="form-label" htmlFor="apr-nome">Nome do aparelho</label>
            <input
              id="apr-nome"
              className="form-input"
              placeholder="Ex.: Totem da entrada"
              maxLength={60}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>
            {criando ? 'Criando…' : 'Criar aparelho'}
          </button>
        </form>
      </div>

      {pareamento && (
        <div className="apr-pareamento">
          <div className="apr-pareamento-info">
            <div className="apr-rotulo">Conectar “{pareamento.nome}”</div>
            <ol className="apr-passos">
              <li>No tablet, abra <strong>{pareamento.urlDispositivo}</strong></li>
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
                onErro={() => notify('Não foi possível copiar. Digite o endereço no tablet.', 'error')}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm apr-fechar" onClick={() => setPareamento(null)}>
              Fechar
            </button>
          </div>
          <div className="apr-pareamento-qr">
            <QrCanvas texto={pareamento.urlDispositivo} />
            <div className="apr-qr-legenda">Aponte a câmera do tablet</div>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state">Nenhum aparelho ainda. Crie um totem ou uma TV para gerar o código do tablet.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Aparelho</th>
                <th>Conexão</th>
                <th>Sinal</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((ap) => {
                const seg = restante(ap.pareamentoExpiraEm, agora)
                const codigoVivo = ap.pareamentoAtivo && seg > 0
                return (
                  <tr key={ap.id} className={ap.ativo ? undefined : 'apr-linha-off'}>
                    <td>
                      <div className="apr-nome">{ap.nome}</div>
                      {/* Sem selo de tipo: numa tela chamada "Gestão de totens", um selo
                          "TOTEM" em toda linha não informa nada e disputa espaço com o
                          selo que importa — o de desativado. */}
                      <div className="apr-meta">
                        {!ap.ativo && <span className="badge badge-gray">Desativado</span>}
                        <span className="apr-meta-txt">criado em {dataHora(ap.criadoEm)}</span>
                      </div>
                    </td>
                    <td>
                      {ap.pareado
                        ? <div className="apr-conexao">Conectado <span className="apr-meta-txt">· {dataHora(ap.pareadoEm)}</span></div>
                        : <div className="apr-conexao apr-conexao-off">Não conectado</div>}
                      {codigoVivo && (
                        <div className="apr-codigo-inline">
                          código ativo · expira em <strong>{mmss(seg)}</strong>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="apr-sinal">
                        <span className={'apr-dot' + (ap.online ? ' on' : '')} aria-hidden="true" />
                        <span>{ap.online ? 'Online' : 'Offline'}</span>
                      </div>
                      <div className="apr-meta-txt">
                        {ap.ultimoSinalEm ? `último sinal ${haQuantoNaLista(ap.ultimoSinalEm, agora)}` : 'nunca deu sinal'}
                        {ap.versao ? ` · ${ap.versao}` : ''}
                      </div>
                    </td>
                    <td>
                      <div className="apr-acoes">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={pareando === ap.id} onClick={() => parear(ap)}>
                          {pareando === ap.id ? 'Gerando…' : (ap.pareado ? 'Parear de novo' : 'Parear')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternarAtivo(ap)}>
                          {ap.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!ap.pareado} onClick={() => setConfirmacao({ acao: 'revogar', aparelho: ap })}>
                          Revogar
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm apr-excluir" onClick={() => setConfirmacao({ acao: 'excluir', aparelho: ap })}>
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
        title={confirmacao?.acao === 'revogar' ? 'Desconectar este aparelho?' : 'Excluir este aparelho?'}
        message={confirmacao ? `“${confirmacao.aparelho.nome}”` : ''}
        description={confirmacao?.acao === 'revogar'
          ? 'O tablet volta para a tela de código imediatamente e só funciona de novo com um código novo. O cadastro e o histórico ficam.'
          : 'O cadastro é apagado. Aparelho que já enviou pedidos não pode ser excluído — nesse caso, desative.'}
        confirmLabel={confirmacao?.acao === 'revogar' ? 'Revogar' : 'Excluir'}
        cancelLabel="Cancelar"
        onConfirm={executarConfirmacao}
        onCancel={() => setConfirmacao(null)}
      />
    </div>
  )
}
