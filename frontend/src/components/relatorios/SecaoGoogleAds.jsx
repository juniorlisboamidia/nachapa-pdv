import KpiCard from './KpiCard'
import { BarChart, LineChartSuave, Legenda, SemConta } from './graficos'
import { brl, brlExato, num, x2, kFmt } from './formatos'

// Seção Google Ads: 4 KPIs (com comparativo vs período anterior) + 2 gráficos dos
// últimos 6 meses (Investimento vs Receita, Evolução do ROAS). Espelha a seção
// Meta Ads (SecaoMetaAds.jsx) — mesma estrutura, dados vindos de dados.kpis/anterior/mensal.

// Referências que fixam o TOPO do eixo Y dos gráficos (sem linha desenhada): a
// escala vai até esses valores, dando contexto de "quão longe da meta" estamos.
const REF_ROAS = 25
const REF_INV_RECEITA = 50000

export default function SecaoGoogleAds({ dados, carregando }) {
  const k = dados?.kpis || {}
  const ant = dados?.anterior || null
  const mensal = Array.isArray(dados?.mensal) ? dados.mensal : []
  const conectado = dados?.conectado

  if (!conectado) {
    return (
      <SemConta
        titulo="Nenhuma conta de Google Ads conectada"
        descricao="Assim que a agência vincular uma conta de Google Ads a esta loja, seu relatório aparece aqui automaticamente."
      />
    )
  }

  return (
    <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard label="Receita" valor={brl(k.valorConversoes)} atual={k.valorConversoes} anterior={ant?.receita ?? ant?.valorConversoes} formatAbs={brlExato} modo="bom-sobe" variant="success" />
        <KpiCard label="Conversões" valor={num(k.conversoes)} atual={k.conversoes} anterior={ant?.conversoes} formatAbs={num} modo="bom-sobe" />
        <KpiCard label="Investimento" valor={brl(k.investimento)} atual={k.investimento} anterior={ant?.investimento} formatAbs={brlExato} modo="neutro" />
        <KpiCard label="ROAS" valor={x2(k.roas)} atual={k.roas} anterior={ant?.roas} formatAbs={x2} modo="bom-sobe" variant="brand" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-label">Investimento vs Receita</div>
          <div style={{ fontSize: 12, color: '#a3a3a3', marginBottom: 8 }}>Últimos 6 meses</div>
          <Legenda itens={[{ cor: '#1e293b', txt: 'Investimento' }, { cor: '#10b981', txt: 'Receita' }]} />
          <BarChart
            data={mensal}
            series={[{ key: 'investimento', cor: '#1e293b', label: 'Investimento' }, { key: 'receita', cor: '#10b981', label: 'Receita' }]}
            formatTip={brlExato}
            formatYTick={kFmt}
            referencia={REF_INV_RECEITA}
          />
        </div>
        <div className="card">
          <div className="card-label">Evolução do ROAS</div>
          <div style={{ fontSize: 12, color: '#a3a3a3', marginBottom: 8 }}>Últimos 6 meses</div>
          <Legenda itens={[{ cor: '#f97316', txt: 'ROAS mensal' }]} />
          <LineChartSuave
            data={mensal}
            dataKey="roas"
            cor="#f97316"
            formatTip={x2}
            formatYTick={(v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            referencia={REF_ROAS}
          />
        </div>
      </div>
    </div>
  )
}
