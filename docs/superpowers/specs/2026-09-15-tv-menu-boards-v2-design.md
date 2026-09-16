# TV Indoor — Menu Boards V2 (templates e composição visual)

## 1. O V1, e o que a investigação achou

| Achado | Consequência |
|---|---|
| **`MenuBoard.jsx` já é compartilhado** entre editor e player, com escala por `ResizeObserver` | O maior risco da frente **não existia**. Nada a unificar: só preservar, e travar com guarda |
| `LAYOUTS` já era definição central com `maximo`/`destaque` | Estender para cinco foi natural, sem espalhar condicionais |
| `titulo` vivia em `configuracao.titulo` (JSON, máx. 40) | Virou **coluna**; a migration copia e o domínio mantém leitura de retaguarda |
| `produtoParaTv` já resolvia promoção, percentual e fita corretamente | **Intocado.** A regra de preço do V2 é a mesma do V1 |
| `configuracao` recusava mais itens que o teto do layout | Mudou: o teto de escrita virou o **absoluto** (12) — ver §6 |
| `tvMenuBoardPrevia.js` duplica `produtoParaTv` **com teste provando equivalência** | Preservado e estendido do mesmo jeito |

## 2. Arquitetura

Inalterada: **template + conteúdo estruturado + identidade da loja**. Nenhuma coordenada, nenhuma camada, nenhum editor gráfico. O servidor resolve o board contra o catálogo e a TV recebe uma cena pronta.

O que o V2 acrescenta é uma camada de **composição declarada**: cada template diz o que mostra sempre e o que deixa o gestor escolher.

## 3. Compatibilidade com o V1

**Zero mudança visual em board existente**, e isso foi construído, não torcido:

- os três templates antigos mantêm **id, capacidade e semântica** (teste 🔴);
- os defaults das quatro colunas novas reproduzem exatamente o V1: logo escondida, descrição só onde ela já aparecia, imagem só onde já aparecia, fita ligada;
- `destaque: true` marcado num board V1 **continua sendo honrado** — o V2 usa a ordem para boards novos, mas não reposiciona o que já estava;
- o renderer tem fallback para board vindo de servidor anterior ao V2.

## 4–5. Templates e capacidade

| Template | Capacidade | Imagem | Descrição |
|---|---|---|---|
| Grade de produtos | 8 | sempre | opcional |
| Destaque + produtos | 5 | sempre | só no produto grande |
| Lista de cardápio | 10 | **opcional** | sempre |
| Vitrine | 3 | sempre | opcional |
| Oferta em destaque | 1 | sempre | opcional |

`SEMPRE`/`OPCIONAL`/`HERO` é o que evita oferecer opção sem efeito: a Vitrine sem foto não é vitrine, a Lista sem descrição não é lista.

## 6. Configuração

`titulo` (60), `subtitulo` (100), `mostrarLogo`, `mostrarDescricao`, `mostrarImagem`, `mostrarFita`. String vazia → **null**: `''` renderizaria um bloco de altura zero empurrando a composição, e o gestor veria um vão sem entender de onde veio.

**Trocar de template não apaga nada.** O teto de escrita é o absoluto (12); o template limita quantos **aparecem**. Voltar para a Grade recupera a seleção inteira, e o contador do editor diz "3 de 8 na tela".

## 7. Schema e migration

`20261002120000_tv_menu_board_v2`, aditiva: seis colunas + `UPDATE` que copia o título do JSON. O JSON fica **intacto** de propósito — se algo der errado no deploy, o dado original continua onde estava.

Campos tipados, não JSON: texto e flags são estruturais e fechados, e `configuracao Json` aceitaria qualquer coisa.

## 8. Renderer compartilhado

`components/tv/MenuBoard.jsx` serve editor e player. Três guardas: os dois importam o mesmo módulo, **não existe um segundo arquivo** desenhando board, e o renderer **não conhece** `precoPromocional`, `status` nem cálculo de desconto — ele recebe tudo resolvido.

## 9. Preço

Regra do V1 preservada inteira. Nome e preço com peso equivalente; o que os distingue é a cor. O preço anterior é riscado mas legível (apagado, a promoção não é percebida de longe — o contrário do que ela existe para fazer). O desconto sai só do par de valores e some quando o par não forma oferta.

Na Oferta o preço cresce — ele é a mensagem —, mas há teste travando a razão preço/nome em 1,5×: **um preço gigante sozinho vende desconto, não vende produto.**

## 10. ProdutoFita

Preservada e **nunca pintada pelo tema**: "Mais pedido" tem a mesma cor em todo o sistema porque é metadado editorial compartilhado. O que é próprio da TV é a apresentação. Pode ser desligada por board.

## 11. Sem foto

O mesmo bloco neutro em todos os templates (`tvmb-foto-vazia`, já existente), acionado por ausência de URL **ou** por `onError`. A Lista funciona naturalmente sem foto — é o template que existe para isso.

## 12–13. Editor e prévia

Três colunas preservadas. O seletor virou **wireframe em CSS** por template (não imagem: um arquivo por template seria mais uma coisa a manter sincronizada com o layout real). Interruptores só os aplicáveis, vindos do servidor junto com o template.

A prévia recebe o **teto do template**: mostra o que a parede mostraria, não a seleção inteira.

## 14–15. Dinâmica e último estado bom

Intocados. Preço muda no CW → o board atualiza no ciclo; a assinatura da programação não inclui preço, então não há reset estrutural. Produto indisponível é omitido; todos indisponíveis → board não elegível → o player pula. Falha do HUB mantém o último catálogo bom.

Uma correção de ordem: o teto do template é aplicado **depois** da disponibilidade — um produto esgotado não pode gastar uma das três vagas da Vitrine.

## 16–17. Performance e isolamento

Nenhuma consulta nova. `MB_CABECALHO`/`MB_CAMPOS` separados para a programação não arrastar texto e flags que ninguém lê ali. Catálogo continua resolvido por `clienteId` derivado da empresa; nada do browser autoriza tenant.

## 18. Riscos e dívidas

- Sem harness de componente, a fidelidade visual é provada por guarda estrutural + olho humano (checklist 1920×1080).
- `-webkit-line-clamp` é o corte de descrição; WebView antiga sem suporte mostra o texto inteiro — degrada mostrando mais, não quebrando.
- Fundo customizado, templates do usuário, múltiplas páginas: fora do V2, como pedido.
