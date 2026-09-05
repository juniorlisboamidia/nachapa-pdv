// Barra "esqueleto" com brilho deslizante (shimmer) — placeholder de conteúdo
// enquanto a tela carrega. O visual vive no global.css (.sk); aqui só é a peça
// que se combina (várias barras) para montar o esqueleto de cada tela.
export default function Skeleton({ w = '100%', h = 12, r = 6, mb = 0, style }) {
  return (
    <span
      className="sk"
      style={{ display: 'block', width: w, height: h, borderRadius: r, marginBottom: mb, ...style }}
    />
  )
}
