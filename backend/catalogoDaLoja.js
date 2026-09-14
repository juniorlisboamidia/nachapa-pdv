// O CATÁLOGO DA LOJA — serviço neutro de canal.
//
// Uma porta só para "me dá o cardápio desta empresa", com último-estado-bom embutido. É
// infraestrutura: não sabe o que é totem, TV, vitrine ou menu board.
//
// ── O CAMINHO, QUE NÃO MUDA ───────────────────────────────────────────────────────────
//   empresaId → Empresa.clienteId → HUB (/internal/cardapio-totem-bootstrap) → Cardápio Web
// Nenhuma credencial do CW mora no PDV, e nenhum navegador fala com o CW. Quem faz a ponte
// continua sendo `cardapioPedido.js`, com o JWT de serviço `pdv-operacao`.
//
// ── POR QUE O CACHE EXISTE ────────────────────────────────────────────────────────────
// Uma TV numa parede não pode apagar porque o HUB piscou. Este módulo guarda o ÚLTIMO
// CATÁLOGO BOM por empresa e o devolve marcado como `desatualizado` quando a chamada falha.
// O menu board então continua resolvendo com os últimos preços conhecidos, em vez de sumir.
//
// O totem tem o `snapshotTotem` dele em server.js, e ele NÃO foi tocado: aquele guarda a
// resposta INTEIRA do bootstrap (operacional, pagamentos, modos) e vive no caminho
// transacional já validado em produção. Aqui guarda-se só o catálogo. São duas camadas
// pequenas em vez de uma grande mexida onde o dinheiro passa.
//
// Cache DE PROCESSO, de propósito: é conforto de vitrine, não fonte de verdade. Reiniciar o
// PM2 esvazia, e a primeira leitura seguinte vai ao HUB. Cold-start offline está fora do V1.

const TTL_PADRAO_MS = 10 * 60_000;   // 10 min: acima disso o cache é "socorro", não "atalho"

// empresaId → { catalogo, em }
const cache = new Map();

/* Só para os testes: ninguém em produção precisa esvaziar isto. */
export function limparCacheCatalogo() { cache.clear(); }

/* O catálogo é utilizável? 200 do HUB com corpo torto NÃO é catálogo vazio — é resposta
   ruim, e tratá-la como "a loja não tem itens" faria o admin declarar toda referência
   salva como órfã. Fail-closed, igual ao `catalogoVivoDoAdmin`. */
export function catalogoUtilizavel(catalogo) {
  return !!catalogo && Array.isArray(catalogo.categorias);
}

/* Busca o catálogo da empresa, com último-estado-bom.

   Devolve SEMPRE um objeto, nunca lança:
     { ok: true,  catalogo, desatualizado: false }            → veio do HUB agora
     { ok: true,  catalogo, desatualizado: true, em }         → veio do cache (HUB falhou)
     { ok: false, codigo }                                    → não há catálogo nenhum

   Códigos: CLIENTE_SEM_CW · HUB_NAO_CONFIGURADO · HUB_INDISPONIVEL · CATALOGO_INDISPONIVEL.

   `deps` injeta `clienteIdDaEmpresa` e `bootstrap` para o teste rodar sem banco e sem rede —
   é o mesmo contrato de injeção que `cardapioPedido.js` usa. */
export async function catalogoDaLoja(empresaId, deps = {}) {
  const { clienteIdDaEmpresa, bootstrap, agora = () => Date.now(), ttlMs = TTL_PADRAO_MS } = deps;
  const guardado = cache.get(empresaId);
  const doCache = (codigo) => {
    // Sem TTL o cache viraria um cardápio fóssil: preço de dois dias atrás numa parede é
    // pior do que board nenhum. Dentro da janela, ele é a rede de segurança.
    if (guardado && agora() - guardado.em < ttlMs) {
      return { ok: true, catalogo: guardado.catalogo, desatualizado: true, em: guardado.em };
    }
    return { ok: false, codigo };
  };

  let clienteId = null;
  try {
    clienteId = await clienteIdDaEmpresa(empresaId);
  } catch {
    // Banco fora do ar ao ler o clienteId é falha de infra, não "loja sem CW".
    return doCache('HUB_INDISPONIVEL');
  }
  if (!clienteId) return { ok: false, codigo: 'CLIENTE_SEM_CW' };

  let r;
  try {
    r = await bootstrap(clienteId);
  } catch {
    return doCache('HUB_INDISPONIVEL');
  }
  if (!r?.ok) {
    if (r?.codigo === 'HUB_NAO_CONFIGURADO') return doCache('HUB_NAO_CONFIGURADO');
    return doCache('HUB_INDISPONIVEL');
  }
  // O HUB responde 200 dizendo que a loja não está ligada ao CW: é estado de configuração,
  // não catálogo. NÃO encosta no cache — apagar o último menu bom porque alguém desvinculou
  // a loja por engano deixaria a parede vazia até religarem.
  if (r.data?.conectado === false) return { ok: false, codigo: 'CLIENTE_SEM_CW' };
  if (!catalogoUtilizavel(r.data?.catalogo)) return doCache('CATALOGO_INDISPONIVEL');

  cache.set(empresaId, { catalogo: r.data.catalogo, em: agora() });
  return { ok: true, catalogo: r.data.catalogo, desatualizado: false };
}
