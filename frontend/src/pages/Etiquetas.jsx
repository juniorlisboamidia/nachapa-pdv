// Etiquetas — rotulagem de alimentos manipulados (ANVISA RDC 216/2004).
// Três seções, cada uma uma subcategoria da sidebar (padrão do PDV, sem abas
// internas): Configuração (estabelecimento + validade padrão por conservação),
// Itens (validade própria por insumo) e Histórico (tudo que já foi impresso).
// A seção atual vem da URL (/etiquetas/:tab).
import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import { desenharEtiqueta, dadosExemplo, MODELOS } from '../lib/etiquetaCanvas'
import { bluetoothDisponivel, conectar, conectado, imprimir, LARGURA_PX, calibracao, setCalibracao } from '../lib/niimbotB1'

// Presets de altura do rolo (mm) oferecidos no select — "Personalizar" abre um input livre.
const ALTURA_PRESETS = [30, 40, 50]
// Largura útil sempre fixa (cabeça de impressão da B1, ver LARGURA_PX em niimbotB1.js):
// 384px / 8 dots-por-mm (203dpi arredondado) = 48mm. Só informativa aqui — não é editável.
const LARGURA_MM = Math.round(LARGURA_PX / 8)

const TABS = [
  { id: 'config', label: 'Configuração', sub: 'Estabelecimento e validade padrão' },
  { id: 'itens', label: 'Itens', sub: 'Validade própria por insumo' },
  { id: 'historico', label: 'Histórico', sub: 'Tudo que já foi impresso' },
]
const TAB_IDS = TABS.map((t) => t.id)

// A API só devolve o código da conservação (enum ConservacaoTipo) — os rótulos
// de exibição ficam no front.
const CONS_LABEL = {
  CONGELADO: 'Congelado',
  RESFRIADO_0_4: 'Refrigerado',
  RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente Seco',
  DESCONGELADO: 'Descongelado',
  ABERTO: 'Produto aberto',
}
// Ordem fixa de exibição (a temperatura sai da coluna própria `tempLabel`, não do nome).
const CONS_ORDER = ['CONGELADO', 'RESFRIADO_0_4', 'RESFRIADO_4_6', 'AMBIENTE', 'DESCONGELADO', 'ABERTO']
const ordenarCons = (rs) => [...rs].sort((a, b) => CONS_ORDER.indexOf(a.conservacao) - CONS_ORDER.indexOf(b.conservacao))

export default function Etiquetas() {
  const { tab: tabParam } = useParams()
  const tab = TAB_IDS.includes(tabParam) ? tabParam : 'config'
  const tabDef = TABS.find((t) => t.id === tab) || TABS[0]
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tabDef.label}</h1>
          <div className="page-header-sub">{tabDef.sub}</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {tab === 'config' && <AbaConfig notify={notify} />}
      {tab === 'itens' && <AbaItens notify={notify} />}
      {tab === 'historico' && <AbaHistorico notify={notify} />}
    </div>
  )
}

// ===================== CONFIGURAÇÃO =====================
function AbaConfig({ notify }) {
  const [config, setConfig] = useState(null)
  const [regras, setRegras] = useState([])
  const [salvando, setSalvando] = useState(false)
  // Estado da impressora física — vive na Config (não no config salvo no banco): é uma
  // sessão Bluetooth do navegador, não uma preferência da loja. `conn` é `{nome}` ou null.
  const [conn, setConn] = useState(null)
  const [imprimindo, setImprimindo] = useState(false)
  // Controla se o select de altura está em modo "Personalizar" — precisa ser um estado
  // próprio (e não derivado de `!ALTURA_PRESETS.includes(config.alturaMm)`), senão
  // escolher "Personalizar" sem digitar nada faria o select "saltar" de volta pro preset
  // no próximo render (o valor em si continuaria igual a um preset).
  const [personalizarAltura, setPersonalizarAltura] = useState(false)
  // Calibração da impressão (densidade + ajuste vertical) — POR APARELHO (localStorage, via
  // niimbotB1), não vai no config do banco: depende do rolo/impressora daquele aparelho.
  const [cal, setCal] = useState(() => calibracao())
  const updCal = (patch) => { const nc = { ...cal, ...patch }; setCal(nc); setCalibracao(nc) }
  // Canvas da prévia ao vivo — redesenhado pelo useEffect abaixo a cada mudança de config.
  const previaRef = useRef(null)

  function carregar() {
    api.get('/etiquetas/config')
      .then((r) => {
        const cfg = r.data.config
        // modelo/fonte podem vir nulos por algum motivo (registro antigo, coluna nova) —
        // trata como CLASSICO/NORMAL, os mesmos defaults do backend (Task 3).
        const cfgSaneado = { ...cfg, modelo: cfg.modelo || 'CLASSICO', fonte: cfg.fonte || 'NORMAL' }
        setConfig(cfgSaneado)
        setRegras(r.data.regras)
        setPersonalizarAltura(!ALTURA_PRESETS.includes(cfgSaneado.alturaMm))
      })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar a configuração.', 'error'))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redesenha a prévia sempre que a config muda — mesmo `desenharEtiqueta` que o quiosque
  // usa para imprimir de verdade (ver comentário no topo de etiquetaCanvas.js): o que
  // aparece aqui é literalmente o que sai no papel. `config` inteiro como dependência
  // (em vez de listar modelo/fonte/alturaMm/razaoSocial/cnpj/sif/sie um a um) porque `upd`
  // sempre cria um objeto novo — cobre exatamente esses campos sem risco de esquecer um.
  useEffect(() => {
    if (!config || !previaRef.current) return
    desenharEtiqueta(previaRef.current, dadosExemplo(), config)
  }, [config])

  const upd = (k, v) => setConfig((c) => ({ ...c, [k]: v }))
  // Só os dias são editáveis — a temperatura (tempLabel) é fixa, definida pela
  // conservação, e nunca passa por input: o PUT /etiquetas/regras rejeita com
  // 400 se algum tempLabel vier vazio, o que travaria a tela sem recarregar.
  const updRegraDias = (cons, dias) => setRegras((rs) => rs.map((r) => (r.conservacao === cons ? { ...r, dias } : r)))

  async function salvar() {
    setSalvando(true)
    try {
      // config já traz de volta larguraMm/alturaMm/campos/modelo/fonte (layout de
      // impressão) — reenviar o objeto inteiro preserva o que já estava configurado lá em
      // vez de resetar pro default do backend.
      await api.put('/etiquetas/config', config)
      await api.put('/etiquetas/regras', {
        regras: regras.map((r) => ({ conservacao: r.conservacao, tempLabel: r.tempLabel, dias: r.dias })),
      })
      notify('Configurações salvas.')
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  // Botão "Imprimir etiqueta de teste": usa a MESMA amostra fictícia da prévia, desenhada
  // num canvas próprio (fora do DOM) — não depende do <canvas> de prévia estar montado nem
  // corre risco de disputa com o useEffect de prévia redesenhando no meio da impressão.
  async function imprimirTeste() {
    if (imprimindo) return
    // `conectado()` pode "mentir" depois de a impressora cair (ver niimbotB1.js) — mas
    // aqui é a checagem de entrada mais barata antes de tentar, e o catch abaixo cobre o
    // caso de a sessão já ter caído sem a gente saber.
    if (!conectado()) {
      notify('Conecte a impressora primeiro.', 'error')
      return
    }
    setImprimindo(true)
    try {
      const canvas = document.createElement('canvas')
      desenharEtiqueta(canvas, dadosExemplo(), config)
      await imprimir(canvas, { copias: 1, densidade: cal.densidade, ajusteY: cal.ajusteY })
      notify('Etiqueta de teste enviada para a impressora.')
    } catch (e) {
      // niimbotB1 já devolve mensagens amigáveis em pt-BR (erroAmigavel) — usa e.message
      // direto, sem o padrão e?.response?.data?.error das chamadas de API (isto não é uma).
      notify(e?.message || 'Não foi possível imprimir a etiqueta de teste.', 'error')
    } finally {
      setImprimindo(false)
    }
  }

  // "Aparelhos da cozinha" fica FORA do `if (!config)`: é uma seção independente, com
  // fetch próprio, e é o único caminho até o link do quiosque. Se o GET /etiquetas/config
  // falhar, o card ainda aparece em vez de a aba inteira travar em "Carregando…".
  if (!config) {
    return (
      <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
        <div className="loading-state">Carregando…</div>
        <CardDispositivos notify={notify} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="etq-grid">
        {/* ESQUERDA: impressora + identificação + tamanho/fonte + regras de validade. */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <CardImpressora conn={conn} setConn={setConn} notify={notify} />

          <div className="table-card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Identificação do estabelecimento</h2>
            {/* Só pedimos o que o rodapé da etiqueta imprime de fato (ver etiquetaCanvas.js):
                razão social, CNPJ, SIF e SIE. O responsável técnico NÃO é impresso hoje, então
                não é pedido aqui — um campo que a tela coleta e o papel ignora é promessa
                falsa. A coluna `responsavelTecnico` continua no banco e o PUT /config continua
                aceitando: quando o RT entrar no rótulo, o campo volta sem migration. */}
            <div className="form-group">
              <label className="form-label">Razão social / nome fantasia</label>
              <input className="form-input" value={config.razaoSocial || ''} onChange={(e) => upd('razaoSocial', e.target.value)} />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">CNPJ</label>
                <input className="form-input" value={config.cnpj || ''} onChange={(e) => upd('cnpj', e.target.value)} />
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">SIF (inspeção federal)</label>
                <input className="form-input" value={config.sif || ''} onChange={(e) => upd('sif', e.target.value)} placeholder="Ex.: 4231" />
              </div>
              <div className="form-group">
                <label className="form-label">SIE (inspeção estadual)</label>
                <input className="form-input" value={config.sie || ''} onChange={(e) => upd('sie', e.target.value)} placeholder="Ex.: 0987" />
              </div>
            </div>
          </div>

          <div className="table-card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Tamanho e fonte</h2>
            <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
              Largura fixa em {LARGURA_MM} mm (cabeça da impressora). A altura depende do rolo da loja.
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Altura do rolo</label>
                <select
                  className="form-input"
                  value={personalizarAltura ? 'custom' : String(config.alturaMm)}
                  onChange={(e) => {
                    if (e.target.value === 'custom') { setPersonalizarAltura(true); return }
                    setPersonalizarAltura(false)
                    upd('alturaMm', parseInt(e.target.value, 10))
                  }}
                >
                  {ALTURA_PRESETS.map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
                  <option value="custom">Personalizar…</option>
                </select>
                {personalizarAltura && (
                  <input
                    className="form-input"
                    type="number"
                    min={15}
                    max={100}
                    style={{ marginTop: 8 }}
                    placeholder="Altura em mm (15 a 100)"
                    value={config.alturaMm}
                    onChange={(e) => upd('alturaMm', parseInt(e.target.value, 10) || 1)}
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Fonte</label>
                <select className="form-input" value={config.fonte} onChange={(e) => upd('fonte', e.target.value)}>
                  <option value="NORMAL">Normal</option>
                  <option value="GRANDE">Grande</option>
                </select>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Regras de validade (padrão)</h2>
            <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
              Vale para todo item que não tem validade própria (aba Itens).
            </div>
            {/* Cabeçalho das colunas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: 'var(--app-text-soft, #888)' }}>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>CONSERVAÇÃO</span>
              <span style={{ flex: '0 0 150px' }}>TEMPERATURA</span>
              <span style={{ flex: '0 0 110px' }}>VALIDADE</span>
            </div>
            {ordenarCons(regras).map((r) => (
              <div key={r.conservacao} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: 13, fontWeight: 600 }}>{CONS_LABEL[r.conservacao] || r.conservacao}</span>
                <span style={{ flex: '0 0 150px', fontSize: 13 }} title="Temperatura impressa no rótulo">{r.tempLabel}</span>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={3650}
                  style={{ width: 76 }}
                  value={r.dias}
                  onChange={(e) => updRegraDias(r.conservacao, parseInt(e.target.value, 10) || 1)}
                />
                <span style={{ fontSize: 12, color: 'var(--app-text-soft, #888)', width: 34 }}>dias</span>
              </div>
            ))}
          </div>
        </div>

        {/* DIREITA: os 4 modelos + prévia ao vivo + teste de impressão. */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="table-card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Modelo e prévia</h2>
            <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 4 }}>
              Escolha o modelo — a prévia abaixo mostra exatamente o que sai no papel.
            </div>

            <div className="etq-modelos">
              {MODELOS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`etq-modelo${config.modelo === m.id ? ' is-on' : ''}`}
                  onClick={() => upd('modelo', m.id)}
                >
                  <span className="etq-modelo-nome">{m.nome}</span>
                  <span className="etq-modelo-descr">{m.descr}</span>
                </button>
              ))}
            </div>

            {/* A etiqueta pode ser mais alta que a moldura (rolos de 50mm+) — overflow:auto
                deixa rolar em vez de espremer/cortar a prévia. */}
            <div className="etq-previa">
              <canvas ref={previaRef} />
            </div>
            <div className="page-header-sub" style={{ marginTop: 8, textAlign: 'center' }}>
              {LARGURA_MM}×{config.alturaMm} mm · fonte {config.fonte === 'GRANDE' ? 'grande' : 'normal'} · 203 dpi
            </div>

            {/* Calibração da impressora física (por aparelho). Densidade corrige impressão
                apagada; ajuste vertical corrige corte no topo/base do rolo. */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Densidade</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => updCal({ densidade: d })}
                      style={{
                        width: 34, height: 34, borderRadius: 8, fontWeight: 700, cursor: 'pointer',
                        border: '1px solid var(--app-border, #e7dcc2)',
                        background: cal.densidade === d ? 'var(--brand-gold, #eab802)' : 'var(--app-surface, #fffdf8)',
                        color: cal.densidade === d ? '#0e1319' : 'var(--app-text, #333)',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Ajuste vertical (px)</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 92 }}
                  min={-40}
                  max={40}
                  value={cal.ajusteY}
                  onChange={(e) => updCal({ ajusteY: Math.max(-40, Math.min(40, parseInt(e.target.value, 10) || 0)) })}
                />
              </div>
            </div>
            <div className="page-header-sub" style={{ marginTop: 4 }}>
              Densidade maior = impressão mais escura. Ajuste vertical: valor positivo empurra pra baixo (corrige corte no topo).
            </div>

            <button
              type="button"
              className="btn btn-primary etq-print-btn"
              disabled={imprimindo}
              onClick={imprimirTeste}
            >
              {imprimindo ? 'Imprimindo…' : 'Imprimir etiqueta de teste'}
            </button>
          </div>
        </div>
      </div>

      {/* O botão fica logo abaixo do grid que ele de fato salva (config + regras). Os
          aparelhos vêm depois porque salvam sozinhos (criar/revogar são imediatos) —
          deixá-los acima do botão sugeriria que precisam de "Salvar" pra valer. */}
      <div>
        <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>

      <CardDispositivos notify={notify} />
    </div>
  )
}

// ===================== IMPRESSORA (NIIMBOT B1) =====================
// Bluetooth só abre o seletor de dispositivos dentro de um gesto do usuário (clique) —
// por isso não há tentativa de conectar sozinho ao montar a tela, só o botão. `conectado()`
// pode "mentir" depois de a impressora cair (ver o aviso em niimbotB1.js): o botão deste
// card serve tanto para conectar quanto para reconectar, sempre por um novo clique — nunca
// reimprime nem reconecta sozinho.
function CardImpressora({ conn, setConn, notify }) {
  const [conectando, setConectando] = useState(false)
  const disponivel = bluetoothDisponivel()

  async function tentarConectar() {
    if (conectando) return
    setConectando(true)
    try {
      const info = await conectar()
      setConn(info)
      notify(`Impressora "${info.nome}" conectada.`)
    } catch (e) {
      notify(e?.message || 'Não foi possível conectar na impressora.', 'error')
    } finally {
      setConectando(false)
    }
  }

  return (
    <div className="table-card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Impressora (Niimbot B1)</h2>
      <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
        Conecte a etiquetadora por Bluetooth para imprimir o teste e as etiquetas na cozinha.
      </div>
      {!disponivel && (
        <div style={{ fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          Este navegador não tem Bluetooth. Abra esta tela no Chrome (Android ou desktop), perto da impressora.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {conn ? `Conectada: ${conn.nome}` : 'Não conectada'}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginLeft: 'auto' }}
          disabled={!disponivel || conectando}
          onClick={tentarConectar}
        >
          {conectando ? 'Conectando…' : conn ? 'Reconectar' : 'Conectar'}
        </button>
      </div>
    </div>
  )
}

// Copiar fora de contexto seguro. navigator.clipboard só existe em https/localhost;
// se o dono abrir o PDV por IP na rede local (http://192.168.x.x), a API simplesmente
// não está lá. Sem este fallback ele ficaria sem NENHUM jeito de tirar o link da tela —
// e o link é o produto desta seção. execCommand está deprecado, mas é o que resta.
function copiarFallback(texto) {
  const ta = document.createElement('textarea')
  ta.value = texto
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

// ===================== APARELHOS DA COZINHA =====================
// O quiosque (/etiquetas/:token/imprimir) abre SEM login: o token do Dispositivo É a
// credencial — quem tem o link imprime etiquetas nesta loja, ponto. Por isso a tela
// nunca mostra o token cru: o que o dono leva daqui é o link pronto, pelo botão copiar.
// Mostrar o token solto o trataria como um id inofensivo e convidaria a mandá-lo no
// grupo do WhatsApp.
//
// Os aparelhos são os MESMOS do Ponto Facial: um único model Dispositivo, um único
// token, servindo /ponto/:token e /etiquetas/:token/imprimir. Revogar aqui derruba os
// dois — daí o aviso explícito na confirmação (o dono não pode descobrir isso
// quebrando o relógio de ponto da equipe no meio do expediente).
function CardDispositivos({ notify }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [confirmando, setConfirmando] = useState(null) // id do aparelho em confirmação inline
  const [revogando, setRevogando] = useState(false)

  function carregar() {
    // Endpoints do Ponto Facial (ADMIN) — dispositivo é model de tenant, a extension do
    // Prisma injeta o empresaId sozinha. Nada de filtrar por loja aqui.
    api.get('/ponto/dispositivos')
      // Só tablets de etiqueta (serialColetor NULL). O coletor facial (DIXI) é do Ponto
      // Facial, não imprime etiqueta — então fica de fora desta lista.
      .then((r) => setLista(Array.isArray(r.data) ? r.data.filter((d) => !d.ehColetor) : []))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os aparelhos.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const linkDe = (token) => `${window.location.origin}/etiquetas/${token}/imprimir`

  async function copiar(d) {
    const link = linkDe(d.token)
    let ok = false
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(link); ok = true }
    } catch { ok = false } // permissão negada / contexto inseguro — cai no fallback
    if (!ok) ok = copiarFallback(link)
    if (ok) notify(`Link do "${d.nome}" copiado. Cole no navegador do tablet — é secreto, não repasse.`)
    else notify('Não foi possível copiar o link neste navegador.', 'error')
  }

  async function criar(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n || criando) return
    setCriando(true)
    try {
      // O POST devolve o token do aparelho novo, mas não copiamos automaticamente:
      // escrever na área de transferência sem clique explícito é bloqueado por alguns
      // navegadores e o erro apareceria como se o cadastro tivesse falhado.
      await api.post('/ponto/dispositivos', { nome: n })
      setNome('')
      notify('Aparelho criado. Use "Copiar link" para levá-lo até o tablet.')
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível criar o aparelho.', 'error')
    } finally {
      setCriando(false)
    }
  }

  async function revogar(d) {
    setRevogando(true)
    try {
      await api.delete(`/ponto/dispositivos/${d.id}`)
      setConfirmando(null)
      notify(`"${d.nome}" revogado. O link antigo parou de funcionar.`)
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível revogar o aparelho.', 'error')
    } finally {
      setRevogando(false)
    }
  }

  return (
    <div className="table-card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Aparelhos da cozinha</h2>
      <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
        Cada aparelho tem um link próprio que abre a tela de impressão no tablet, sem pedir login.
        <strong> O link é secreto:</strong> quem tiver ele imprime etiquetas nesta loja. Mande só para o tablet da cozinha
        e, se vazar, revogue o aparelho aqui.
      </div>

      <form onSubmit={criar} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="form-input"
          style={{ maxWidth: 260 }}
          placeholder="Ex.: Tablet da cozinha"
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>
          {criando ? 'Criando…' : 'Criar aparelho'}
        </button>
      </form>

      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state">Nenhum aparelho ainda. Crie um para gerar o link do tablet.</div>
      ) : (
        <table className="hb-table">
          <thead>
            <tr>
              <th>Aparelho</th>
              <th>Última sincronização</th>
              <th style={{ textAlign: 'right' }}>Link do tablet</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td style={{ fontWeight: 600 }}>{d.nome}</td>
                  {/* ultimaSync é opcional no model: aparelho recém-criado, ou que só
                      imprime etiquetas, nunca sincronizou (quem grava isso é o coletor). */}
                  <td style={{ color: 'var(--app-text-soft, #888)' }}>{d.ultimaSync ? dtAno(d.ultimaSync) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(d)}>Copiar link</button>{' '}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={confirmando === d.id}
                      onClick={() => setConfirmando(d.id)}
                    >
                      Revogar
                    </button>
                  </td>
                </tr>
                {/* Confirmação inline em vez de modal: o aviso é a parte que importa e
                    aqui ele fica colado na linha do aparelho certo. */}
                {confirmando === d.id && (
                  <tr>
                    <td colSpan={3} style={{ background: 'var(--app-bg-soft, #fbf7f7)' }}>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        Revogar <strong>{d.nome}</strong>? O link para de funcionar na hora e o tablet que estiver com ele
                        aberto para de imprimir.{' '}
                        <strong>Este mesmo aparelho é usado no Ponto Facial</strong> — se a equipe bate ponto nele, o ponto
                        para junto e você precisará criar um aparelho novo e reconfigurar o tablet.
                      </div>
                      <button type="button" className="btn btn-danger btn-sm" disabled={revogando} onClick={() => revogar(d)}>
                        {revogando ? 'Revogando…' : 'Revogar mesmo assim'}
                      </button>{' '}
                      <button type="button" className="btn btn-secondary btn-sm" disabled={revogando} onClick={() => setConfirmando(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// datetime-local prefill = agora, no fuso local (mesmo helper de PontoFacial.jsx —
// pequeno demais para justificar compartilhar módulo entre as duas telas).
function agoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Guarda contra o campo de manipulação vazio/inválido (achado do review da Task 2):
// `new Date('').toISOString()` estoura "Invalid time value" — um erro críptico para quem
// só esqueceu de preencher a hora. `Date.parse` devolve NaN para string vazia ou inválida,
// então isto é o que decide se dá para chamar registrarEDesenhar com este valor.
function manipuladoEmValido(v) {
  return Number.isFinite(Date.parse(v))
}

// ===================== ITENS =====================
// Reforma (Fatia B, Task 2): 2 colunas — catálogo à esquerda (busca + edição inline
// que já existia + botão "Usar" + item manual) e painel "Etiqueta selecionada" à
// direita, com prévia ao vivo (mesmo desenharEtiqueta da Config) e "Imprimir agora"
// via Niimbot B1 (POST /etiquetas/registrar, que é quem sorteia o lote de verdade).
function AbaItens({ notify }) {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [cons, setCons] = useState([])
  const [loading, setLoading] = useState(true)

  // Config + regras — só para a prévia/impressão do painel: modelo/fonte/identificação
  // da loja e o tempLabel por conservação. Esta aba não edita nenhum dos dois (isso é a
  // aba Configuração) — busca uma vez no mount, sem depender da busca do catálogo.
  const [config, setConfig] = useState(null)
  const [regras, setRegras] = useState([])

  // Impressora — mesmo estado/padrão da AbaConfig (sessão Bluetooth do navegador, não
  // uma preferência salva). Reusa o card CardImpressora já definido acima neste arquivo.
  const [conn, setConn] = useState(null)
  const [imprimindo, setImprimindo] = useState(false)

  // Etiqueta selecionada no painel à direita. null = nada carregado ainda (painel mostra
  // um estado vazio em vez de uma prévia sem sentido).
  const [sel, setSel] = useState(null)
  const [novoNome, setNovoNome] = useState('') // "Adicionar item manual"
  const previaRef = useRef(null)

  // Sequência de impressão (Fatia B, Task 3): fila de itens a registrar+imprimir em
  // ordem. `id` local vem de um contador incremental — NÃO Date.now()/Math.random(): a
  // fila é só desta sessão de tela, um contador simples já garante ids sem colisão e sem
  // as armadilhas de Date.now() (duas chamadas no mesmo milissegundo, relógio do sistema).
  const [fila, setFila] = useState([])
  const filaSeqRef = useRef(0)
  const [imprimindoFila, setImprimindoFila] = useState(false)

  function carregar() {
    api.get('/etiquetas/itens', { params: busca ? { busca } : {} })
      .then((r) => { setItens(r.data.itens || []); setCons(r.data.conservacoes || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os itens.', 'error'))
      .finally(() => setLoading(false))
  }
  // Debounce de 250ms na busca — mesmo padrão usado em Equipe.jsx.
  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  useEffect(() => {
    api.get('/etiquetas/config')
      .then((r) => { setConfig(r.data.config); setRegras(r.data.regras || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar a configuração da etiqueta.', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salvarItem(it, patch) {
    const novo = { ...it, ...patch }
    setItens((xs) => xs.map((x) => (x.insumoId === it.insumoId ? novo : x)))
    try {
      const r = await api.put(`/etiquetas/itens/${it.insumoId}`, {
        conservacaoPadrao: novo.conservacaoPadrao,
        validadeDias: novo.validadeDias,
        ativo: novo.ativo,
      })
      // recarrega pra pegar a validadeEfetiva recalculada pelo backend
      setItens((xs) => xs.map((x) => (x.insumoId === it.insumoId
        ? { ...x, conservacaoPadrao: r.data.item.conservacaoPadrao, validadeDias: r.data.item.validadeDias, ativo: r.data.item.ativo }
        : x)))
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar o item.', 'error')
      carregar()
    }
  }

  // Carrega um item do catálogo no painel à direita. Preserva o responsável entre
  // trocas — é comum a mesma pessoa etiquetar vários itens seguidos — mas sempre
  // reseta manipulação (para "agora") e cópias (para 1): os dois são específicos de
  // CADA etiqueta, não do operador.
  function usarItem(it) {
    const conservacao = it.conservacaoPadrao || cons[0] || ''
    const dias = it.validadeEfetiva ?? regras.find((r) => r.conservacao === conservacao)?.dias ?? 1
    setSel((s) => ({
      insumoId: it.insumoId, nomeAvulso: '', nome: it.nome, conservacao,
      manipuladoEm: agoraLocal(), validadeDias: dias,
      responsavelNome: s?.responsavelNome || '', copias: 1,
    }))
  }

  // Item fora do catálogo (nunca cadastrado como insumo): carrega no painel como
  // `nomeAvulso` — o POST /etiquetas/registrar aceita os dois caminhos.
  function usarManual() {
    const nome = novoNome.trim()
    if (!nome) return
    const conservacao = cons[0] || ''
    const dias = regras.find((r) => r.conservacao === conservacao)?.dias ?? 1
    setSel((s) => ({
      insumoId: null, nomeAvulso: nome, nome, conservacao,
      manipuladoEm: agoraLocal(), validadeDias: dias,
      responsavelNome: s?.responsavelNome || '', copias: 1,
    }))
    setNovoNome('')
  }

  const updSel = (patch) => setSel((s) => (s ? { ...s, ...patch } : s))

  // Prévia ao vivo — o MESMO desenharEtiqueta que a Config usa e que o POST de
  // impressão (abaixo) também chama: o que aparece aqui é o layout real. O lote é
  // sempre "—": só o backend sorteia o lote de verdade, no momento do registro —
  // por isso a nota logo abaixo da prévia avisa que o código real sai ao imprimir.
  useEffect(() => {
    if (!sel || !config || !previaRef.current) return
    const manipMs = Date.parse(sel.manipuladoEm)
    const manipuladoEm = Number.isFinite(manipMs) ? new Date(manipMs) : new Date()
    const dias = Number(sel.validadeDias) || 0
    desenharEtiqueta(previaRef.current, {
      nomeItem: sel.nome,
      conservacaoLabel: CONS_LABEL[sel.conservacao] || sel.conservacao || '',
      tempLabel: regras.find((r) => r.conservacao === sel.conservacao)?.tempLabel || '',
      manipuladoEm,
      validoAte: new Date(manipuladoEm.getTime() + dias * 86400000),
      responsavelNome: sel.responsavelNome || '—',
      lote: '—',
    }, config)
  }, [sel, config, regras])

  // Bloqueia "Adicionar à fila" e "Imprimir agora" quando falta item/responsável, ou
  // quando o campo de manipulação está vazio/inválido (ver manipuladoEmValido acima).
  // Um único cálculo usado nos dois `disabled` e nos dois handlers — não dá para os
  // botões discordarem de quando é seguro chamar registrarEDesenhar.
  const selInvalido = !sel || !(sel.insumoId || sel.nomeAvulso.trim()) || !sel.responsavelNome.trim() || !manipuladoEmValido(sel.manipuladoEm)

  // Registra a etiqueta de verdade (o servidor sorteia o lote e recalcula a validade —
  // ver o comentário do POST /etiquetas/registrar no backend) e desenha o canvas de
  // impressão. Compartilhada por "Imprimir agora" (um item) e "Imprimir sequência" (a
  // fila, um item de cada vez): as duas passam por exatamente este registrar→desenhar —
  // só o chamador decide o `copias` e quando de fato chamar `imprimir()`, porque a fila
  // precisa aguardar cada envio Bluetooth terminar antes do próximo item.
  async function registrarEDesenhar(item) {
    const r = await api.post('/etiquetas/registrar', {
      insumoId: item.insumoId,
      nomeAvulso: item.nomeAvulso,
      conservacao: item.conservacao,
      responsavelNome: (item.responsavelNome || '').trim(),
      manipuladoEm: new Date(item.manipuladoEm).toISOString(),
      validadeDias: item.validadeDias,
      quantidade: item.copias,
    })
    const etiqueta = r.data.etiqueta
    // Canvas próprio (fora do DOM) para o bitmap de impressão — não depende do
    // <canvas> da prévia estar montado nem corre risco de disputa com o useEffect
    // de prévia redesenhando no meio da impressão (mesmo padrão de imprimirTeste,
    // na AbaConfig acima).
    const canvas = document.createElement('canvas')
    desenharEtiqueta(canvas, {
      nomeItem: etiqueta.nomeItem,
      conservacaoLabel: CONS_LABEL[etiqueta.conservacao] || etiqueta.conservacao,
      tempLabel: etiqueta.tempLabel,
      manipuladoEm: new Date(etiqueta.manipuladoEm),
      validoAte: new Date(etiqueta.validoAte),
      responsavelNome: etiqueta.responsavelNome,
      lote: etiqueta.lote,
    }, config)
    return { canvas, etiqueta }
  }

  // "Imprimir agora": um item só. `conectado()` pode "mentir" depois de a impressora
  // cair (ver niimbotB1.js) — o catch cobre esse caso mostrando o erro amigável da lib.
  async function imprimirAgora() {
    if (imprimindo || selInvalido) return
    if (!conectado()) {
      notify('Conecte a impressora primeiro.', 'error')
      return
    }
    setImprimindo(true)
    try {
      const { canvas, etiqueta } = await registrarEDesenhar(sel)
      await imprimir(canvas, { copias: sel.copias })
      notify(`Etiqueta de "${etiqueta.nomeItem}" (lote ${etiqueta.lote}) enviada para a impressora.`)
    } catch (e) {
      notify(e?.response?.data?.error || e?.message || 'Falha ao imprimir', 'error')
    } finally {
      setImprimindo(false)
    }
  }

  // "Adicionar à fila": empurra um SNAPSHOT do painel atual — trocar de item ou editar
  // `sel` de novo depois não deve alterar o que já está na fila.
  function adicionarFila() {
    if (selInvalido) return
    filaSeqRef.current += 1
    setFila((fs) => [...fs, {
      id: filaSeqRef.current,
      insumoId: sel.insumoId,
      nomeAvulso: sel.nomeAvulso,
      nome: sel.nome,
      conservacao: sel.conservacao,
      conservacaoLabel: CONS_LABEL[sel.conservacao] || sel.conservacao,
      manipuladoEm: sel.manipuladoEm,
      validadeDias: sel.validadeDias,
      responsavelNome: sel.responsavelNome,
      copias: sel.copias,
    }])
    notify(`"${sel.nome}" adicionado à fila.`)
  }

  function removerDaFila(id) {
    setFila((fs) => fs.filter((f) => f.id !== id))
  }

  function limparFila() {
    setFila([])
  }

  // "Imprimir sequência": registra e imprime item por item, EM ORDEM, aguardando cada
  // `imprimir()` terminar antes do próximo (a impressora Bluetooth não aceita dois
  // envios ao mesmo tempo). Se um item falhar, PARA — não pula para o próximo escondendo
  // o erro — e avisa quantos já saíram e qual travou. Os que já imprimiram saem da fila a
  // cada sucesso, para não reimprimir se a pessoa tentar de novo depois de corrigir o que
  // travou; os que faltaram continuam lá. `pendentes` é um snapshot da fila no início:
  // itens adicionados enquanto a sequência já está rodando entram só na próxima rodada.
  async function imprimirSequencia() {
    if (imprimindoFila || fila.length === 0) return
    if (!conectado()) {
      notify('Conecte a impressora primeiro.', 'error')
      return
    }
    setImprimindoFila(true)
    const pendentes = fila
    let feitos = 0
    try {
      for (const item of pendentes) {
        try {
          const { canvas } = await registrarEDesenhar(item)
          await imprimir(canvas, { copias: item.copias })
          feitos += 1
          setFila((fs) => fs.filter((f) => f.id !== item.id))
        } catch (e) {
          const msg = e?.response?.data?.error || e?.message || 'Falha ao imprimir'
          notify(
            feitos > 0
              ? `${feitos} de ${pendentes.length} etiqueta(s) impressa(s) da sequência. Parou em "${item.nome}": ${msg}`
              : `Não foi possível imprimir "${item.nome}" — a sequência parou aqui: ${msg}`,
            'error',
          )
          return
        }
      }
      notify(`${feitos} etiqueta(s) da sequência impressa(s) com sucesso.`)
    } finally {
      setImprimindoFila(false)
    }
  }

  return (
    <div className="etqi-grid">
      {/* ESQUERDA: catálogo — busca, item manual, tabela com edição inline (preservada)
          e o botão "Usar" que carrega a linha no painel à direita. */}
      <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
        {/* Catálogo no TOPO da coluna, alinhado com o card da Impressora à direita: a busca
            fica no cabeçalho do próprio card, então o card começa na mesma altura da coluna
            da direita — sem o desalinhamento que a busca/‌item-manual soltos acima criavam. */}
        <div className="table-card etqi-cat">
          <div style={{ padding: 12, borderBottom: '1px solid var(--app-border)' }}>
            <input
              className="form-input"
              placeholder="Buscar item…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {loading ? (
            <div className="loading-state" style={{ padding: 24 }}>Carregando…</div>
          ) : itens.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>Nenhum item encontrado.</div>
          ) : (
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Conservação padrão</th>
                  <th>Validade própria</th>
                  <th>Vale na cozinha</th>
                  <th>Ativo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.insumoId} className={sel?.insumoId === it.insumoId ? 'is-sel' : undefined}>
                    <td style={{ fontWeight: 600 }}>{it.nome}</td>
                    <td>
                      <select
                        className="form-input"
                        style={{ minWidth: 170 }}
                        value={it.conservacaoPadrao || ''}
                        onChange={(e) => salvarItem(it, { conservacaoPadrao: e.target.value || null })}
                      >
                        <option value="">— escolher na hora —</option>
                        {cons.map((c) => <option key={c} value={c}>{CONS_LABEL[c] || c}</option>)}
                      </select>
                    </td>
                    <td>
                      {/* Input não-controlado: salva só no blur (mesmo padrão do ID do
                          coletor em PontoFacial.jsx), pra não disparar um PUT + reload
                          da lista a cada tecla digitada e sobrescrever o que a pessoa
                          está digitando. A `key` muda junto com o valor do servidor pra
                          forçar o React a remontar o campo com o defaultValue atualizado
                          depois que carregar() resincroniza (sucesso ou falha). */}
                      <input
                        key={'dias-' + it.insumoId + '-' + (it.validadeDias ?? 'x')}
                        className="form-input"
                        type="number"
                        min={1}
                        max={3650}
                        style={{ width: 90 }}
                        placeholder="usa a regra"
                        defaultValue={it.validadeDias ?? ''}
                        onBlur={(e) => {
                          const bruto = e.target.value.trim()
                          const validadeDias = bruto === '' ? null : parseInt(bruto, 10)
                          if (validadeDias === (it.validadeDias ?? null)) return // sem mudança, evita PUT à toa
                          salvarItem(it, { validadeDias })
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      />
                    </td>
                    <td style={{ color: 'var(--app-text-soft, #888)' }}>
                      {it.validadeEfetiva ? `${it.validadeEfetiva} dia(s)` : '—'}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={it.ativo !== false}
                        onChange={(e) => salvarItem(it, { ativo: e.target.checked })}
                        title="Desligado, o item some da tela de impressão de etiquetas na cozinha"
                      />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => usarItem(it)}>Usar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Item manual abaixo do catálogo — ação secundária. */}
        <div className="table-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Adicionar item manual</div>
          <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 10 }}>
            Para etiquetar algo que ainda não está cadastrado como insumo.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              placeholder="Nome do item"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') usarManual() }}
            />
            <button type="button" className="btn btn-secondary" disabled={!novoNome.trim()} onClick={usarManual}>Usar</button>
          </div>
        </div>
      </div>

      {/* DIREITA: impressora + painel "Etiqueta selecionada" (campos + prévia ao vivo +
          Adicionar à fila/Imprimir agora) + card "Sequência de impressão" (Task 3),
          que registra e imprime a fila em ordem. */}
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <CardImpressora conn={conn} setConn={setConn} notify={notify} />

        <div className="table-card etqi-painel" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Etiqueta selecionada</h2>

          {!sel ? (
            <div className="empty-state">
              Escolha um item na lista (botão "Usar") ou adicione um item manual à esquerda.
            </div>
          ) : (
            <>
              <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
                Confira os campos e imprima — a validade e o lote finais são recalculados pelo servidor.
              </div>

              <div className="form-group">
                <label className="form-label">Item</label>
                {sel.insumoId ? (
                  <input className="form-input" value={sel.nome} disabled />
                ) : (
                  <input
                    className="form-input"
                    value={sel.nome}
                    onChange={(e) => updSel({ nome: e.target.value, nomeAvulso: e.target.value })}
                  />
                )}
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Conservação</label>
                  {/* Ao trocar a conservação, re-sugere a validade (dias) padrão daquela regra —
                      o operador ainda pode ajustar na mão depois. */}
                  <select className="form-input" value={sel.conservacao} onChange={(e) => {
                    const c = e.target.value
                    const diasRegra = regras.find((r) => r.conservacao === c)?.dias
                    updSel({ conservacao: c, ...(diasRegra ? { validadeDias: diasRegra } : {}) })
                  }}>
                    {cons.map((c) => <option key={c} value={c}>{CONS_LABEL[c] || c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Validade (dias)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={3650}
                    value={sel.validadeDias}
                    onChange={(e) => updSel({ validadeDias: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Manipulação / Abertura</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={sel.manipuladoEm}
                    onChange={(e) => updSel({ manipuladoEm: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cópias</label>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={50}
                    value={sel.copias}
                    onChange={(e) => updSel({ copias: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Responsável (quem manipulou)</label>
                <input
                  className="form-input"
                  placeholder="Nome de quem manipulou"
                  value={sel.responsavelNome}
                  onChange={(e) => updSel({ responsavelNome: e.target.value })}
                />
              </div>

              <div className="etq-previa etqi-previa">
                {config ? <canvas ref={previaRef} /> : <div className="loading-state">Carregando prévia…</div>}
              </div>
              <div className="page-header-sub" style={{ marginTop: 8, textAlign: 'center' }}>
                Lote de exemplo (—) — o código real sai ao imprimir.
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={selInvalido}
                  onClick={adicionarFila}
                >
                  Adicionar à fila
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={imprimindo || selInvalido}
                  onClick={imprimirAgora}
                >
                  {imprimindo ? 'Imprimindo…' : 'Imprimir agora'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sequência de impressão (Fatia B, Task 3) — fila de itens a registrar e
            imprimir em ordem, independente do que estiver carregado no painel acima. */}
        <div className="table-card etqi-fila" style={{ padding: 16 }}>
          <div className="etqi-fila-head">
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Sequência de impressão</h2>
            <span className="etqi-fila-count">{fila.length} {fila.length === 1 ? 'item' : 'itens'}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={imprimindoFila || fila.length === 0}
              onClick={limparFila}
            >
              Limpar
            </button>
          </div>

          {fila.length === 0 ? (
            <div className="empty-state">Nenhum item na fila. Adicione itens ao lado.</div>
          ) : (
            <div className="etqi-fila-list">
              {fila.map((f) => (
                <div key={f.id} className="etqi-fila-row">
                  <span className="etqi-fila-nome" title={f.nome}>{f.nome}</span>
                  <span className="etqi-fila-cons">{f.conservacaoLabel}</span>
                  <span className="etqi-fila-copias">{f.copias}×</span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={imprimindoFila}
                    onClick={() => removerDaFila(f.id)}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary etqi-fila-print"
            disabled={imprimindoFila || fila.length === 0}
            onClick={imprimirSequencia}
          >
            {imprimindoFila ? 'Imprimindo sequência…' : 'Imprimir sequência'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Data/hora curta COM ano — aba Histórico. O ano não é enfeite: o histórico é rastreabilidade
// sanitária e acumula para sempre (nada apaga etiqueta), então "15/07 14:00" fica ambíguo
// já no segundo ano de uso — exatamente numa tela cujo motivo de existir é provar quando
// um alimento foi manipulado. 2 dígitos bastam e cabem na coluna.
const dtAno = (v) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

// ===================== HISTÓRICO =====================
function AbaHistorico({ notify }) {
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  // Debounce de 250ms na busca — mesmo padrão da aba Itens.
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/etiquetas/historico', { params: busca ? { busca } : {} })
        .then((r) => setLista(r.data.etiquetas || []))
        .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar o histórico.', 'error'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  return (
    <div>
      <input
        className="form-input"
        style={{ maxWidth: 320, marginBottom: 12 }}
        placeholder="Buscar item ou lote…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state">Nenhuma etiqueta impressa ainda.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Lote</th>
                <th>Conservação</th>
                <th>Manipulado</th>
                <th>Validade</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.nomeItem}</td>
                  <td style={{ fontFamily: 'monospace' }}>{e.lote}</td>
                  <td>{CONS_LABEL[e.conservacao] || e.conservacao}</td>
                  <td>{dtAno(e.manipuladoEm)}</td>
                  <td>{dtAno(e.validoAte)}</td>
                  <td>{e.responsavelNome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
