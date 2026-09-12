import { Ico } from './icones'

// Tela de repouso do totem — é ela que fica horas no vidro chamando quem passa.
//
// A primeira versão empilhava tudo no centro e sobrava preto: linguagem de página
// web, não de fachada. Aqui a composição é assimétrica (placa e texto lado a
// lado), o título ocupa a largura, e as duas ações são blocos amarelos altos, com
// aresta inferior — alvo que se vê de longe e que afunda ao toque.
//
// Sem foto ambiente (spec §6.A): o bootstrap entrega `loja = { nome, logo }` e
// nada mais. O que preenche o preto é textura de listra e a própria marca.
//
// O nome do aparelho NÃO aparece: quem está na frente do totem é cliente, e
// "Totem de teste" no vidro é informação de bastidor. Quem precisa saber de qual
// tablet se trata tem a tela Aparelhos, no admin.
//
// "Pagamento no balcão" também não mora aqui. Na abertura ele é ruído: o cliente
// ainda não escolheu nada e a frase compete com a decisão da tela. O recado tem
// dono — é o bloco preto no topo do Pagamento, onde a dúvida realmente aparece.
export default function TelaInicio({ loja, modos, aoEscolher }) {
  const um = modos.length === 1
  const logo = loja?.logo || loja?.logoDataUrl || null
  const inicial = String(loja?.nome ?? '').trim().charAt(0).toUpperCase() || '•'

  return (
    <div className="tq-inicio tq-textura">
      <div className="tq-inicio-topo">
        {/* A logo do cardápio quase sempre vem com fundo branco. Em vez de
            disfarçar, ela vira placa — com aresta amarela, como sinalização. */}
        {logo
          ? <div className="tq-placa"><img src={logo} alt={loja?.nome ?? ''} /></div>
          : <div className="tq-inicio-marca tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>}

        <div className="tq-inicio-txt">
          <div className="tq-inicio-loja tq-rotulo">{loja?.nome ?? 'Bem-vindo'}</div>
          <h1 className="tq-inicio-tit tq-disp tq-disp-forte">
            <span>Faça seu</span>
            <span>pedido aqui</span>
          </h1>
          <p className="tq-inicio-sub">Escolha como você vai comer e monte o seu pedido.</p>
        </div>
      </div>

      <div className={'tq-modos' + (um ? ' um' : '')}>
        {modos.map((m) => (
          <button key={m.id} type="button" className="tq-modo" onClick={() => aoEscolher(m.id)}>
            <Ico nome={m.ico} tam={96} traco={1.6} />
            {/* UMA frase por cartão, na voz do cliente. "COMER AQUI" com
                "Vou comer na loja" embaixo dizia a mesma coisa duas vezes, só
                trocando de linguagem — e a que decide é a do cliente.
                O rótulo curto (`titulo`) continua existindo para o cabeçalho e a
                revisão, onde "Vou levar para viagem" não caberia. */}
            <span className="tq-modo-t tq-disp tq-disp-forte">{um ? 'Começar meu pedido' : m.sub}</span>
            {um ? <span className="tq-modo-s">{m.sub}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
