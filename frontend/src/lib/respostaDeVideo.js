// A resposta do servidor a uma escrita de vídeo, CONFERIDA antes de virar "deu certo".
//
// ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────────────
// Um bug real de produção. O Nginx tinha `location /api/tv-indoor/videos/` (com barra) e,
// por regra documentada dele, devolve **301 para a URI com barra** a qualquer requisição
// igual ao prefixo SEM a barra. O navegador segue o 301 e, em 301/302, converte POST em
// GET. Resultado: o `POST /videos` virava `GET /videos/`, voltava 200 com a LISTA, e a tela
// leu aquilo como sucesso — anunciou "Vídeo criado" sem vídeo nenhum e sem enviar o arquivo.
//
// A lição não é "conserta o Nginx". É que **200 não quer dizer que aconteceu o que se
// pediu**: entre o `fetch` e o Express existem proxies, redirects e páginas de erro que
// respondem 200 com outro corpo. Quem escreve precisa reconhecer a própria resposta.
//
// Por isso estas funções são um módulo puro e testado, e não um `?.` solto na página: elas
// são a régua do protocolo, e o lugar onde o caso da lista fica registrado para sempre.

export const ERRO_PROTOCOLO = 'PROTOCOLO_INESPERADO';

/* O erro que diz "a resposta não é a que esta chamada produz".

   É diferente de um erro do servidor: ninguém recusou nada, e tentar de novo do mesmo jeito
   vai dar no mesmo. Por isso ele é marcado — a tela precisa parar, não seguir o fluxo. */
export function erroDeProtocolo(onde) {
  const erro = new Error(ERRO_PROTOCOLO);
  erro.protocolo = onde ?? true;
  return erro;
}

export const ehErroDeProtocolo = (erro) => erro?.message === ERRO_PROTOCOLO;

/* O id do vídeo RECÉM-CRIADO, ou `null` se a resposta não for a de uma criação.

   Estrito de propósito: `{ videos: [...] }` (a lista), `{}`, texto de página de erro e
   qualquer outra coisa devolvem `null`. O id tem de ser NÚMERO — uma string "7" já denuncia
   que quem respondeu não é a nossa rota, e aceitar por conveniência apagaria o sinal. */
export function idDoVideoCriado(dados) {
  const id = dados?.video?.id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/* O servidor confirma que o ARQUIVO está lá?

   `temArquivo` só é verdadeiro quando existem versão e `storageKey` no banco — é o próprio
   domínio dizendo que o upload completou o ciclo, e não o HTTP dizendo que a conexão
   terminou. Um 200 com a lista, ou com o vídeo antigo, não passa daqui. */
export function arquivoConfirmado(dados) {
  return dados?.video?.temArquivo === true;
}
