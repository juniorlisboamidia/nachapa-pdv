// Extrai o identificador de origem (param `s`) da 1ª URL de um texto de mensagem.
// Ex.: "...peça em https://loja.com.br/x?s=vip1" → "vip1". Sem link/param → null.
// É o valor que o Cardápio Web grava como customer_origin do pedido.
export function extrairOrigem(texto) {
  const s = String(texto || '');
  const urls = s.match(/https?:\/\/[^\s]+/gi) || [];
  for (const bruto of urls) {
    const u = bruto.replace(/[.,;:!?)\]}'"]+$/, ''); // tira pontuação colada no fim
    let val = null;
    try { val = new URL(u).searchParams.get('s'); }
    catch { const m = u.match(/[?&]s=([^&#\s]+)/i); val = m ? decodeURIComponent(m[1]) : null; }
    if (val && val.trim()) return val.trim();
  }
  return null;
}
