// /dispositivo — a ÚNICA porta de entrada do tablet (spec §5.7). PÚBLICA e standalone.
//
// Repare no que NÃO tem no endereço: nem token, nem id de loja, nem slug. O mesmo link
// serve todos os tablets de todas as lojas, e por isso ele não vale nada sozinho —
// quem conecta o aparelho é o código de 6 dígitos gerado na tela Aparelhos, digitado
// AQUI, no tablet. O que o servidor devolve em troca é um cookie HttpOnly que o
// JavaScript desta página nem consegue ler: daí para a frente, a identidade do aparelho
// (e a loja dele) nasce sempre do cookie, nunca de algo que esta tela mande.
//
// Fluxo: GET /eu → 200 monta o totem · 401 mostra o teclado do código.
import { useCallback, useEffect, useRef, useState } from 'react'
import { aparelhoApi } from '../services/api'
import { mensagemErro } from '../components/totemCarrinho'
import TotemQuiosque from './TotemQuiosque'
import Casca from '../components/totem/Casca'
import TelaAviso from '../components/totem/TelaAviso'
// A casca do quiosque vive em arquivo próprio, importado SÓ aqui: é esta página
// (e o que ela monta) que roda no tablet. O admin não carrega nada disto, e o
// prefixo `.tq-` não encosta no `.ttm-` das telas de escritório (spec §10.1).
import '../styles/totem.css'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const TAMANHO = 6
// As frases dos códigos do §7 moram em UM lugar só (totemCarrinho.js): duas cópias do mesmo
// texto viram duas frases diferentes na primeira vez que alguém melhorar uma delas.
const CODIGOS_CONHECIDOS = ['CODIGO_INVALIDO', 'MUITAS_TENTATIVAS']

export default function DispositivoPareamento() {
  const [estado, setEstado] = useState('carregando') // carregando | pareado | codigo
  const [sessao, setSessao] = useState(null)         // { aparelho, loja }
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null)
  const [falhaRede, setFalhaRede] = useState(false)
  // Espelho do código digitado. O estado é a verdade da TELA; esta ref é a verdade do
  // AUTO-ENVIO, que não pode depender de um `codigo` lido antes do último dígito entrar.
  const codigoRef = useRef('')
  // Um envio por código digitado: o 6º dígito e o Enter do teclado físico não podem virar
  // dois pareamentos (o código é de uso único — o segundo POST já falharia).
  const enviadoRef = useRef(false)

  // Quem sou eu? O cookie responde — ou não responde, e então é hora de digitar o código.
  const verificar = useCallback(() => {
    setEstado('carregando')
    setFalhaRede(false)
    aparelhoApi.get('/public/aparelho/eu')
      .then((r) => { setSessao(r.data); setEstado('pareado') })
      .catch((e) => {
        // 401 = não pareado (o caminho normal). Sem resposta = rede/servidor fora: não
        // adianta pedir código, então a tela diz o que é e oferece tentar de novo.
        if (!e?.response) setFalhaRede(true)
        setSessao(null)
        limparCodigo()
        setEstado('codigo')
      })
  }, [])

  useEffect(() => { verificar() }, [verificar])

  // Teclado físico (alguns tablets ficam com teclado bluetooth no balcão) tem de se comportar
  // igual ao teclado da tela: dígito entra, o 6º ENVIA sozinho, Backspace apaga e Enter envia
  // quando já há 6 dígitos. Por isso o handler chama `digitar`/`apagar` em vez de mexer no
  // estado por conta própria — um caminho só, um comportamento só.
  useEffect(() => {
    if (estado !== 'codigo' || enviando) return undefined
    const aoTeclar = (ev) => {
      if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); digitar(ev.key) }
      else if (ev.key === 'Backspace') { ev.preventDefault(); apagar() }
      else if (ev.key === 'Enter') { ev.preventDefault(); enviarSeCompleto() }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [estado, enviando, codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function parear(valor) {
    if (enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await aparelhoApi.post('/public/aparelho/parear', { codigo: valor })
      // O pareamento já gravou o cookie: releremos a identidade pelo /eu (é ele que o
      // resto da sessão usa) em vez de confiar no corpo desta resposta.
      limparCodigo()
      verificar()
    } catch (e) {
      const cod = e?.response?.data?.erro
      setErro(CODIGOS_CONHECIDOS.includes(cod)
        ? mensagemErro(cod)
        : (e?.response ? 'Não foi possível conectar este aparelho. Tente de novo.' : 'Sem conexão com o sistema. Verifique a rede do tablet.'))
      limparCodigo()
    } finally {
      setEnviando(false)
    }
  }

  // Um dígito entra SEMPRE por aqui (teclado da tela ou físico). O valor de partida é a REF,
  // não o `codigo` do render: dois toques no mesmo instante partiriam do mesmo estado velho e
  // o segundo apagaria o primeiro. A ref é atualizada aqui, fora de qualquer updater — o
  // updater do React tem de ser puro, porque ele pode ser reexecutado.
  // O auto-envio do 6º dígito não sai daqui: sai do efeito abaixo, que lê a ref.
  function digitar(d) {
    if (enviando || codigoRef.current.length >= TAMANHO) return
    setErro(null)
    const novo = (codigoRef.current + d).slice(0, TAMANHO)
    setCodigo(novo)
    codigoRef.current = novo
  }

  function apagar() {
    if (enviando) return
    setErro(null)
    enviadoRef.current = false
    const novo = codigoRef.current.slice(0, -1)
    setCodigo(novo)
    codigoRef.current = novo
  }

  function limparCodigo() {
    enviadoRef.current = false
    codigoRef.current = ''
    setCodigo('')
  }

  // 6 dígitos = envia sozinho: ninguém precisa procurar um botão depois de digitar. É o
  // ÚNICO caminho de envio automático — o Enter do teclado físico chama a mesma função, e
  // `enviadoRef` garante uma tentativa por código.
  function enviarSeCompleto() {
    if (enviando || enviadoRef.current || codigoRef.current.length !== TAMANHO) return
    enviadoRef.current = true
    parear(codigoRef.current)
  }

  useEffect(() => { enviarSeCompleto() }, [codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function desconectar() {
    try { await aparelhoApi.post('/public/aparelho/sair') } catch { /* o cookie pode já ter morrido */ }
    verificar()
  }

  if (estado === 'carregando') {
    return (
      <Casca>
        <div className="tq-centrado">
          <span className="tq-spinner" aria-hidden="true" />
          <div className="tq-carregando-txt">Verificando este aparelho…</div>
        </div>
      </Casca>
    )
  }

  if (estado === 'pareado' && sessao?.aparelho) {
    if (sessao.aparelho.tipo === 'TOTEM') {
      return <TotemQuiosque loja={sessao.loja} onNaoPareado={verificar} />
    }
    // TV_INDOOR: o aparelho está conectado, mas a tela dele é de outra fase.
    return (
      <Casca>
        <TelaAviso
          icone="pausa"
          titulo="Este aparelho é uma TV"
          texto={`“${sessao.aparelho.nome}” está conectado${sessao.loja?.nome ? ` à loja ${sessao.loja.nome}` : ''}, mas a tela da TV ainda não está disponível. Nada a fazer aqui por enquanto.`}
          acoes={<button type="button" className="tq-btn tq-btn-claro" onClick={desconectar}>Desconectar este aparelho</button>}
        />
      </Casca>
    )
  }

  return (
    <Casca>
      <div className="tq-pareamento">
        <div className="tq-pareamento-cabeca">
          <div className="tq-pareamento-rot tq-rotulo">Conectar aparelho</div>
          <h1 className="tq-pareamento-tit tq-disp tq-disp-forte">Digite o código de 6 dígitos</h1>
          <p className="tq-pareamento-sub">
            O código é gerado no PDV, em <strong>Ferramentas › Aparelhos › Parear</strong>, e vale por 10 minutos.
          </p>
        </div>

        <div className="tq-caixas" aria-label="Código de pareamento">
          {Array.from({ length: TAMANHO }).map((_, i) => (
            <div key={i} className={'tq-caixa tq-disp tq-disp-forte tq-num' + (codigo[i] ? ' cheia' : '') + (codigo.length === i && !enviando ? ' ativa' : '')}>
              {codigo[i] ?? ''}
            </div>
          ))}
        </div>

        {enviando && <div className="tq-pareamento-status"><span className="tq-spinner claro" aria-hidden="true" /> Conectando…</div>}
        {erro && !enviando && <div className="tq-pareamento-erro" role="alert">{erro}</div>}
        {falhaRede && !erro && !enviando && (
          <div className="tq-pareamento-erro" role="alert">Sem conexão com o sistema. Verifique a rede do tablet e tente de novo.</div>
        )}

        <div className="tq-teclado">
          {TECLAS.map((t) => (
            <button key={t} type="button" className="tq-tecla tq-disp tq-num" disabled={enviando} onClick={() => digitar(t)}>{t}</button>
          ))}
          <button type="button" className="tq-tecla vazia" disabled aria-hidden="true" tabIndex={-1} />
          <button type="button" className="tq-tecla tq-disp tq-num" disabled={enviando} onClick={() => digitar('0')}>0</button>
          <button
            type="button"
            className="tq-tecla apagar"
            disabled={enviando || codigo.length === 0}
            onClick={apagar}
          >
            Apagar
          </button>
        </div>

        <button type="button" className="tq-link" onClick={verificar} disabled={enviando}>Já conectei este aparelho</button>
      </div>
    </Casca>
  )
}
