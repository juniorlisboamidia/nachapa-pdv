// HTTP Range — helper TÉCNICO puro (sem fs, sem Express, sem domínio).
//
// Existe porque `<video>` não funciona sem isto. O Chromium pede um trecho para descobrir a
// duração, outro para começar a tocar, e outro a cada vez que o buffer esvazia; um servidor
// que responda sempre 200 com o arquivo inteiro faz alguns WebViews nem iniciarem a
// reprodução, e faz todos baixarem o vídeo inteiro antes do primeiro quadro.
//
// Fica separado do resto para ser testável sem arquivo e sem servidor: as bordas de um Range
// são exatamente o tipo de conta que se erra por um byte.
//
// ⚠️ O helper de IMAGEM (`responderImagem`, em server.js) NÃO serve aqui, e copiá-lo seria
// plantar o defeito: ele não conhece Range e responderia 200 sempre.

/* `Range: bytes=…` → `{ inicio, fim }` (inclusivos, como manda a RFC 9110), ou um veredito.

   Devolve:
     { tipo: 'ausente' }                    não há Range — responder 200 inteiro
     { tipo: 'ignorar' }                    Range que não sabemos atender (múltiplas faixas,
                                            unidade diferente, sintaxe torta) — a RFC PERMITE
                                            ignorar, e ignorar é mais seguro do que adivinhar
     { tipo: 'invalido' }                   sintaxe boa, faixa fora do arquivo → 416
     { tipo: 'parcial', inicio, fim }       → 206

   Três formas válidas, e a terceira é a que mais se esquece:
     bytes=0-1023     do 0 ao 1023
     bytes=1024-      do 1024 até o fim
     bytes=-1024      os ÚLTIMOS 1024 bytes (sufixo, não "do 1024 em diante") */
export function interpretarRange(cabecalho, tamanho) {
  const total = Number(tamanho);
  if (!Number.isFinite(total) || total < 0) return { tipo: 'ignorar' };
  if (typeof cabecalho !== 'string' || !cabecalho.trim()) return { tipo: 'ausente' };

  const m = /^bytes=(.*)$/i.exec(cabecalho.trim());
  if (!m) return { tipo: 'ignorar' };
  const spec = m[1].trim();
  // Múltiplas faixas exigiriam resposta multipart/byteranges. Nenhum `<video>` precisa
  // disso, e implementá-lo seria código sem uso com chance de erro.
  if (spec.includes(',')) return { tipo: 'ignorar' };

  const partes = /^(\d*)-(\d*)$/.exec(spec);
  if (!partes) return { tipo: 'ignorar' };
  const [, cruIni, cruFim] = partes;
  if (cruIni === '' && cruFim === '') return { tipo: 'ignorar' };

  // Arquivo vazio: qualquer faixa está fora dele.
  if (total === 0) return { tipo: 'invalido' };

  if (cruIni === '') {
    // Sufixo: os últimos N bytes. Pedir mais do que o arquivo tem devolve o arquivo todo —
    // é o que a RFC manda, e não um 416.
    const n = Number(cruFim);
    if (!Number.isFinite(n)) return { tipo: 'ignorar' };
    if (n === 0) return { tipo: 'invalido' };
    const inicio = Math.max(0, total - n);
    return { tipo: 'parcial', inicio, fim: total - 1 };
  }

  const inicio = Number(cruIni);
  if (!Number.isFinite(inicio)) return { tipo: 'ignorar' };
  // Começar em (ou depois de) EOF é a definição de faixa insatisfazível.
  if (inicio >= total) return { tipo: 'invalido' };
  if (cruFim === '') return { tipo: 'parcial', inicio, fim: total - 1 };

  const fimPedido = Number(cruFim);
  if (!Number.isFinite(fimPedido)) return { tipo: 'ignorar' };
  if (fimPedido < inicio) return { tipo: 'invalido' };
  // Pedir além do fim é legítimo: entrega-se até onde o arquivo vai.
  return { tipo: 'parcial', inicio, fim: Math.min(fimPedido, total - 1) };
}

/* Os cabeçalhos e o status de uma resposta de mídia, a partir do veredito acima.

   `Accept-Ranges: bytes` vai SEMPRE — inclusive na resposta 200. É por ele que o navegador
   descobre que pode pedir trechos; sem ele, muitos nem tentam.

   O cache é o mesmo contrato do resto do canal: a URL é versionada, logo imutável. O ETag
   viaja nas duas respostas, mas quem decide o 304 é quem chama — e só numa requisição SEM
   Range: devolver 304 para um pedido de trecho quebra o buffer do `<video>`. */
export function cabecalhosDeMidia({ veredito, tamanho, tipo, etag }) {
  const base = {
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
    Vary: 'Cookie',
    ETag: etag,
    // O navegador não deve adivinhar o tipo de um arquivo de mídia que servimos por id.
    'X-Content-Type-Options': 'nosniff',
  };
  if (veredito?.tipo === 'invalido') {
    return { status: 416, cabecalhos: { ...base, 'Content-Range': `bytes */${tamanho}` }, corpo: null };
  }
  if (veredito?.tipo === 'parcial') {
    const { inicio, fim } = veredito;
    return {
      status: 206,
      cabecalhos: {
        ...base,
        'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`,
        'Content-Length': String(fim - inicio + 1),
      },
      corpo: { inicio, fim },
    };
  }
  return {
    status: 200,
    cabecalhos: { ...base, 'Content-Length': String(tamanho) },
    corpo: { inicio: 0, fim: Math.max(0, tamanho - 1) },
  };
}
