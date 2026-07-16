// Quiosque da cozinha (PÚBLICO, sem login — entra pelo token do Dispositivo).
// Standalone de propósito: roda fora do Layout, num tablet fixo na parede, sem
// sidebar e sem sessão. Alvos grandes e poucas telas: quem usa está de mão ocupada.
//
// A validade que aparece aqui é PRÉVIA. Quem decide a data que vai colada no
// alimento é o servidor (validadeDe, no /registrar) — a etiqueta é desenhada com o
// que ele devolveu, nunca com a conta da tela.
import { useRef, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { desenharEtiqueta } from '../lib/etiquetaCanvas'
import { bluetoothDisponivel, conectar, conectado, imprimir } from '../lib/niimbotB1'

const CONS_LABEL = {
  CONGELADO: 'Congelado', RESFRIADO_0_4: 'Resfriado', RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente', DESCONGELADO: 'Descongelado', ABERTO: 'Aberto',
}

const erroDa = (e, fallback) => e?.response?.data?.error || e?.message || fallback

const S = {
  aviso: { background: '#fee', border: '1px solid #fcc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 },
  rotulo: { fontSize: 12, fontWeight: 700, letterSpacing: '.04em' },
  opcao: (on) => ({
    padding: 12, borderRadius: 8, border: on ? '2px solid #eab802' : '1px solid #ddd',
    background: '#fff', textAlign: 'left', fontSize: 15, width: '100%',
  }),
}

export default function EtiquetasQuiosque() {
  const { token } = useParams()
  const [dados, setDados] = useState(null)
  const [erroBoot, setErroBoot] = useState('')
  const [erro, setErro] = useState('')
  const [item, setItem] = useState(null)
  const [conservacao, setConservacao] = useState('')
  const [responsavelId, setResponsavelId] = useState(null)
  const [busca, setBusca] = useState('')
  const [impressora, setImpressora] = useState('')
  const [imprimindo, setImprimindo] = useState(false)
  // Relógio que ancora a PRÉVIA da validade. Fica em estado e só avança dentro de um
  // efeito porque render tem que ser puro: lendo Date.now() no corpo do componente a
  // data mudava a cada re-render (react-hooks/purity reprova, e com razão). O tablet
  // do quiosque fica ligado o turno inteiro parado nesta tela, então o tique também
  // evita que a prévia envelheça na parede. Quem vale mesmo é a data que o servidor
  // devolve no /registrar — isto aqui é só o que a cozinha lê antes de confirmar.
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  // Etiqueta JÁ registrada no banco cuja impressão falhou. Existe para o retry do
  // usuário reimprimir o MESMO lote em vez de registrar outro: o registro é o
  // rastro sanitário da manipulação, e uma 2a chamada ao /registrar criaria uma
  // etiqueta fantasma no relatório para um alimento que só foi manipulado uma vez.
  const [pendente, setPendente] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    api.get(`/public/etiquetas/${token}/bootstrap`)
      .then((r) => setDados(r.data))
      .catch((e) => setErroBoot(erroDa(e, 'Dispositivo não autorizado.')))
  }, [token])

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Sem Bluetooth o fluxo inteiro é inútil: avisar no boot, não no clique.
  const semBt = !bluetoothDisponivel()

  const regra = dados?.regras?.find((r) => r.conservacao === conservacao) || null
  // Espelha a precedência do validadeDe do servidor: a validade do item só vence a
  // da regra quando é > 0 (0/negativo faria a etiqueta nascer vencida). Sem o `> 0`
  // a prévia mostraria uma data que o servidor não usaria.
  const dias = (item?.validadeDias > 0 ? item.validadeDias : null) ?? regra?.dias ?? null
  const validoAte = dias ? new Date(agoraMs + dias * 86400000) : null

  function escolher(it) {
    setItem(it)
    setConservacao(it.conservacaoPadrao || '')
    setPendente(null)
    setErro('')
  }

  function voltar() {
    setItem(null)
    setConservacao('')
    setPendente(null)
    setErro('')
  }

  async function conectarImpressora() {
    setErro('')
    try {
      const { nome } = await conectar()
      setImpressora(nome)
    } catch (e) {
      setImpressora('')
      setErro(erroDa(e, 'Não foi possível conectar na impressora.'))
    }
  }

  // Desenha no canvas SEMPRE a partir do que o servidor devolveu (datas, lote e
  // tempLabel): é o registro do banco que vira papel.
  // Sem QR: nada carrega `qrImg` nesta tela, e o desenhista só desenha o QR se a
  // imagem chegar pronta — ver o comentário da assinatura em etiquetaCanvas.js.
  function desenhar(e) {
    desenharEtiqueta(canvasRef.current, {
      nomeItem: e.nomeItem, conservacaoLabel: CONS_LABEL[e.conservacao] || e.conservacao,
      tempLabel: e.tempLabel, manipuladoEm: new Date(e.manipuladoEm),
      validoAte: new Date(e.validoAte), responsavelNome: e.responsavelNome, lote: e.lote,
    }, dados.config)
  }

  async function imprimirEtiqueta() {
    if (!item || !conservacao || !responsavelId) return
    // Checado ANTES de registrar: sem impressora, registrar criaria um rastro de uma
    // etiqueta que nunca existiu no pote.
    if (!conectado()) {
      setErro('Conecte a impressora antes de imprimir.')
      return
    }
    setImprimindo(true)
    setErro('')
    try {
      // `pendente` = já registrada e só falta sair no papel: reimprime o mesmo lote.
      let etiqueta = pendente
      if (!etiqueta) {
        const r = await api.post(`/public/etiquetas/${token}/registrar`, {
          insumoId: item.avulso ? null : item.insumoId,
          nomeAvulso: item.avulso ? item.nome : null,
          conservacao, responsavelId, quantidade: 1,
        })
        etiqueta = r.data.etiqueta
      }
      desenhar(etiqueta)
      try {
        await imprimir(canvasRef.current, { copias: 1 })
      } catch (e) {
        // NÃO tentamos imprimir de novo sozinhos. Depois de uma queda do link,
        // conectado() continua dizendo "true" (a lib só zera no disconnect explícito),
        // e o imprimir() seguinte cairia no connect() da lib, que tenta reabrir o
        // seletor de dispositivos FORA de um gesto do usuário — o Chrome recusa com um
        // erro críptico e o cozinheiro fica sem saber o que houve. Ver o aviso em
        // conectado(), em niimbotB1.js. A saída é o toque no "Reconectar" abaixo:
        // o toque É o gesto que o navegador exige.
        setPendente(etiqueta) // guarda o lote já registrado para o reenvio
        throw e
      }
      setPendente(null)
      setItem(null)
      setConservacao('')
    } catch (e) {
      setErro(erroDa(e, 'Não foi possível imprimir a etiqueta.'))
    } finally {
      setImprimindo(false)
    }
  }

  if (erroBoot) return <div style={{ padding: 24, textAlign: 'center' }}>{erroBoot}</div>
  if (!dados) return <div style={{ padding: 24, textAlign: 'center' }}>Carregando…</div>

  const itens = dados.itens.filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()))
  const podeImprimir = conservacao && responsavelId && !imprimindo

  return (
    <div style={{ minHeight: '100dvh', background: '#f4f1ea', padding: 16, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif', color: '#0e1319' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <strong style={{ fontSize: 15 }}>{dados.loja.nome}</strong>
          <div style={{ fontSize: 11, color: '#6b6f75' }}>{dados.dispositivo.nome}</div>
        </div>
        <button type="button" onClick={conectarImpressora} disabled={semBt}
          style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', opacity: semBt ? 0.5 : 1 }}>
          {impressora ? `🖨 ${impressora}` : 'Conectar impressora'}
        </button>
      </header>

      {semBt && (
        <div style={S.aviso}>
          Este navegador não imprime por Bluetooth. Use o <strong>Chrome no Android</strong> — iPhone não tem suporte.
        </div>
      )}

      {erro && (
        <div style={S.aviso}>
          <div>{erro}</div>
          {/* Reconectar é SEMPRE manual: o toque é o gesto do usuário que o Chrome
              exige para reabrir o seletor de dispositivos. */}
          {!semBt && (
            <button type="button" onClick={conectarImpressora}
              style={{ marginTop: 8, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, border: '1px solid #c66', background: '#fff' }}>
              Reconectar impressora
            </button>
          )}
          {pendente && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b6f75' }}>
              A etiqueta <strong>{pendente.lote}</strong> já foi registrada. Reconecte e toque em
              {' '}<strong>Imprimir novamente</strong> — ela sai com o mesmo lote, sem duplicar o registro.
            </div>
          )}
        </div>
      )}

      {!item ? (
        <>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…"
            style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd', marginBottom: 12, fontSize: 16 }} />
          <div style={{ display: 'grid', gap: 8 }}>
            {itens.map((i) => (
              <button key={i.insumoId} type="button" onClick={() => escolher(i)}
                style={{ padding: 14, borderRadius: 10, border: '1px solid #ddd', background: '#fff', textAlign: 'left', fontSize: 15, fontWeight: 600 }}>
                {i.nome}
              </button>
            ))}
            {busca && (
              <button type="button" onClick={() => escolher({ nome: busca, avulso: true, conservacaoPadrao: null, validadeDias: null })}
                style={{ padding: 14, borderRadius: 10, border: '1px dashed #bbb', background: 'transparent', textAlign: 'left', fontSize: 14 }}>
                Etiquetar “{busca}” como item avulso
              </button>
            )}
          </div>
        </>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
          <button type="button" onClick={voltar} style={{ fontSize: 13, marginBottom: 10, border: 'none', background: 'none', padding: 0 }}>← trocar item</button>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{item.nome}</h2>

          <label style={S.rotulo}>CONSERVAÇÃO</label>
          <div style={{ display: 'grid', gap: 6, margin: '6px 0 14px' }}>
            {dados.regras.map((r) => (
              <button key={r.conservacao} type="button" onClick={() => setConservacao(r.conservacao)}
                style={S.opcao(conservacao === r.conservacao)}>
                {CONS_LABEL[r.conservacao] || r.conservacao} · {r.tempLabel}
              </button>
            ))}
          </div>

          {validoAte && (
            <p style={{ fontSize: 14, marginBottom: 14 }}>
              Vence em <strong>{validoAte.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong>{' '}
              ({dias} dia{dias > 1 ? 's' : ''})
            </p>
          )}

          <label style={S.rotulo}>QUEM MANIPULOU</label>
          <div style={{ display: 'grid', gap: 6, margin: '6px 0 16px' }}>
            {dados.funcionarios.map((f) => (
              <button key={f.id} type="button" onClick={() => setResponsavelId(f.id)}
                style={S.opcao(responsavelId === f.id)}>
                {f.nome} {f.presente && <span style={{ fontSize: 11, color: '#0a0' }}>· no turno</span>}
              </button>
            ))}
          </div>

          <button type="button" disabled={!podeImprimir} onClick={imprimirEtiqueta}
            style={{ width: '100%', padding: 16, borderRadius: 10, border: 'none', background: '#0e1319', color: '#eab802', fontSize: 16, fontWeight: 800, opacity: podeImprimir ? 1 : 0.5 }}>
            {imprimindo ? 'Imprimindo…' : pendente ? 'Imprimir novamente' : 'Imprimir etiqueta'}
          </button>
        </div>
      )}

      {/* Fora da tela, não `display:none`: é do MESMO canvas que sai o bitmap
          (canvas.toBlob dentro do imprimir), então ele precisa existir de verdade. */}
      <canvas ref={canvasRef} style={{ position: 'absolute', left: -9999, top: -9999 }} />
    </div>
  )
}
