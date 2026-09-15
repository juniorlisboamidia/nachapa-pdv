# TV Indoor — Programação Semanal V1

## 1. Estado anterior, e o que a investigação achou

| O que existia | Consequência para esta frente |
|---|---|
| `Dispositivo.tvPlaylistId` (`SetNull`), lido só em `/api/public/aparelho/tv/programacao` | Reaproveitado **inteiro**. Muda de NOME (playlist padrão), não de papel. Nenhuma coluna nova de fallback |
| Rota pública com polling de 60 s, `agoraServidor`, assinatura estrutural, último-estado-bom | A grade entra ANTES da montagem dos itens; nada disso muda |
| `midiaAgenda.js` — janelas por instante (`inicioEm`/`fimEm`) | É a **agenda do conteúdo**, e continua separada. Não foi tocada |
| **Nenhum fuso por empresa** em lugar nenhum do PDV | Decisão obrigatória — ver §2 |
| Zero dependências de data no backend e no frontend | `Intl` resolve. Nada instalado |
| Última migration: `20260930120000_tv_video_v1` | A nova ordena depois: `20261001120000` |

O único `America/Sao_Paulo` do repositório estava cravado numa rota de checklist, sem relação com o canal. Não havia fonte autoritativa de fuso.

## 2. Timezone

**IANA persistido em `TvIndoorConfiguracao.fusoHorario`, default `America/Sao_Paulo`.**

Não em `Empresa`: o PDV não tem fuso por empresa hoje, e criar um seria decidir por Totem, Checklist e Ponto dentro de uma frente que é da TV. Quando outro canal precisar, promove-se.

**Nunca offset fixo.** `-03:00` é o retrato de um instante, não um fuso. `Intl` moderno até aceita offsets como timeZone — por isso `fusoValido` os **recusa explicitamente**, antes de consultar o runtime.

A validação é contra o runtime (`new Intl.DateTimeFormat`), não contra lista nossa, que envelheceria. A UI oferece uma lista curta (fusos brasileiros + UTC) porque um seletor de 400 entradas é convite a errar; o backend aceita qualquer IANA válido se um dia precisarmos abrir.

**Conversão inversa** (hora de parede → instante UTC) usa o algoritmo de duas passagens: trata-se a hora local como UTC, mede-se o deslocamento real ali e corrige-se; a segunda passagem cobre o caso de a correção cair do outro lado de uma virada de horário de verão. Testado com `America/New_York` em 08/03/2026.

## 3. Model e migration

`20261001120000_tv_programacao_semanal_v1` — **aditiva**.

```
TvProgramacaoRegra
  empresaId, dispositivoId, playlistId
  ativo, dias Int[], inicioMin Int, fimMin Int, ordem Int
```

- **Dias**: ISO-8601 (1 = segunda … 7 = domingo), `Int[]` do Postgres. Numérico e independente de idioma.
- **Horário em MINUTOS desde a meia-noite local**, não `"HH:MM"`. A comparação vira aritmética inteira, e a primeira gravação de `"8:00"` sem zero à esquerda não quebra a ordenação em silêncio. A UI continua falando `HH:MM`; a conversão mora num lugar só.
- **CHECKs no banco**: faixa 0–1439 nos dois campos e `inicioMin <> fimMin`. A régua da aplicação continua sendo a primeira defesa (ela responde com frase, não com 500); os CHECKs impedem que qualquer escrita futura — script, correção manual — grave uma janela que a grade não sabe ler.
- **CASCADE nos dois lados**, por razões diferentes: tela apagada não deixa grade órfã; playlist apagada não deixa regra apontando para id inexistente (o que viraria uma TV muda num horário em que o gestor jura que configurou). É **diferente** de `Dispositivo.tvPlaylistId`, que segue `SetNull` — lá a tela sobrevive sem playlist e cai no institucional, que é estado legítimo.

Instalação sem nenhuma regra resolve exatamente como antes.

## 4. Resolução temporal

Tudo em `backend/tvGradeSemanal.js`, módulo puro que **nunca chama `Date.now()`** — o instante entra por parâmetro. É o que torna "sexta 23:59", "sábado 01:59" e a virada do horário de verão casos de teste em vez de fé.

```
resolverGrade({ agoraMs, fuso, regras, playlistPadraoId })
  → { fuso, playlistId, origem: REGRA|PADRAO, regraId, proximaTrocaEm }
```

A mesma função serve a rota pública e o admin. Uma guarda estática proíbe `getDay()`/`getHours()`/`toLocaleTimeString` nos dois blocos.

## 5. Meia-noite

`inicioMin > fimMin` significa janela que atravessa a meia-noite, e **o dia marcado é o de INÍCIO**.

`sexta 18:00 → 02:00`, regra única:
- sexta 17:59 — fora; sexta 18:00 — entra; sexta 23:30 — vale
- sábado 01:59 — **ainda vale**, porque sexta está marcada e não deram 02:00
- sábado 02:00 — sai; sábado 18:00 — **não entra**

`domingo 20:00 → 02:00` alcança segunda de madrugada, atravessando a virada de semana.

**Início inclusivo, fim exclusivo** — a mesma régua da agenda de conteúdo. Sem isso, duas regras vizinhas (uma terminando, outra começando no mesmo minuto) valeriam juntas por um minuto.

`inicioMin == fimMin` é **recusado**: "24 horas" e "zero minutos" são leituras igualmente defensáveis do mesmo dado, e uma grade não pode ter duas leituras. Conteúdo permanente = playlist padrão.

## 6. Prioridade

**A primeira regra elegível vence.** A ordem na lista É a prioridade; não existe campo numérico para digitar. Sobreposição é recurso, não erro — "seg–sex jantar" com "terça em dobro" por cima é como o gestor pensa.

Regra nova entra **no fim**: a posição mais conservadora, já que nunca rouba a vez de uma que já funcionava.

A reordenação sobe a lista **inteira** e o servidor reescreve por posição, em transação — e recusa lista incompleta, com repetição ou com id de outra tela. Aceitar subconjunto deixaria as de fora com ordem indefinida, que é prioridade indefinida.

## 7. Playlist padrão e fallback

Precedência na rota pública:

1. primeira regra elegível → playlist dela;
2. nenhuma regra elegível → **playlist padrão** (`tvPlaylistId`);
3. playlist da regra existe mas está **sem nada reproduzível agora** → cai para a **playlist padrão inteira**;
4. padrão também vazia → institucional.

O passo 3 evita que uma programação especial vazia cale a comunicação da loja. Cai para a padrão **inteira**, nunca completando a especial com itens avulsos — isso produziria uma terceira programação que ninguém montou. Quando isso acontece, `origem` volta a `PADRAO` (é ele que está no ar) e `caiuNoPadrao: true` explica o porquê.

## 8. Contrato público

Aditivo. A resposta ganha:

```
programacaoTela: { playlistEfetivaId, origem, regraId, fuso, proximaTrocaEm, caiuNoPadrao }
```

**As regras não viajam.** A TV não precisa delas, e o que não viaja não vaza nem diverge. Ela só sabe *o que tocar* e *quando reconsultar*.

Ler a grade nunca custa uma ida ao HUB: a escolha da playlist é domínio PDV puro. Só depois de escolhida é que os Menu Boards (se houver) consultam o catálogo, como já faziam.

## 9. Troca na virada, sem depender do polling

O servidor manda `agoraServidor` e `proximaTrocaEm`. A TV agenda:

```
espera = proximaTrocaEm − agoraServidor + 1,5 s
```

Os dois instantes vêm do **mesmo relógio**, então uma TV com a hora errada troca na hora certa do mesmo jeito. A folga de 1,5 s existe porque pedir no instante exato chegaria ao servidor alguns milissegundos antes, e ele responderia a grade antiga.

Teto de 6 h por espera (reagenda ao acordar) e o polling de 60 s permanece como rede de segurança: se o temporizador falhar, a troca atrasa até um minuto em vez de não acontecer.

`proximaTrocaEm` é o limite da próxima **regra**, não da próxima playlist diferente. Calcular "quando a playlist realmente muda" custaria simular a resolução em cada limite para economizar uma requisição que não custa nada — e se a troca der na mesma playlist, nada acontece na tela.

## 10. Player

- **Imagem / Menu Board**: trocam imediatamente.
- **Vídeo**: a programação nova fica **pendente** e entra no `ended` — mesma regra do vídeo cuja janela termina durante a reprodução. Cortar um filme no meio lê como defeito na parede.
- **Vídeo travado**: o watchdog marca falha e a pendente entra aí. Um vídeo quebrado não segura a grade nova até o fim do expediente.
- **Vídeo único com troca pendente**: deixa de repetir (`unico` passa a falso). Sem isso o `loop` nunca dispararia `ended` e a grade nova ficaria presa — o bug seria invisível até alguém reclamar que "a TV não mudou às 18h".
- **Mesma playlist efetiva**: aplica direto; a assinatura impede o rodízio de reiniciar.

`pendente` é **estado**, não ref, justamente porque muda o que se desenha.

## 11. Último estado bom

Inalterado e agora mais importante: falha de rede na virada **não** apaga a programação, **não** mostra erro e **não** adivinha offline qual playlist deveria entrar. A TV segue tocando o que tem e troca quando conseguir confirmar. Cold-start offline continua fora do V1.

## 12. Isolamento

Toda consulta leva `empresaId`, inclusive as que já recebem id na URL — é onde a distração acontece. A tela precisa ser `tipo: 'TV_INDOOR'` **e** da empresa (totem não tem grade). A playlist é conferida contra o conjunto da própria loja. Admin resolve empresa pela sessão; TV pelo cookie → `Dispositivo`. Cinco guardas estáticas cobram isso lendo o código.

## 13. Riscos e dívidas

- **`proximaTrocaEm` varre 8 dias** a cada requisição pública. Com poucas regras por tela é barato; se uma loja criar dezenas, vale medir.
- **Fuso por empresa continua sendo do canal TV.** Se o Totem precisar de fuso, promover para `Empresa` em vez de duplicar.
- **Sem testes HTTP reais** — a cobertura é de domínio e estática, como no resto do projeto.
- **Nenhum teste importa `server.js`**: dívida aberta desde a queda de 15/09. Uma suíte verde ainda não prova que o servidor sobe.
- `TvIndoorTelas.jsx:104` tem um erro de lint **pré-existente** (`setState` síncrono em efeito), de outra frente, não tocado aqui.
- Fora do V1, como pedido: calendário mensal, feriados, exceção por data, RRULE, grade compartilhada entre TVs, WebSocket, drag-and-drop.
