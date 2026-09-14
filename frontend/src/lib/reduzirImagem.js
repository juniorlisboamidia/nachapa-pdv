// Reduz uma imagem NO NAVEGADOR antes de subir — helper técnico, sem domínio.
//
// Estava duplicado em `TotemBanners.jsx` e `TotemPersonalizacao.jsx`, com assinaturas
// diferentes, quando a TV Indoor virou o terceiro consumidor. Três cópias de um canvas é
// onde uma delas começa a divergir em silêncio — a do totem já usava JPEG fixo e a da
// personalização aceitava formato.
//
// O teto do servidor continua existindo e é o que manda; isto aqui é o que faz a foto de
// 4000 px que veio do celular do gestor virar algo do tamanho da tela de destino.
//
// JPEG a 88% é o padrão porque arte de tela cheia é fotografia — PNG guardaria a mesma
// imagem em três vezes o tamanho, e transparência não serve para nada numa peça que ocupa
// a tela inteira. Quem precisa de transparência (a LOGO) passa `image/png`.
export function reduzirImagem(arquivo, ladoMaior = 1920, formato = 'image/jpeg', qualidade = 0.88) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('leitura'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('imagem'))
      img.onload = () => {
        // `Math.min(1, …)`: nunca AUMENTA. Esticar uma arte pequena só engorda o upload e
        // deixa a imagem borrada na tela — se a loja mandou 800 px, 800 px é o que sobe.
        const escala = Math.min(1, ladoMaior / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * escala))
        const h = Math.max(1, Math.round(img.height * escala))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL(formato, qualidade))
      }
      img.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
}

export default reduzirImagem
