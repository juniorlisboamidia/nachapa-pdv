import { NavLink, useParams } from 'react-router-dom'
import { ABAS, abaValida } from '../components/totemAparencia'

// Loja Digital › Totem › Aparência do totem — CASCA. Nada aqui persiste ainda.
//
// A tela existe agora por dois motivos. O primeiro é que o desenho da suíte de canais
// precisa do lugar definido antes de o conteúdo chegar: campo que nasce sem casa acaba
// pendurado na tela mais próxima, e depois ninguém move. O segundo é que os rótulos são
// decisão de produto — orientação, posição das categorias, logo, Design System —, e vê-los
// escritos é o que permite discordar deles antes de existir banco por trás.
//
// Os controles estão DESABILITADOS e não guardam nada. Um campo que aceita valor e o perde
// no refresh é pior do que campo nenhum: ensina que a tela mente.
//
// A aba vem da URL (`/totem/aparencia/:aba`) porque a Aparência é FOLHA da sidebar — a
// Sidebar desenha três níveis, e a profundidade extra se resolve aqui dentro em vez de
// aprofundar o menu inteiro da aplicação para servir um caso só.
//
// ── SOBRE O DESIGN SYSTEM, e isto é o que mais importa deste arquivo ──────────────────
// O TotemDesignSystem nasce INDEPENDENTE do Design System do HUB. Não é intenção: já é
// fato. O `totem.css` recebeu as cores e as fontes da marca como valores LITERAIS,
// copiados uma vez, e não consome nada do HUB em tempo de execução — o quiosque roda com
// a rede caindo e continua com a identidade certa.
//
// O caminho futuro é "Importar identidade": um botão que traz os valores do HUB para
// dentro do canal, uma vez, com o gestor vendo o que mudou. Origem opcional, nunca
// dependência de runtime. A diferença aparece no dia em que o HUB estiver fora do ar e o
// totem precisar abrir mesmo assim.
export default function TotemAparencia() {
  const { aba: abaParam } = useParams()
  const aba = abaValida(abaParam)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Aparência do totem</h1>
          <div className="page-header-sub">
            Como o totem se apresenta ao cliente: formato da tela, identidade e o que aparece na espera.
          </div>
        </div>
      </div>

      <nav className="ttm-abas" aria-label="Seções da aparência">
        {ABAS.map((a) => (
          <NavLink
            key={a.id}
            to={`/totem/aparencia/${a.id}`}
            className={'ttm-aba' + (a.id === aba ? ' ativa' : '')}
            aria-current={a.id === aba ? 'page' : undefined}
          >
            {a.label}
          </NavLink>
        ))}
      </nav>

      {aba === 'personalizacao' ? <Personalizacao /> : <Banners />}
    </div>
  )
}

function Personalizacao() {
  return (
    <div className="table-card table-card-form" style={{ padding: 16 }}>
      <div className="ttm-nota" style={{ marginTop: 0, marginBottom: 16 }}>
        Em breve. Os campos abaixo estão desenhados, mas ainda não salvam — a estrutura veio antes
        para que os nomes e o agrupamento pudessem ser discutidos antes de virarem banco.
      </div>

      <div className="ttm-aparencia-grade">
        <Campo
          id="apa-orientacao"
          rotulo="Orientação da tela"
          nota="O totem de produção é vertical. Horizontal muda a grade de produtos e a coluna de categorias."
        >
          <select id="apa-orientacao" className="form-input" disabled defaultValue="vertical">
            <option value="vertical">Vertical (em pé)</option>
            <option value="horizontal">Horizontal (deitado)</option>
          </select>
        </Campo>

        <Campo
          id="apa-categorias"
          rotulo="Posição das categorias"
          nota="Hoje é uma coluna fixa à esquerda. No topo, a lista vira faixa e cabe menos categoria à vista."
        >
          <select id="apa-categorias" className="form-input" disabled defaultValue="esquerda">
            <option value="esquerda">Coluna à esquerda</option>
            <option value="direita">Coluna à direita</option>
            <option value="topo">Faixa no topo</option>
          </select>
        </Campo>

        <Campo
          id="apa-logo"
          rotulo="Logo do totem"
          nota="Própria do canal. Hoje o quiosque usa a logo que vem do Cardápio Web, feita para fundo claro — no vidro preto ela vira uma placa branca."
        >
          <input id="apa-logo" className="form-input" type="text" disabled placeholder="Nenhuma imagem enviada" />
        </Campo>

        <Campo
          id="apa-ds"
          rotulo="Design System do totem"
          nota="Cores e fontes do canal, independentes do HUB. O HUB poderá servir como origem de uma importação avulsa — nunca como dependência para o totem abrir."
        >
          <input id="apa-ds" className="form-input" type="text" disabled placeholder="Identidade padrão do totem" />
        </Campo>
      </div>
    </div>
  )
}

function Banners() {
  return (
    <div className="table-card" style={{ padding: 16 }}>
      <div className="ttm-nota" style={{ marginTop: 0 }}>
        Em breve. Aqui vão as imagens que o totem mostra <strong>na tela de espera</strong>, enquanto ninguém
        está usando — o horário em que ele fica no vidro chamando quem passa.
      </div>
      <div className="ttm-dica">
        Vai ser um domínio próprio do totem, inspirado no Banner/Vídeo/Roleta do HUB mas independente dele.
        A tela de espera funciona sem banner nenhum, e continua funcionando: os banners a alimentam, não a substituem.
      </div>
    </div>
  )
}

function Campo({ id, rotulo, nota, children }) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" htmlFor={id}>{rotulo}</label>
      {children}
      <div className="ttm-dica">{nota}</div>
    </div>
  )
}
