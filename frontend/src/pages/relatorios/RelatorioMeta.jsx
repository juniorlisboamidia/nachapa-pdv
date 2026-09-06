import RelatorioBase from './RelatorioBase'
import SecaoMetaAds from '../../components/relatorios/SecaoMetaAds'

export default function RelatorioMeta() {
  return (
    <RelatorioBase titulo="Relatório · Meta Ads" logoSrc="/meta-ads.svg" endpoint="/dashboard/meta">
      {(dados, carregando) => <SecaoMetaAds dados={dados} carregando={carregando} />}
    </RelatorioBase>
  )
}
