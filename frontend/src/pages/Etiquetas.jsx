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
import { bluetoothDisponivel, conectar, conectado, imprimir, LARGURA_PX } from '../lib/niimbotB1'

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
  RESFRIADO_0_4: 'Resfriado (0 a 4 °C)',
  RESFRIADO_4_6: 'Resfriado (4 a 6 °C)',
  AMBIENTE: 'Ambiente (seco)',
  DESCONGELADO: 'Descongelado',
  ABERTO: 'Produto aberto',
}

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
      await imprimir(canvas, { copias: 1 })
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
                    min={10}
                    max={200}
                    style={{ marginTop: 8 }}
                    placeholder="Altura em mm"
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
            {regras.map((r) => (
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

// ===================== ITENS =====================
function AbaItens({ notify }) {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [cons, setCons] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div>
      <input
        className="form-input"
        style={{ maxWidth: 320, marginBottom: 12 }}
        placeholder="Buscar item…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : itens.length === 0 ? (
        <div className="empty-state">Nenhum item encontrado.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Conservação padrão</th>
                <th>Validade própria</th>
                <th>Vale na cozinha</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.insumoId}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
