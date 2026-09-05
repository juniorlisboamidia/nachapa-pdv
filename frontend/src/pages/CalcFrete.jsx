import { useState } from 'react'
import Card from '../components/Card'
import InputMoeda from '../components/InputMoeda'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const pctFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const multFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const multExatoFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
})

function formatCurrency(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
// Recebe a fração (0,21) e exibe como percentual (21,00%)
function formatPercent(value) {
  if (value === null || value === undefined) return '—'
  return `${pctFormatter.format(Number(value) * 100)}%`
}
function formatMultiplier(value, exato = false) {
  if (value === null || value === undefined) return '—'
  return `${(exato ? multExatoFormatter : multFormatter).format(Number(value))}x`
}

// Converte o texto do input em número; vazio/inválido vira 0
function num(text) {
  const v = Number(text)
  return Number.isFinite(v) ? v : 0
}

function CampoValor({ label, value, onChange, moeda = true }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      {moeda ? (
        <InputMoeda className="form-input" valor={value} onChange={onChange} />
      ) : (
        <input
          className="form-input"
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export default function CalcFrete() {
  // A calculadora abre em branco: o usuário preenche os próprios números
  // Custos da entrega
  const [salarios, setSalarios] = useState('')
  const [freelancers, setFreelancers] = useState('')
  const [apps, setApps] = useState('')
  const [outros, setOutros] = useState('')
  // Dados de venda
  const [pedidos, setPedidos] = useState('')
  const [ticketMedio, setTicketMedio] = useState('')
  // Produto exemplo
  const [precoProduto, setPrecoProduto] = useState('')

  // ===== Cálculo em tempo real (sem backend) =====
  // Campo vazio ≠ zero: enquanto nenhum custo foi digitado, não há total real
  const custosPreenchidos = [salarios, freelancers, apps, outros].some(
    (s) => String(s).trim() !== ''
  )
  const totalCustosEntrega = custosPreenchidos
    ? num(salarios) + num(freelancers) + num(apps) + num(outros)
    : null

  const pedidosNum = num(pedidos)
  const ticketNum = num(ticketMedio)
  const precoNum = num(precoProduto)

  const pedidosOk = pedidosNum > 0
  const ticketOk = ticketNum > 0
  const precoOk = precoNum > 0

  const custoMedioEntrega =
    totalCustosEntrega !== null && pedidosOk ? totalCustosEntrega / pedidosNum : null
  const percentualEmbutir =
    custoMedioEntrega !== null && ticketOk ? custoMedioEntrega / ticketNum : null
  const multiplicadorFinal = percentualEmbutir === null ? null : 1 + percentualEmbutir
  const acrescimoProduto =
    percentualEmbutir !== null && precoOk ? precoNum * percentualEmbutir : null
  const precoFinal = acrescimoProduto === null ? null : precoNum + acrescimoProduto

  const calculoCompleto = precoFinal !== null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calculadora de Frete Grátis</h1>
          <div className="page-header-sub">
            Calcule quanto precisa embutir no preço dos produtos para oferecer frete grátis.
          </div>
        </div>
      </div>

      {/* ===== Entradas ===== */}
      <div className="grid-3" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-label">Custos da Entrega</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <CampoValor label="Salários + benefícios (R$)" value={salarios} onChange={setSalarios} />
            <CampoValor label="Freelancer finais de semana (R$)" value={freelancers} onChange={setFreelancers} />
            <CampoValor label="Apps e logística (R$)" value={apps} onChange={setApps} />
            <CampoValor label="Outros custos (R$)" value={outros} onChange={setOutros} />
          </div>
        </div>

        <div className="card">
          <div className="card-label">Dados de Venda</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <CampoValor label="Número de pedidos no período" value={pedidos} onChange={setPedidos} moeda={false} />
            <CampoValor label="Ticket médio (R$)" value={ticketMedio} onChange={setTicketMedio} />
          </div>
          <div className="card-hint" style={{ marginTop: 12 }}>
            Use o mesmo período dos custos de entrega (ex.: o mês).
          </div>
        </div>

        <div className="card">
          <div className="card-label">Produto Exemplo</div>
          <div style={{ marginTop: 10 }}>
            <CampoValor label="Preço atual do produto (R$)" value={precoProduto} onChange={setPrecoProduto} />
          </div>
          <div className="card-hint" style={{ marginTop: 12 }}>
            Simule qualquer produto do cardápio para ver o preço com frete grátis embutido.
          </div>
        </div>
      </div>

      {/* ===== Resultado ===== */}
      <div className="section-title">Resultado</div>
      <div className="grid-3">
        <Card
          title="Total dos Custos de Entrega"
          value={totalCustosEntrega === null ? 'Preencha os custos' : formatCurrency(totalCustosEntrega)}
          hint="Soma mensal da estrutura de entrega"
          variant={totalCustosEntrega === null ? undefined : 'info'}
        />
        <Card
          title="Custo Médio por Pedido"
          value={
            custoMedioEntrega !== null
              ? formatCurrency(custoMedioEntrega)
              : !pedidosOk
              ? 'Informe os pedidos'
              : 'Preencha os custos'
          }
          hint="Total dos custos / número de pedidos"
        />
        <Card
          title="Percentual a Embutir no Preço"
          value={
            percentualEmbutir !== null
              ? formatPercent(percentualEmbutir)
              : !ticketOk
              ? 'Informe ticket médio'
              : '—'
          }
          hint="Custo médio por pedido / ticket médio"
          variant={percentualEmbutir === null ? undefined : 'brand'}
        />
      </div>
      <div className="grid-3">
        <Card
          title="Multiplicador Final"
          value={formatMultiplier(multiplicadorFinal)}
          hint={
            multiplicadorFinal === null
              ? '1 + percentual a embutir'
              : `Exato: ${formatMultiplier(multiplicadorFinal, true)} · 1 + percentual a embutir`
          }
        />
        <Card
          title="Acréscimo no Produto"
          value={
            acrescimoProduto !== null
              ? formatCurrency(acrescimoProduto)
              : !precoOk
              ? 'Informe o preço'
              : '—'
          }
          hint="Preço atual × percentual a embutir"
        />
        <Card
          title="Preço Final com Frete Grátis"
          value={precoFinal === null ? '—' : formatCurrency(precoFinal)}
          hint="Preço atual + acréscimo"
          variant={precoFinal === null ? undefined : 'brand'}
        />
      </div>

      {calculoCompleto ? (
        <div className="alert alert-green">
          <div className="alert-msg clr-green">
            Para cobrir o frete grátis, este produto deveria ter um acréscimo de{' '}
            <strong>{formatCurrency(acrescimoProduto)}</strong>, chegando a{' '}
            <strong>{formatCurrency(precoFinal)}</strong>.
          </div>
        </div>
      ) : (
        <div className="alert alert-gray">
          <div className="alert-msg">
            Preencha os dados acima para calcular o preço com frete grátis embutido.
          </div>
        </div>
      )}

      {/* ===== Explicação ===== */}
      <div className="section-title">Como o Cálculo é Feito</div>
      <div className="card">
        <div style={{ fontSize: 13, color: 'var(--app-text-2)', lineHeight: 1.7 }}>
          <div>1. Somamos os custos mensais da estrutura de entrega.</div>
          <div>2. Dividimos esse total pelo número de pedidos para descobrir o custo médio da entrega por pedido.</div>
          <div>3. Dividimos o custo médio da entrega pelo ticket médio para encontrar o percentual que precisa ser embutido.</div>
          <div>4. Aplicamos esse percentual ao preço atual do produto.</div>
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid #f5f5f5',
            fontSize: 12.5,
            color: '#666',
            lineHeight: 1.9,
            fontFamily: 'ui-monospace, monospace'
          }}
        >
          <div>Total dos custos = salários + freelancers + apps/logística + outros</div>
          <div>Custo médio por pedido = total dos custos / número de pedidos</div>
          <div>Percentual a embutir = custo médio por pedido / ticket médio</div>
          <div>Preço final = preço atual × (1 + percentual a embutir)</div>
        </div>
        <div className="card-hint" style={{ marginTop: 12 }}>
          Exemplo: percentual de 0,21 (21%) significa multiplicador final de 1,21x sobre o preço
          atual. A interface mostra os dois para evitar confusão — o percentual é o acréscimo, o
          multiplicador já inclui o preço original.
        </div>
      </div>
    </div>
  )
}
