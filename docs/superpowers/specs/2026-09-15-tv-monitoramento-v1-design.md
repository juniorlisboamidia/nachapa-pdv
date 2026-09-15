# TV Indoor — Monitoramento e Diagnóstico V1

## 1. O heartbeat atual, e o que a investigação decidiu

| O que existe | Consequência |
|---|---|
| `POST /api/public/aparelho/heartbeat`, a cada 60 s, payload `{ versao, tela }` | Reaproveitado. Mesma frequência, mesmo instante, mesma requisição |
| `Dispositivo.heartbeatJson Json?` — **substituído inteiro** a cada batida | É "só o snapshot mais recente" **por construção**. Sem tabela que cresça, sem migration |
| `estaOnline()` em `aparelhos.js` — sinal há menos de 150 s, decidido no servidor | É A autoridade. Este módulo **não** cria uma segunda definição de online |
| A rota já sanitiza com rigor (`versao` cortada, dimensões validadas) | O bloco `tv` entra com a mesma disciplina |
| `aparelhoAdmin()` já projeta `tela` a partir do `heartbeatJson` | A resolução continua vindo de onde sempre veio |

**Zero migration.** Criar `TvTelemetriaEvento` teria sido construir histórico que ninguém pediu e que cresce uma linha por minuto por TV — com cem paredes, 144 mil linhas por dia para responder uma pergunta sobre o *agora*.

## 2. Piggyback no heartbeat

A pergunta "o aparelho está vivo?" e a pergunta "o que ele está fazendo?" têm a **mesma cadência** e são sobre o **mesmo instante**. Um segundo timer bateria no banco em dobro para dizer, com meio segundo de diferença, o que o primeiro já poderia ter dito.

O bloco `tv` só é aceito quando `dispositivo.tipo === 'TV_INDOOR'`. Num totem é ignorado: guardar um dado que nenhuma rota lê é criar algo que um dia alguém lerá como se significasse alguma coisa.

## 3. Shape do snapshot

```js
{ versao: 1,
  estado: 'REPRODUZINDO'|'INSTITUCIONAL'|'SEM_CONTEUDO'|'ATUALIZANDO'|'FALHA_TOTAL',
  programacao: { playlistId, origem, regraId, caiuNoPadrao, sincronizadoEm, proximaTrocaEm },
  itemAtual: { tipo, id, versao } | null,
  video: { estado: 'PLAYING'|'BUFFERING' } | null,
  falhas: { totalSessao, ultima: { codigo, tipo, id, versao, haSegundos } | null },
  uptimeSegundos }
```

**Reconstruído campo a campo**, nunca copiado. Um `{ ...body.tv }` teria sido uma linha — e teria aceitado qualquer coisa que um navegador comprometido mandasse direto para um JSON no banco. Campo desconhecido simplesmente não existe do outro lado; o snapshot gravado fica abaixo de 700 bytes.

**A TV não é autoridade sobre o próprio relógio.** O que viaja são **durações** (`haSegundos`, `uptimeSegundos`), medidas com `performance.now()` — monotônico, não anda para trás quando a TV acerta a hora ao pegar rede. O servidor ancora na hora em que recebeu. A única hora absoluta aceita é `sincronizadoEm`, que é o `agoraServidor` que nós mesmos mandamos.

## 4. Frequência

60 s, a do heartbeat. O estado local muda a cada item; o snapshot só viaja no ciclo normal. Nenhum write por troca de slide.

## 5. Estados do player

Cinco, fechados. `REPRODUZINDO`, `INSTITUCIONAL`, `SEM_CONTEUDO`, `ATUALIZANDO`, `FALHA_TOTAL`. Subestado de vídeo só `PLAYING`/`BUFFERING` — "correndo" e "parou para carregar" é a única distinção que muda o que alguém faria a respeito.

## 6. Saúde derivada

| Saúde | Quando |
|---|---|
| `OFFLINE` | `estaOnline()` disse não — mesmo com snapshot perfeito |
| `SEM_TELEMETRIA` | online, sem snapshot (player anterior a esta frente) |
| `ATENCAO` | sem sincronizar há > 4 min · `FALHA_TOTAL` · playlist sem conteúdo exibível · falha há < 5 min |
| `SEM_PROGRAMACAO` | online, saudável, **sem playlist** |
| `SAUDAVEL` | online + sincronizado + tocando |

**4 minutos** para a sincronização: o polling é de 60 s, então são quatro tentativas perdidas. Três seria apertado — rede de loja engasga dois minutos sem nada errado, e um aviso que aparece à toa é um aviso que ninguém lê.

**5 minutos** para a falha recente: um vídeo que travou às 9h e foi pulado não pode deixar a TV "quebrada" o dia inteiro. Passado isso a ocorrência continua **visível no detalhe**, sem contaminar o estado atual.

`SEM_CONTEUDO` sem playlist é **configuração**; com playlist é **defeito**. Os dois parecem iguais na parede e são opostos na gestão.

## 7. Falhas

Enum fechado: `IMAGE_LOAD_ERROR`, `VIDEO_LOAD_ERROR`, `VIDEO_PLAY_REJECTED`, `VIDEO_STALL`, `PROGRAMACAO_REFRESH_ERROR`, `ALL_MEDIA_FAILED`. Nunca stack trace, mensagem do navegador ou URL interna. Cada código tem frase em português montada **no backend** — regra e texto não podem morar em arquivos diferentes.

## 8. Endpoint administrativo

`GET /api/tv-indoor/monitoramento`. **Quatro consultas em lote, independentemente do número de TVs**: ids reunidos por tipo e resolvidos com `in`. Um `findFirst` por tela × item seria N+1 e, com cem paredes, transformaria a tela de diagnóstico num incidente próprio.

**Não fala com HUB nem com Cardápio Web** — guarda estática proíbe. Monitorar cinquenta telas não pode disparar cinquenta bootstraps de catálogo: o custo de *olhar* não pode ser maior que o de operar.

O snapshot gravado é **relido pelo sanitizador**: o que está no banco foi escrito por uma versão anterior da rota, e confiar na forma do que está gravado é confiar num contrato que já mudou uma vez.

## 9. Isolamento

Os ids vêm do payload de um navegador e **não autorizam nada**: entram só como filtro de uma consulta já escopada por `empresaId`. Uma TV da empresa A reportando o vídeo da B não faz o nome da B aparecer — o `in` não acha a linha e o item vira "removido".

**Telemetria nunca é autoridade.** Guarda estática garante que a rota pública de programação não lê `heartbeatJson` nem telemetria. Se a telemetria mentir, o pior que acontece é o admin mostrar diagnóstico errado; nunca a TV se comportar diferente.

## 10. Falha da telemetria

Fire-and-forget. O heartbeat já tinha `.catch` silencioso e continua tendo. O módulo de telemetria **não tem timer, não faz requisição e não produz imagem nenhuma** — se ele parasse inteiro, a parede seguiria igual.

## 11. Compatibilidade

TV com frontend anterior manda heartbeat sem `tv`: continua **online**, continua tocando, e aparece como **"Sem telemetria do player"**. Tratá-la como defeito faria todo deploy progressivo parecer incêndio.

## 12. Sem screenshot

Nenhuma captura, em lugar nenhum. Guarda estática proíbe `canvas`, `toDataURL` e `captureStream` no módulo de telemetria.

## 13. Dívidas

- Sem histórico: é diagnóstico de **sessão**. Aba reiniciou, contador zera — aceitável e explícito.
- `BUFFERING` vem de `waiting`/`playing`; um rebuffer curto pode não aparecer no snapshot de 60 s. É amostragem, não trace.
- Sem alertas externos, sem gráfico, sem SLA — fora do V1, como pedido.
- Nenhum teste importa `server.js`: dívida aberta desde 15/09.
