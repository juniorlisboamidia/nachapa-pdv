import RelatorioBase from './RelatorioBase'
import SecaoGoogleAds from '../../components/relatorios/SecaoGoogleAds'

export default function RelatorioGoogle() {
  return (
    <RelatorioBase titulo="Relatório · Google Ads" logoSrc="/google-ads.svg" endpoint="/dashboard/google">
      {(dados, carregando) => <SecaoGoogleAds dados={dados} carregando={carregando} />}
    </RelatorioBase>
  )
}
