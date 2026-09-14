import { Ico } from './icones'

// Escolha do modo: comer aqui ou levar. NÃO é mais a tela de repouso — quem fica horas no
// vidro chamando quem passa é a TelaEspera, e o cliente só chega aqui depois de tocar.
//
// A separação tem uma consequência que não é visual: a partir daqui já existe SESSÃO, e o
// relógio de ociosidade já corre. Quem tocou, viu as duas opções e foi embora não deixa
// mais o totem parado nesta tela — ele volta sozinho ao repouso.
//
// ── A COMPOSIÇÃO: pergunta em cima, duas barras deitadas embaixo ──────────────────────
// A LOGO SAIU. Ela era a terceira aparição da marca em três telas — o cliente acabou de
// vê-la em tela cheia no repouso e vai revê-la no cabeçalho do catálogo. E ela disfarçava
// o defeito real: com os cartões travados em 34vh e tudo centrado, sobravam ~600px de
// preto morto, 300 em cima e 300 embaixo. Tirando a logo, o vazio aparece; por isso as
// barras passaram a ocupar a largura inteira e o título cresceu.
//
// BARRAS DEITADAS, e não dois cartões lado a lado: com o texto na horizontal "Vou levar
// para viagem" cabe numa linha só, em vez de quebrar em três num cartão estreito. E é a
// única forma que aceita um terceiro modo (mesa, retirada agendada) sem redesenhar a tela.
//
// Sem foto ambiente (spec §6.A): o bootstrap entrega `loja = { nome, logo }` e nada mais.
// O que preenche o fundo é calor desenhado — ver `.tq-inicio` na folha.
//
// O nome do aparelho NÃO aparece: quem está na frente do totem é cliente, e
// "Totem de teste" no vidro é informação de bastidor. Quem precisa saber de qual
// tablet se trata tem a tela Aparelhos, no admin.
//
// "Pagamento no balcão" também não mora aqui. Na abertura ele é ruído: o cliente
// ainda não escolheu nada e a frase compete com a decisão da tela. O recado tem
// dono — é o bloco preto no topo do Pagamento, onde a dúvida realmente aparece.
export default function TelaInicio({ modos, aoEscolher }) {
  const um = modos.length === 1

  return (
    <div className="tq-inicio">
      {/* Uma PERGUNTA, não uma instrução. "Faça seu pedido aqui" mandava fazer o que os
          dois alvos gigantes logo abaixo já deixam evidente; a pergunta pede resposta, e a
          resposta são eles. */}
      <h1 className="tq-inicio-tit tq-disp tq-disp-forte">O que vai ser hoje?</h1>

      {/* Sem classe para o caso de UM modo: com as barras empilhadas em coluna, uma barra
          sozinha já ocupa a largura inteira. A grade de duas colunas de antes precisava
          ser desfeita à mão; esta não precisa de nada. */}
      <div className="tq-modos">
        {modos.map((m) => (
          <button key={m.id} type="button" className="tq-modo" onClick={() => aoEscolher(m.id)}>
            {/* O tamanho do ícone vem da FOLHA, não daqui: ele acompanha a mesma régua de
                `vw` do rótulo ao lado, e escrever um número em pixels no JSX faria os dois
                descolarem na primeira mudança de escala. O traço é 1,8, que é o mesmo do
                wrapper do admin — é o que faz o desenho pertencer à mesma família. */}
            <Ico nome={m.ico} traco={1.8} className="tq-modo-ico" />
            <span className="tq-modo-txt">
              {/* UMA frase por barra, na voz do cliente. "COMER AQUI" com "Vou comer na
                  loja" embaixo dizia a mesma coisa duas vezes, só trocando de linguagem —
                  e a que decide é a do cliente.
                  O rótulo curto (`titulo`) continua existindo para o cabeçalho e a
                  revisão, onde "Vou levar para viagem" não caberia. */}
              <span className="tq-modo-t tq-disp tq-disp-forte">{um ? 'Começar meu pedido' : m.sub}</span>
              {um ? <span className="tq-modo-s">{m.sub}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
