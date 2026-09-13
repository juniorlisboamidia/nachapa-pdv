import { useEffect, useMemo, useState } from 'react'
import {
  desvioDoRelogio, paraExibir, duracaoMs, proximoIndice, assinatura, proximaParaPrecarregar,
} from '../totemBanners'

// O rodízio de artes, compartilhado pelos DOIS lugares onde ele acontece: a tela de espera
// (tela inteira, totem parado) e a capa do catálogo (faixa no topo, cliente escolhendo).
//
// A mecânica é a mesma e por isso mora num lugar só — o que muda entre os dois é o `tipo`
// e o desenho em volta. Duas cópias desta lógica divergiriam no primeiro ajuste de timing.
//
// ── O RELÓGIO DO APARELHO NÃO É CONFIÁVEL ─────────────────────────────────────────────
// Tablet Android sem rede erra a hora, às vezes por horas. O bootstrap traz
// `agoraServidor`; daqui sai o desvio, e a elegibilidade usa o tempo corrigido. É o que
// faz uma arte agendada para as 18:00 entrar às 18:00 em vez de esperar o próximo
// bootstrap, que pode estar a quatro minutos de distância.
//
// ── NENHUM TIMER DAQUI TEM A VER COM SESSÃO ───────────────────────────────────────────
// Ociosidade, MS_AMBIGUO e o relógio capturado da sessão são outro domínio. Isto aqui só
// gira imagem.
export default function useCarrossel({ itens, agoraServidor, tipo = 'ESPERA' } = {}) {
  // Arte que não abriu fica de fora até o componente ser remontado. Não é estado de fluxo:
  // é "esta imagem quebrou", da mesma natureza do que o componente Foto já guarda.
  const [falhados, setFalhados] = useState(() => new Set())
  const [indice, setIndice] = useState(0)
  // O tempo CORRIGIDO pelo desvio do servidor. Um segundo de granularidade basta para uma
  // agenda.
  const [agoraMs, setAgoraMs] = useState(() => Date.now())

  const lista = useMemo(
    () => paraExibir({ itens, agoraMs, falhados, tipo }),
    [itens, agoraMs, falhados, tipo],
  )

  // A ASSINATURA é o que impede a arte de piscar a cada 5 minutos. O bootstrap se refaz
  // sozinho; se o índice zerasse a cada resposta igual, o cliente veria a primeira imagem
  // voltar sem parar. Só uma mudança real — arte nova, versão nova, duração nova —
  // reinicia o rodízio.
  const chave = assinatura(lista)
  useEffect(() => { setIndice(0) }, [chave]) // eslint-disable-line react-hooks/set-state-in-effect

  // O relógio da agenda. Só existe enquanto houver arte COM janela: sem agenda não há o que
  // reavaliar, e um intervalo eterno numa tela que fica horas ligada é trabalho à toa.
  //
  // O desvio é medido AQUI DENTRO, e não em render: `Date.now()` durante o render é chamada
  // impura, e ler uma ref em render também é proibido. Quem escreve o tempo é o
  // temporizador, que é o único lugar onde ler o relógio é legítimo. Consequência aceita:
  // com o tablet fora de hora, a primeira avaliação usa o relógio local e a correção entra
  // um segundo depois.
  const temAgenda = (itens ?? []).some((b) => b?.inicioEm || b?.fimEm)
  useEffect(() => {
    if (!temAgenda) return undefined
    const desvio = desvioDoRelogio(agoraServidor, Date.now())
    const iv = setInterval(() => setAgoraMs(Date.now() + desvio), 1000)
    return () => clearInterval(iv)
  }, [temAgenda, agoraServidor])

  // A rotação. Um `setTimeout` por vez, com a duração DAQUELA arte — não um intervalo
  // fixo, senão a duração por item não significaria nada.
  const total = lista.length
  const atual = lista[Math.min(indice, Math.max(0, total - 1))] ?? null
  useEffect(() => {
    if (total < 2 || !atual) return undefined
    const t = setTimeout(() => setIndice((i) => proximoIndice(i, total)), duracaoMs(atual))
    return () => clearTimeout(t)
  }, [atual, total])

  // Pré-carrega SÓ a próxima: o que importa é que a troca não mostre um quadro vazio, e o
  // tablet não tem memória para a lista inteira.
  const proxima = proximaParaPrecarregar(lista, indice)
  useEffect(() => {
    if (!proxima) return
    const img = new Image()
    img.src = proxima
  }, [proxima])

  const marcarFalha = (id) => setFalhados((s) => (s.has(id) ? s : new Set(s).add(id)))

  return { atual, total, indice, lista, marcarFalha }
}
