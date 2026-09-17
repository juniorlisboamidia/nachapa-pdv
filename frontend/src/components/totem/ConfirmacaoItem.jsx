import Foto from './Foto'
import { Ico } from './icones'

/* O aviso de que o item ENTROU no pedido.

   O toast no rodapé dizia a mesma coisa, mas dizia baixinho: uma tarja de texto perto da
   barra, longe de onde o dedo acabou de tocar e longe do produto que o cliente escolheu.
   Num totem a confirmação precisa ser vista sem ser procurada — e o que confirma de
   verdade é ver a FOTO do que se acabou de pedir, não ler a palavra "adicionado".

   Ele NÃO é modal: não bloqueia, não pede toque, não tem botão de fechar. Vai embora
   sozinho e a tela por baixo continua viva e tocável o tempo inteiro (`pointer-events`
   está desligado no CSS). Quem quiser seguir escolhendo não espera nada.

   A duração mora AQUI, e o orquestrador importa daqui o número que usa no relógio: são a
   mesma coisa — o instante em que a animação termina e o instante em que o componente
   sai da tela. Dois números separados sairiam de sincronia no primeiro ajuste, e o que
   se veria era o cartão evaporando no meio do movimento ou uma sobra parada no fim. */
export const MS_CONFIRMACAO = 1400

export default function ConfirmacaoItem({ nome, imagem }) {
  return (
    <div className="tq-conf" style={{ '--tq-conf-dur': `${MS_CONFIRMACAO}ms` }}>
      {/* `role="status"` no CARTÃO, não no envoltório: o leitor de tela anuncia o texto de
          dentro sem descrever a caixa que só existe para centralizar. */}
      <div className="tq-conf-card" role="status" aria-live="polite">
        <div className="tq-conf-foto-caixa">
          <Foto src={imagem} alt="" className="tq-conf-foto" tamIcone={40} />
          <span className="tq-conf-selo" aria-hidden="true">
            <Ico nome="check" tam={20} traco={3} />
          </span>
        </div>
        <div className="tq-conf-tit tq-disp tq-disp-forte">Produto adicionado!</div>
        {/* O nome pode ser comprido ("X BURGUER DUPLO COM CHEDDAR E BACON") e o cartão não
            cresce por causa dele: duas linhas e corta. A confirmação é a foto; o nome
            confere. */}
        <div className="tq-conf-nome">{nome}</div>
      </div>
    </div>
  )
}
