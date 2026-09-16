// A VERSÃO DO APLICATIVO que está no ar — módulo puro.
//
// ── O PROBLEMA QUE ISTO RESOLVE ───────────────────────────────────────────────────────
// A página da TV fica aberta por semanas. Ela relê a PROGRAMAÇÃO a cada 60 s, mas o
// JavaScript e o CSS continuam sendo os que ela baixou no dia em que foi pareada. Depois de
// um deploy, cada parede segue com o aplicativo antigo até alguém ir até lá recarregar — e
// com dez lojas isso é uma tarde inteira de trabalho manual a cada correção.
//
// ── POR QUE O HASH DO `index.html`, E NÃO UM NÚMERO DE VERSÃO ────────────────────────
// Um número em `package.json` depende de alguém lembrar de incrementá-lo, e a versão que
// importa aqui não é a do produto: é "os arquivos que este navegador tem são os mesmos que o
// servidor está entregando?". O `index.html` do build referencia os bundles com hash no
// nome (`index-DoE7FHsS.js`), então ele muda exatamente quando o aplicativo muda — nem mais,
// nem menos. Nenhum passo manual, nenhum esquecimento possível.
//
// ── O QUE ELE NÃO É ───────────────────────────────────────────────────────────────────
// Não é autenticação, não é cache-busting de mídia (isso é o `?v=` das rotas de arquivo) e
// não decide nada operacional. Se falhar, o pior que acontece é a TV continuar com o
// aplicativo antigo — exatamente o comportamento de hoje.
import { createHash } from 'node:crypto';

/* Conteúdo → identificador curto e estável.

   Doze caracteres de sha1: o suficiente para que dois builds diferentes nunca colidam na
   prática, e curto o bastante para viajar em toda resposta de programação sem peso.

   Devolve `null` para entrada vazia ou inválida, e esse `null` é significativo: ele quer
   dizer "não sei em que versão estou", e quem não sabe NÃO manda ninguém recarregar. */
export function versaoDe(conteudo) {
  if (typeof conteudo !== 'string' || conteudo.trim().length === 0) return null;
  return createHash('sha1').update(conteudo).digest('hex').slice(0, 12);
}

/* Mudou de versão?

   Só é mudança quando as DUAS são conhecidas e diferentes. Com uma delas ausente a resposta
   é não — nunca "talvez": um `null` de um lado significaria recarregar a parede por causa de
   um arquivo que o servidor não conseguiu ler, e isso é pior do que ficar desatualizado. */
export function mudouDeVersao(anterior, atual) {
  if (!anterior || !atual) return false;
  return anterior !== atual;
}
