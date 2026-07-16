// Comprime a foto ANTES de subir — a evidência vira base64 no banco (padrão do
// PDV) e precisa caber no body limit (5mb). Redimensiona para no máx `teto` px no
// maior lado e exporta JPEG. dimensoesComprimidas é pura (testável sem canvas).

export function dimensoesComprimidas(largura, altura, teto = 1280) {
  const maior = Math.max(largura, altura);
  if (maior <= teto) return { largura, altura };
  const escala = teto / maior;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

export function comprimirFoto(file, { teto = 1280, qualidade = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const { largura, altura } = dimensoesComprimidas(img.naturalWidth, img.naturalHeight, teto);
        const canvas = document.createElement('canvas');
        canvas.width = largura; canvas.height = altura;
        canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);
        const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        URL.revokeObjectURL(url);
        // base64 ~= bytes * 4/3.
        const tamanhoBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        resolve({ dataUrl, largura, altura, tamanhoBytes });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
