// A POSIÇÃO FÍSICA de uma TV: como ela está na parede, e se a imagem está saindo em pé.
//
// ── POR QUE ISTO É UMA CONVERSA, E NÃO UM CAMPO ───────────────────────────────────────
// Uma TV pendurada em pé costuma continuar recebendo a imagem deitada: a box não sabe que
// o painel foi girado. Não existe API que conte ao sistema como a TV está na parede, nem
// para que LADO ela foi virada.
//
// Uma coisa o sistema NÃO adivinha: o formato do que chega. A TV mede a própria janela e
// reporta no heartbeat, e o servidor devolve isso em `tela.saida` — é o que separa "falta
// um quarto de volta" de "não falta nada" (há boxes que giram a saída sozinhas). Quem mede
// é o SERVIDOR: duas réguas para a mesma medida é como a parede e a gestão discordam.
//
// O resto continua sendo conversa. O gestor DECLARA a orientação, o sistema aplica o palpite
// mais provável, e a confirmação é feita do único jeito confiável: olhando para a parede.
// "Está errado" avança para a próxima posição provável; em no máximo três toques qualquer
// combinação de TV, box e suporte fica certa.
//
// ── A JANELA DE AJUSTE ────────────────────────────────────────────────────────────────
// A TV consulta o servidor uma vez por minuto. Com este modal aberto ela passa a consultar
// a cada 5 s, para o "girar" aparecer na parede enquanto o gestor ainda está olhando. O
// modal abre a janela ao nascer e a fecha ao sair.
import { useEffect, useState } from 'react'
import api from '../../services/api'

/* A primeira frase, antes de qualquer giro. Quando a TV já reporta que recebe a imagem na
   posição declarada, o sistema não gira nada — e dizer isso poupa o gestor de procurar
   defeito onde está tudo certo, que foi exatamente o que a primeira parede em pé gerou. */
function dicaInicial(tela) {
  if (tela.saida && tela.saida === tela.orientacao) {
    return 'Esta TV já recebe a imagem nessa posição, então ela deve aparecer certa sem nenhum giro.'
  }
  return 'A TV pode levar até um minuto para responder na primeira vez. Depois disso, cada giro aparece em poucos segundos.'
}

const ORIENTACOES = [
  { id: 'PAISAGEM', titulo: 'Deitada', desc: 'TV na horizontal, como em casa.' },
  { id: 'RETRATO', titulo: 'Em pé', desc: 'TV na vertical, como um totem ou cartaz.' },
]

/* A seta de girar. Desenho, e não palavra: o botão fica curto e o símbolo carrega o
   sentido. O "está errado" que ele dizia antes não se perdeu — está no cartão logo acima,
   que é onde o gestor compara o que vê na parede. */
function IconeGirar({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

/* A TV desenhada em CSS. `emPe` é o formato do PAINEL; `torto` gira o conteúdo 90° dentro
   dele — que é exatamente o defeito que o gestor veria na parede. Desenho, e não foto: o
   que importa é a relação entre a moldura e o sentido das linhas, e isso lê melhor num
   esquema do que numa imagem. */
function Desenho({ emPe, torto }) {
  return (
    <span className={'tvp-tv' + (emPe ? ' em-pe' : '')} aria-hidden="true">
      <span className={'tvp-conteudo' + (torto ? ' torto' : '')}>
        <i className="tvp-bola" />
        <i className="tvp-linha" />
        <i className="tvp-linha curta" />
      </span>
    </span>
  )
}

export default function PosicaoDaTela({ tela, aoAtualizar, aoFechar }) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState(null)
  const [giros, setGiros] = useState(0)
  const emPe = tela.orientacao === 'RETRATO'

  // Abre a janela de ajuste ao nascer e fecha ao sair. Sem Promise devolvida pelo efeito
  // (regra do projeto); falha aqui é silenciosa de propósito — sem a janela a TV só
  // responde mais devagar, e isso não é motivo para travar o modal.
  useEffect(() => {
    api.post(`/tv-indoor/telas/${tela.id}/ajuste`).then((r) => { if (r.data?.tela) aoAtualizar(r.data.tela) }).catch(() => {})
    return () => { api.post(`/tv-indoor/telas/${tela.id}/ajuste`, { encerrar: true }).catch(() => {}) }
  }, [tela.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function chamar(promessa, aoDarCerto) {
    setOcupado(true)
    setErro(null)
    promessa
      .then((r) => { if (r.data?.tela) aoAtualizar(r.data.tela); aoDarCerto?.() })
      .catch(() => setErro('Não foi possível salvar. Tente de novo.'))
      .finally(() => setOcupado(false))
  }

  const escolher = (orientacao) => {
    if (orientacao === tela.orientacao) return
    chamar(api.put(`/tv-indoor/telas/${tela.id}/posicao`, { orientacao }), () => setGiros(0))
  }
  const girar = () => chamar(api.post(`/tv-indoor/telas/${tela.id}/girar`), () => setGiros((n) => n + 1))

  return (
    <div className="modal-overlay">
      <div className="modal tvp-modal" role="dialog" aria-modal="true" aria-labelledby="tvp-titulo">
        <div className="modal-title" id="tvp-titulo">Posição da TV — {tela.nome}</div>

        <div className="form-group">
          <div className="form-label">Como esta TV está na parede?</div>
          <div className="tvp-opcoes">
            {ORIENTACOES.map((o) => (
              <button
                key={o.id}
                type="button"
                className={'tvp-opcao' + (tela.orientacao === o.id ? ' on' : '')}
                aria-pressed={tela.orientacao === o.id}
                disabled={ocupado}
                onClick={() => escolher(o.id)}
              >
                <Desenho emPe={o.id === 'RETRATO'} />
                <span className="tvp-opcao-t">{o.titulo}</span>
                <span className="tvp-opcao-d">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <div className="form-label">Agora olhe para a TV</div>
          {!tela.online ? (
            <div className="alert alert-yellow" style={{ marginBottom: 12 }}>
              <div className="alert-msg">
                Esta TV está <strong>offline</strong>. A posição fica salva e vale assim que ela voltar —
                mas a conferência abaixo só funciona com a TV ligada na sua frente.
              </div>
            </div>
          ) : null}
          <div className="tvp-comparar">
            <div className="tvp-caso certo">
              <Desenho emPe={emPe} />
              <span className="tvp-caso-t">Assim está certo</span>
              <span className="tvp-caso-d">Você lê a tela sem virar a cabeça.</span>
            </div>
            <div className="tvp-caso errado">
              <Desenho emPe={emPe} torto />
              <span className="tvp-caso-t">Assim está errado</span>
              <span className="tvp-caso-d">O conteúdo aparece de lado ou de ponta-cabeça.</span>
            </div>
          </div>
          <div className="ttm-dica">
            {giros === 0
              ? dicaInicial(tela)
              : `Girei a imagem (${giros}ª tentativa). Espere alguns segundos e olhe de novo — são no máximo três giros até acertar.`}
          </div>
        </div>

        {erro ? <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}><div className="alert-msg clr-red">{erro}</div></div> : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary tvp-girar" disabled={ocupado} onClick={girar}>
            {ocupado ? 'Salvando…' : <><IconeGirar />Girar</>}
          </button>
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={aoFechar}>
            Está certo
          </button>
        </div>
      </div>
    </div>
  )
}
