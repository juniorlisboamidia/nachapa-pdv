import RelatorioBase from './RelatorioBase'
import SecaoInstagram from '../../components/relatorios/SecaoInstagram'

export default function RelatorioInstagram() {
  return (
    <RelatorioBase titulo="Instagram" logoSrc="/instagram.svg" endpoint="/dashboard/instagram">
      {(dados, carregando) => <SecaoInstagram dados={dados} carregando={carregando} />}
    </RelatorioBase>
  )
}
