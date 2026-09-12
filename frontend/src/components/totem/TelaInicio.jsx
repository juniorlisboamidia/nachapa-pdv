import { Ico } from './icones'

// Tela de repouso do totem — é ela que fica horas no vidro chamando quem passa.
// Por isso o fundo é o preto da marca e as duas ações são os únicos blocos
// amarelos: a decisão que o cliente precisa tomar aqui é uma só.
//
// Sem foto ambiente (spec §6.A): o bootstrap entrega `loja = { nome, logo }` e
// nada mais. Inventar uma imagem de fundo exigiria campo novo no contrato.
export default function TelaInicio({ loja, aparelho, modos, aoEscolher }) {
  const um = modos.length === 1
  const logo = loja?.logo || loja?.logoDataUrl || null
  const inicial = String(loja?.nome ?? '').trim().charAt(0).toUpperCase() || '•'
  return (
    <div className="tq-inicio">
      {logo
        ? <img className="tq-inicio-logo" src={logo} alt={loja?.nome ?? ''} />
        : <div className="tq-inicio-marca tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>}

      <div className="tq-inicio-loja tq-rotulo">{loja?.nome ?? 'Bem-vindo'}</div>
      <h1 className="tq-inicio-tit tq-disp tq-disp-forte">Faça seu pedido aqui</h1>
      <p className="tq-inicio-sub">Pagamento no balcão, na retirada.</p>

      <div className={'tq-modos' + (um ? ' um' : '')}>
        {modos.map((m) => (
          <button key={m.id} type="button" className="tq-modo" onClick={() => aoEscolher(m.id)}>
            <Ico nome={m.ico} tam={52} traco={1.8} />
            {/* Com um modo só, o cartão vira "Começar meu pedido" e o modo desce
                para a linha de apoio: o cliente não escolhe o que não tem escolha. */}
            <span className="tq-modo-t tq-disp tq-disp-forte">{um ? 'Começar meu pedido' : m.titulo}</span>
            <span className="tq-modo-s">{um ? m.titulo : m.sub}</span>
          </button>
        ))}
      </div>

      {/* Nome do aparelho só aqui: ajuda a equipe a saber de qual tablet se fala
          e não polui a tela enquanto o cliente escolhe. */}
      {aparelho?.nome ? <div className="tq-inicio-pe">{aparelho.nome}</div> : null}
    </div>
  )
}
