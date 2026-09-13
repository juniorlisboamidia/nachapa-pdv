import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

// Loja Digital › Totem › Configurações — as opções do CANAL, uma linha por empresa.
//
// A primeira delas é o tempo de ociosidade. Ele era uma constante de 90 s no código do
// quiosque; agora é decisão da loja, porque o tempo certo depende da fila e do tamanho
// do cardápio — um lugar com fila na porta quer o totem livre rápido, um cardápio de
// noventa itens quer o cliente com tempo de ler.
//
// Duas coisas que esta tela NÃO faz, e é o que a mantém honesta:
//  1. Não tem régua própria. Os valores oferecidos, o mínimo, o máximo e o padrão vêm
//     do servidor (`opcoes`), que é quem valida. Uma lista escrita aqui passaria a
//     oferecer o que o servidor recusa no dia em que um limite mudasse lá.
//  2. Não inventa que a loja já escolheu. Enquanto ninguém salvar, `salva` vem `false`
//     e a tela diz "padrão do sistema" — 90 s por omissão não é o mesmo que 90 s por
//     decisão, e a diferença aparece quando um campo novo tiver outro padrão.
export default function TotemConfiguracoes() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [salva, setSalva] = useState(false)
  // O que está no servidor e o que está no select. Separados para o botão saber se há
  // algo a salvar — e para "Salvar" não reenviar o mesmo número.
  const [gravado, setGravado] = useState(null)
  const [escolha, setEscolha] = useState(null)
  const [opcoes, setOpcoes] = useState(null)

  // Não marca estado de forma síncrona: o efeito de montagem só AGENDA o trabalho, em
  // vez de disparar render em cascata.
  function buscar() {
    return api.get('/totem/configuracao')
      .then((r) => {
        const seg = r.data?.configuracao?.ociosidadeSegundos
        setGravado(seg)
        setEscolha(seg)
        setSalva(!!r.data?.salva)
        setOpcoes(r.data?.opcoes ?? null)
        setErro(null)
      })
      .catch(() => setErro('Não foi possível ler as configurações agora.'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => { buscar() }, [])

  function carregar() {
    setCarregando(true)
    buscar()
  }

  async function salvar() {
    if (salvando || escolha == null) return
    setSalvando(true)
    try {
      const r = await api.put('/totem/configuracao', { ociosidadeSegundos: escolha })
      // O servidor devolve o que REALMENTE gravou (ele grampeia fora da faixa). A tela
      // passa a mostrar esse número, não o que foi pedido.
      const seg = r.data?.configuracao?.ociosidadeSegundos ?? escolha
      setGravado(seg)
      setEscolha(seg)
      setSalva(true)
      // A semântica exata (T8): o valor é CAPTURADO quando uma sessão começa. Um cliente
      // no meio do pedido termina com o tempo que valia quando ele começou — trocar isso
      // encurtaria o relógio de quem já estava escolhendo.
      setToast({ message: 'Configuração salva. Será usada nas próximas sessões do totem.', type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível salvar. Tente de novo.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }

  const sugeridos = opcoes?.ociosidadeSugerida ?? []
  const padrao = opcoes?.ociosidadePadrao ?? null
  // Um valor gravado fora da lista (vindo de outro caminho) não pode sumir do select e
  // virar outro número sem ninguém pedir.
  const valores = gravado != null && !sugeridos.includes(gravado)
    ? [...sugeridos, gravado].sort((a, b) => a - b)
    : sugeridos
  const mudou = escolha != null && escolha !== gravado

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Configurações do totem</h1>
          <div className="page-header-sub">
            O que vale para o canal inteiro, em todos os totens desta loja.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : erro ? (
        <div className="empty-state">
          <div style={{ marginBottom: 12 }}>{erro}</div>
          <button type="button" className="btn btn-primary" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : (
        <div className="table-card table-card-form" style={{ padding: 16 }}>
          <div className="form-group" style={{ maxWidth: 420 }}>
            <label className="form-label" htmlFor="tcf-ocio">Tempo de ociosidade</label>
            <select
              id="tcf-ocio"
              className="form-input"
              value={escolha ?? ''}
              onChange={(e) => setEscolha(Number(e.target.value))}
              disabled={salvando}
            >
              {valores.map((v) => (
                <option key={v} value={v}>
                  {rotulo(v)}{v === padrao ? ' — padrão' : ''}
                </option>
              ))}
            </select>
            {/* A frase existe por causa de um engano previsível: quem lê "30 s" pensa no
                tempo até o AVISO, escolhe o menor valor e depois reclama que o totem
                reinicia rápido demais. O número é o tempo TOTAL. */}
            <div className="ttm-nota">
              É o tempo <strong>total</strong> sem ninguém tocar até o totem apagar o pedido e voltar à tela de espera.
              O aviso <strong>“Ainda está aí?”</strong> aparece nos <strong>15 segundos finais</strong> desse tempo.
            </div>
            {!salva && (
              <div className="ttm-dica">
                Ainda no padrão do sistema. Enquanto ninguém salvar, os totens usam {rotulo(padrao ?? 90)}.
              </div>
            )}
          </div>

          {/* Nenhum totem é interrompido no meio de um pedido: o valor novo entra quando
              o tablet recarrega o cardápio, e é isso que a mensagem de sucesso diz. */}
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}

// "90 segundos", "2 minutos", "2 min 30 s" — minuto redondo é como as pessoas pensam em
// espera longa, e segundo é como pensam em espera curta.
function rotulo(seg) {
  const n = Number(seg)
  if (!Number.isFinite(n)) return '—'
  if (n < 120) return `${n} segundos`
  const min = Math.floor(n / 60)
  const resto = n % 60
  return resto ? `${min} min ${resto} s` : `${min} minutos`
}
