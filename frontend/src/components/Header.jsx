import { useLocation } from 'react-router-dom'

const titles = {
  '/':                  { title: 'Dashboard',         sub: 'Visão geral da operação' },
  '/produtos':          { title: 'Produtos',          sub: 'Cadastro e preço de venda' },
  '/insumos':           { title: 'Insumos',           sub: 'Matérias-primas e custos' },
  '/ficha-tecnica':     { title: 'Ficha Técnica',     sub: 'Composição dos produtos' },
  '/custos-fixos':      { title: 'Custos Fixos',      sub: 'Despesas mensais recorrentes' },
  '/custos-variaveis':  { title: 'Custos Variáveis',  sub: 'Taxas, impostos e comissões' },
  '/faturamento':       { title: 'Faturamento',       sub: 'Lançamentos diários' },
  '/ponto-equilibrio':  { title: 'Ponto de Equilíbrio', sub: 'Margem de contribuição mensal' },
  '/inteligencia':      { title: 'Inteligência',      sub: 'Diagnósticos e recomendações' }
}

export default function Header() {
  const { pathname } = useLocation()
  const meta = titles[pathname] ?? { title: 'Hamburgueria 360', sub: '' }

  return (
    <header className="header">
      <div className="header-title">
        <h1>{meta.title}</h1>
        {meta.sub && <span className="header-title-sub">{meta.sub}</span>}
      </div>

      <div className="header-right">
        <span className="header-pill">
          <span className="header-pill-dot" />
          API local · :4000
        </span>
        <div className="header-avatar" title="Usuário">JR</div>
      </div>
    </header>
  )
}
