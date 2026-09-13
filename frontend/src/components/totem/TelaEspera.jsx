// Tela de ESPERA — o repouso do totem, e a única tela sem sessão.
//
// É ela que fica horas no vidro chamando quem passa. Até aqui esse papel era da TelaInicio,
// acumulado com a escolha "comer aqui / levar"; separar deixou cada uma com um trabalho só:
// a espera CHAMA, o início PERGUNTA.
//
// A tela inteira é o alvo de toque, e não um botão no meio. Quem passa na frente não vai
// mirar: encosta a mão em qualquer lugar. Continua sendo um `<button>` de verdade — o
// elemento certo para "isto responde ao toque", e o único que funciona com teclado e com
// leitor de tela sem gambiarra de `role`.
//
// Funciona com a loja ABERTA ou FECHADA, e de propósito: loja fechada deixou de bloquear o
// quiosque, e o cliente pode montar o pedido inteiro — só não fecha a compra. Um "estamos
// fechados" aqui contradiria o resto do fluxo.
//
// V1 sem carrossel, sem vídeo e sem banner. Quando `Aparência › Banners` existir, ele
// alimenta ESTA tela sem mexer no fluxo espera → inicio → catálogo.
import { Ico } from './icones'

export default function TelaEspera({ loja, aoTocar }) {
  const logo = loja?.logo || loja?.logoDataUrl || null
  const inicial = String(loja?.nome ?? '').trim().charAt(0).toUpperCase() || '•'

  return (
    <button type="button" className="tq-espera tq-textura" onClick={aoTocar} aria-label="Toque para começar o seu pedido">
      <div className="tq-espera-marca">
        {/* A logo do cardápio quase sempre vem com fundo branco. Em vez de disfarçar, ela
            vira placa — o mesmo tratamento do início, para as duas telas serem a mesma loja. */}
        {logo
          ? <div className="tq-placa"><img src={logo} alt="" /></div>
          : <div className="tq-espera-inicial tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>}
        {loja?.nome ? <div className="tq-espera-loja tq-rotulo">{loja.nome}</div> : null}
      </div>

      <div className="tq-espera-chamada">
        <Ico nome="mais" tam={40} traco={2.4} className="tq-espera-ico" />
        <span className="tq-disp tq-disp-forte">Toque para começar</span>
      </div>
    </button>
  )
}
