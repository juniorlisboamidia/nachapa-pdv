import Skeleton from './Skeleton'

// Esqueleto de tabela: cabeçalho + N linhas com M células fantasma (larguras
// variadas por posição, para não ficar mecânico). Usa as classes reais da
// tabela (.table-card / .hb-table) para encaixar no lugar do conteúdo.
export default function SkeletonTabela({ colunas = 5, linhas = 6 }) {
  const larguras = ['62%', '45%', '72%', '38%', '55%', '48%', '64%', '42%', '52%']
  return (
    <div className="table-card">
      <table className="hb-table">
        <thead>
          <tr>
            {Array.from({ length: colunas }).map((_, c) => (
              <th key={c}><Skeleton w="55%" h={10} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: linhas }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: colunas }).map((_, c) => (
                <td key={c}><Skeleton w={larguras[(r * 2 + c) % larguras.length]} h={12} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
