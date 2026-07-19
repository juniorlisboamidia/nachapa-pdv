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
import { bluetoothDisponivel, conectar, conectado, imprimir, escanearDiagnostico } from '../lib/niimbotB1'

const CONS_LABEL = {
  CONGELADO: 'Congelado', RESFRIADO_0_4: 'Resfriado', RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente', DESCONGELADO: 'Descongelado', ABERTO: 'Aberto',
}

const erroDa = (e, fallback) => e?.response?.data?.error || e?.message || fallback

const S = {
  aviso: { background: '#fee', border: '1px solid #fcc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 },
  // Amarelo, não vermelho: nada quebrou, é a tela contando o que fez com a pendência.
  nota: { background: '#fffbe6', border: '1px solid #f0dd8a', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 },
  rotulo: { fontSize: 12, fontWeight: 700, letterSpacing: '.04em' },
  opcao: (on) => ({
    padding: 12, borderRadius: 8, border: on ? '2px solid #eab802' : '1px solid #ddd',
    background: '#fff', textAlign: 'left', fontSize: 15, width: '100%',
  }),
  botao: (forte) => ({
    padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    border: forte ? 'none' : '1px solid #ddd', background: forte ? '#0e1319' : '#fff',
    color: forte ? '#eab802' : '#0e1319',
  }),
  // Overlay do guia: SEM onClick de fechar aqui — regra do projeto é fechar só por
  // botão. O card para de propagar o clique (stopPropagation) por segurança, mas o
  // overlay em si nunca fecha o modal.
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(14,19,25,.65)', zIndex: 50,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: 16, overflowY: 'auto',
  },
  modal: {
    background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 440,
    margin: 'auto 0', boxShadow: '0 10px 30px rgba(0,0,0,.25)',
  },
  fechar: {
    border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1,
    padding: 4, color: '#6b6f75',
  },
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
  // Guia "Conectar a impressora": modal de passo a passo. `conectandoGuia` é só o
  // spinner do botão do Passo 3, separado de `imprimindo` (são gestos diferentes).
  const [verGuia, setVerGuia] = useState(false)
  const [conectandoGuia, setConectandoGuia] = useState(false)
  const [diag, setDiag] = useState('') // resultado do diagnóstico (lista todos os BT)
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
  // "← trocar item" com pendência aberta pede confirmação em vez de descartar calado.
  const [confirmandoVoltar, setConfirmandoVoltar] = useState(false)
  // Aviso neutro (não é erro): a tela contando que a pendência deixou de valer.
  const [aviso, setAviso] = useState('')
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
    setConfirmandoVoltar(false)
    setAviso('')
    setErro('')
  }

  // Descartar a pendência NÃO apaga o registro: o lote já está no banco. O alimento
  // continua precisando de etiqueta, então o cozinheiro registra de novo e sobram 2
  // registros para 1 manipulação — exatamente o que a pendência existe para evitar.
  // Por isso "← trocar item" confirma antes: o primeiro toque avisa, o segundo descarta.
  function voltar() {
    if (pendente && !confirmandoVoltar) { setConfirmandoVoltar(true); return }
    setItem(null)
    setConservacao('')
    setPendente(null)
    setConfirmandoVoltar(false)
    setAviso('')
    setErro('')
  }

  // Trocar conservação ou responsável muda o CONTEÚDO do rótulo, então a etiqueta já
  // registrada deixa de valer: reimprimi-la colaria no pote um papel que a tela não
  // mostra mais (era o bug — prévia RESFRIADO +5d, papel CONGELADO +90d do lote velho).
  //
  // Invalidamos em vez de travar os seletores enquanto há pendência: travar prenderia o
  // cozinheiro num rótulo que ele JÁ SABE estar errado, e a única saída seria o
  // "← trocar item" — mesmo descarte, com mais passos e mais chance de errar.
  //
  // O que acontece com o lote abandonado: ele fica no histórico como qualquer outra
  // etiqueta. EtiquetaImpressa não tem campo de impressão/status, então NÃO dá para
  // distinguir no relatório o lote que nunca virou papel de um que foi colado no pote —
  // marcá-lo exigiria uma coluna nova, que ficou para depois. O custo aceito aqui é um
  // registro a mais no histórico (a manipulação aconteceu de verdade; o que não houve foi
  // a impressão), e não uma etiqueta errada colada em alimento — que é o que o descarte
  // evita. `erro` NÃO é limpo aqui: se a impressora caiu, ela continua caída e o botão
  // "Reconectar" ainda é o que ele precisa.
  function invalidarPendente() {
    if (!pendente) return
    setPendente(null)
    setConfirmandoVoltar(false)
    setAviso(`A etiqueta ${pendente.lote} foi registrada e não chegou a ser impressa. Como o rótulo mudou, ela não será reimpressa: a próxima impressão registra uma nova.`)
  }

  function mudarConservacao(c) {
    if (c !== conservacao) invalidarPendente()
    setConservacao(c)
  }

  function mudarResponsavel(id) {
    if (id !== responsavelId) invalidarPendente()
    setResponsavelId(id)
  }

  // Retorna true/false além de setar impressora/erro: o guia (Passo 3) precisa saber
  // se deu certo para se fechar sozinho, sem duplicar a leitura de estado.
  async function conectarImpressora() {
    setErro('')
    try {
      const { nome } = await conectar()
      setImpressora(nome)
      return true
    } catch (e) {
      setImpressora('')
      setErro(erroDa(e, 'Não foi possível conectar na impressora.'))
      return false
    }
  }

  // Chamado pelo botão do Passo 3 do guia — é ELE o gesto do usuário que o Web
  // Bluetooth exige, então não pode haver nenhum await antes de conectar() dentro de
  // conectarImpressora(). Sucesso fecha o guia; falha deixa o erro visível nele mesmo
  // (reusa `erro`/erroDa, que conectarImpressora já preenche).
  async function tentarConectarNoGuia() {
    setConectandoGuia(true)
    const ok = await conectarImpressora()
    setConectandoGuia(false)
    if (ok) setVerGuia(false)
  }

  // Diagnóstico (temporário): abre o seletor SEM filtro (todos os Bluetooth próximos), pra
  // descobrir por que a B1 não aparece neste aparelho. É gesto de usuário (botão), então
  // chama escanearDiagnostico direto, sem await antes.
  async function rodarDiagnostico() {
    setDiag('Abrindo o seletor… veja se a impressora aparece na lista e escolha-a.')
    try {
      const r = await escanearDiagnostico()
      setDiag(`Escolhido → nome: "${r.nome}" · id: ${r.id}. Me mande este texto.`)
    } catch (e) {
      setDiag(
        e?.name === 'NotFoundError'
          ? 'Nenhum aparelho escolhido. Se a lista veio VAZIA, este tablet não está enxergando NENHUM Bluetooth pelo navegador — me avise.'
          : `Erro: ${e?.message || e}`,
      )
    }
  }

  // Desenha no canvas SEMPRE a partir do que o servidor devolveu (datas, lote e
  // tempLabel): é o registro do banco que vira papel. O modelo/fonte vêm da config
  // da loja (dados.config) — se ela escolher "Faixa lateral + QR", o quiosque imprime
  // o QR (gerado offline a partir dos próprios dados, ver etiquetaCanvas.js).
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
    setAviso('')
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
      setConfirmandoVoltar(false)
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
        <button type="button" onClick={() => setVerGuia(true)} disabled={semBt}
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
            <button type="button" onClick={() => setVerGuia(true)}
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

      {aviso && <div style={S.nota}>{aviso}</div>}

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

          {/* Confirmação na própria tela, sem modal: o quiosque é standalone e não
              carrega os componentes do admin. */}
          {confirmandoVoltar && (
            <div style={S.nota}>
              <div>
                A etiqueta <strong>{pendente?.lote}</strong> já foi <strong>registrada</strong> e ainda
                não foi impressa. Se trocar de item agora ela não sai no papel, e para etiquetar
                este alimento você vai ter que registrar outra.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setConfirmandoVoltar(false)} style={S.botao(true)}>
                  Continuar aqui
                </button>
                <button type="button" onClick={voltar} style={S.botao(false)}>
                  Descartar e trocar item
                </button>
              </div>
            </div>
          )}

          <label style={S.rotulo}>CONSERVAÇÃO</label>
          <div style={{ display: 'grid', gap: 6, margin: '6px 0 14px' }}>
            {dados.regras.map((r) => (
              <button key={r.conservacao} type="button" onClick={() => mudarConservacao(r.conservacao)}
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
              <button key={f.id} type="button" onClick={() => mudarResponsavel(f.id)}
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

      {verGuia && (
        <GuiaConexao
          semBt={semBt}
          erro={erro}
          impressora={impressora}
          conectando={conectandoGuia}
          onConectar={tentarConectarNoGuia}
          onDiagnostico={rodarDiagnostico}
          diag={diag}
          onFechar={() => setVerGuia(false)}
        />
      )}

      {/* Fora da tela, não `display:none`: é do MESMO canvas que sai o bitmap
          (canvas.toBlob dentro do imprimir), então ele precisa existir de verdade. */}
      <canvas ref={canvasRef} style={{ position: 'absolute', left: -9999, top: -9999 }} />
    </div>
  )
}

// Ícone de "power" (círculo aberto + traço vertical no centro) — símbolo universal
// de ligar, ilustra o Passo 1 do guia.
function IconePower() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#eab802" strokeWidth="2.3"
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 2v8" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  )
}

// Passo numerado do guia: círculo com o número + título em negrito + descrição menor.
// Puramente visual, reusa a paleta creme/dourado da própria página do quiosque.
function PassoGuia({ n, titulo, cor, icone, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: cor || '#0e1319', color: cor ? '#fff' : '#eab802',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13,
      }}>
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <strong style={{ fontSize: 14 }}>{titulo}</strong>
          {icone}
        </div>
        <div style={{ fontSize: 13, color: '#6b6f75', lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  )
}

// Modal "Conectar a impressora": passo a passo do quiosque. Fecha SÓ pelo X ou pelo
// botão "Fechar" — o overlay não tem onClick de fechar (regra do projeto: modal nunca
// fecha clicando fora), e o card para a propagação do clique por segurança.
function GuiaConexao({ semBt, erro, impressora, conectando, onConectar, onDiagnostico, diag, onFechar }) {
  return (
    <div style={S.overlay}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Conectar a impressora</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={S.fechar}>✕</button>
        </div>

        <PassoGuia n={1} titulo="Ligue a impressora Niimbot" icone={<IconePower />}>
          Segure o botão de ligar por <strong>3 segundos</strong> e solte. A luz deve acender e ficar <strong>azul</strong>.
        </PassoGuia>

        <PassoGuia n={2} titulo="Ligue o Bluetooth e a Localização do tablet">
          No Android, o navegador só encontra a impressora por Bluetooth se a <strong>Localização</strong> também
          estiver <strong>ligada</strong>. Verifique também que a impressora não está conectada em outro app — se
          você abriu o app da Niimbot, <strong>feche-o</strong>: a impressora aceita <strong>uma conexão por vez</strong>.
        </PassoGuia>

        <PassoGuia n={3} titulo='Toque em "Conectar impressora" abaixo'>
          Vai abrir a lista de aparelhos Bluetooth. Escolha o que começa com <strong>“B1”</strong> e aguarde a confirmação.
          {semBt ? (
            <div style={{ ...S.aviso, marginTop: 10, marginBottom: 0 }}>
              Este navegador não imprime por Bluetooth. Use o <strong>Chrome no Android</strong> — iPhone não tem suporte.
            </div>
          ) : (
            <>
              <button type="button" onClick={onConectar} disabled={conectando}
                style={{ ...S.botao(true), width: '100%', marginTop: 10, padding: 14, fontSize: 15, opacity: conectando ? 0.6 : 1 }}>
                {conectando ? 'Conectando…' : impressora ? `🖨 ${impressora}` : 'Conectar impressora'}
              </button>
              {erro && <div style={{ ...S.aviso, marginTop: 10, marginBottom: 0 }}>{erro}</div>}
            </>
          )}
        </PassoGuia>

        <PassoGuia n={4} titulo="Pronto!" cor="#16a34a">
          Agora é só escolher o <strong>produto</strong>, a <strong>conservação</strong>, o <strong>responsável</strong>{' '}
          e quantas <strong>cópias</strong> quer imprimir.
        </PassoGuia>

        {/* Diagnóstico: lista TODOS os Bluetooth próximos (sem filtro). Só aparece se houver
            Bluetooth no navegador. Use quando a impressora não aparece no Passo 3. */}
        {!semBt && (
          <div style={{ borderTop: '1px solid #e7dcc2', marginTop: 4, paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6b6f75', marginBottom: 8 }}>
              A impressora não aparece na lista? Toque abaixo para ver <strong>todos</strong> os aparelhos Bluetooth
              próximos e conferir se a B1 aparece (e com que nome).
            </div>
            <button type="button" onClick={onDiagnostico}
              style={{ ...S.botao(false), width: '100%', fontSize: 13 }}>
              🔍 Diagnóstico: ver todos os Bluetooth
            </button>
            {diag && (
              <div style={{ ...S.aviso, marginTop: 8, marginBottom: 0, fontSize: 12.5, wordBreak: 'break-word' }}>{diag}</div>
            )}
          </div>
        )}

        <button type="button" onClick={onFechar} style={{ ...S.botao(false), width: '100%', marginTop: 10 }}>Fechar</button>
      </div>
    </div>
  )
}
