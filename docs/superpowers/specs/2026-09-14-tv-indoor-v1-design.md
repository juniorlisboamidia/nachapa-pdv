# TV Indoor V1 — investigação, arquitetura e decisões

**Data:** 2026-09-14 · **Canal:** Loja Digital › TV Indoor · **Estado:** implementado nesta frente.

O V1 é **promocional/institucional**: a TV mostra uma programação de imagens e nada mais.
Nenhum pedido é feito pela TV, não há toque, não há sessão.

---

## 1. O que a investigação encontrou

### 1.1 Dispositivo, pareamento, cookie, heartbeat — **prontos e genéricos**

`backend/aparelhos.js` já é um módulo puro e **agnóstico de canal**:

- `TIPOS_APARELHO = ['TOTEM', 'TV_INDOOR']` — o tipo da TV **já existe** no enum de string;
- `Dispositivo` (schema) já tem `pareamentoCodigo/ExpiraEm/Tentativas`, `credencialHash`,
  `pareadoEm`, `ultimoHeartbeatEm`, `heartbeatJson`, `@@index([empresaId, tipo])`;
- `gerarCodigoPareamento` (6 dígitos, 10 min, 5 tentativas), `cookieAparelho`
  (HttpOnly/Secure/SameSite=Strict, `Path=/api/public/aparelho`), `estaOnline` (< 150 s),
  `filtroAparelhoDoCookie`, `escopoEmpresa`, `whereDoAparelho`, `LimitadorIp`;
- as rotas `/api/public/aparelho/{parear,eu,heartbeat,sair}` **não são do totem**: valem para
  qualquer tipo em `TIPOS_APARELHO`. O heartbeat já grava `tela: { w, h }`, `versao`,
  `userAgent` e `ip` em `heartbeatJson`.

**Conclusão:** a TV **não precisa de nenhuma infraestrutura nova de aparelho**. Reaproveitamento
total, sem uma linha de pareamento ou heartbeat duplicada. O que faltava era (a) o player,
(b) expor a resolução reportada no admin e (c) a associação TV↔playlist.

### 1.2 Gestão de totens — o molde existe, a listagem já é filtrada no servidor

`frontend/src/pages/Aparelhos.jsx` **já pede `?tipo=TOTEM` ao servidor** (comentário no arquivo
antecipa exatamente esta frente: "Quando o canal TV Indoor existir, ele terá a tela dele — e ela
vai reusar esta infraestrutura inteira"). `GET /api/aparelhos` aceita `?tipo=`, valida contra
`TIPOS_APARELHO` e responde 400 em tipo inválido.

**Conclusão:** "Totem não aparece na gestão da TV" **já está garantido no servidor**; o que faltava
era a tela própria. Criar/parear/revogar/ativar/excluir são reuso direto de `/api/aparelhos/*`.

### 1.3 Banners do Totem — a infraestrutura que vale copiar (e o domínio que **não** vale)

`backend/totemBanner.js` + rotas estabeleceram o contrato de mídia deste projeto:

| Peça | Onde está | Reuso para a TV |
|---|---|---|
| Bytes em tabela separada (`TotemBannerImagem`, `onDelete: Cascade`) | schema | **padrão copiado** (`TvConteudoImagem`) |
| `imagemVersao` sobe **só** quando os bytes mudam | `proximaVersaoImagem` | **padrão copiado** |
| MIME **real** por magic bytes (PNG/JPEG/WEBP) | `tipoReal`, `lerImagem` | **helper compartilhado** |
| `responderImagem` — `private, max-age=31536000, immutable` + `Vary: Cookie` + ETag com empresa | `server.js` | **função reusada como está** |
| Versão no `WHERE` (URL versionada = recurso imutável; `?v=` velho → 404) | rota pública | **padrão copiado** |
| Agenda absoluta (`inicioEm`/`fimEm`) + `agoraServidor` + desvio de relógio no cliente | `totemBanner.js` / `totemBanners.js` | **helper compartilhado** |
| Lista sem bytes no bootstrap (`BANNER_CAMPOS` sem a relação) | `server.js` | **padrão copiado**, com teste |

**O que NÃO é reusado:** `TotemBanner` como tabela, `TIPOS = ['ESPERA','CAPA']`, `MEDIDAS` (retrato
1080×1920 / 3:1), `bannersPublicos`. São **contratos de produto do totem**. A TV tem os seus.

### 1.4 Componentes administrativos reutilizáveis encontrados

`Toast`, `ConfirmDialog` (modal que só fecha por botão — regra do projeto), `BotaoCopiar`,
`lib/qr.js` (QR local, sem serviço externo), classes `table-card`/`hb-table`/`btn`/`badge`/
`form-input`/`intel-switch`/`empty-state`/`ttm-cab-secao`, e o padrão de **ordenação sem
biblioteca** de `TotemBanners.jsx` (alça com ↑/↓ + HTML5 drag nativo).

`reduzirImagem` estava **duplicado** em `TotemBanners.jsx` e `TotemPersonalizacao.jsx` (duas cópias
com assinaturas diferentes). Foi extraído para `lib/reduzirImagem.js` e as duas páginas passaram a
usá-lo — TV é o terceiro consumidor.

### 1.5 Roteamento público do aparelho — **a porta já existe**

`/dispositivo` (`DispositivoPareamento.jsx`) é a **única** URL pública do aparelho: sem token, sem
slug, sem id de loja. Ela chama `GET /public/aparelho/eu` e **já ramifica por tipo** — TOTEM monta o
quiosque; TV_INDOOR mostrava "a tela da TV ainda não está disponível".

**Decisão:** a URL da TV é **a mesma `/dispositivo`**. Nada de `/tv`, `/painel/:token` ou qualquer
endereço com segredo embutido. Quem decide o que a TV mostra é o **tipo do aparelho que o cookie
resolveu** — e é por isso que o mesmo link colado em qualquer TV da rede não vale nada sem o código
de 6 dígitos.

### 1.6 Permissões — armadilha encontrada

`backend/acessos/areas.js` é **fail-closed**: prefixo não mapeado = rota negada para operador.
`/tv-indoor` **não estava mapeado** — sem a entrada nova, todo endpoint responderia 403 para quem
não é ADMIN, em silêncio. Corrigido: `['/tv-indoor', 'aparelhos']`.

---

## 2. Arquitetura adotada

```
Dispositivo (tipo=TV_INDOOR)  ──tvPlaylistId?──▶  TvPlaylist ──▶ TvPlaylistItem ──▶ TvConteudo
      │  cookie pdv_aparelho                          (nome)          (ordem)          │
      │                                                                         TvConteudoImagem
      ▼
GET /api/public/aparelho/tv/programacao   →  metadados + agoraServidor (sem bytes)
GET /api/public/aparelho/tv/conteudo/:id/imagem?v=N  →  bytes, cache privado imutável
```

**Independência do Totem** (requisito central): não há uma linha de TV lendo `TotemBanner`,
`TotemConfiguracao` ou qualquer estado do totem, e vice-versa. O que se compartilha é **técnico**:

| Compartilhado (técnico) | Módulo | Por quê |
|---|---|---|
| `lerImagem`, `tipoReal`, MIME real, teto de bytes | `backend/midiaImagem.js` (novo) | validar PNG/JPEG/WEBP não é conceito de produto |
| `instante`, `janelaValida`, `dentroDaJanela`, `statusDaJanela` | `backend/midiaAgenda.js` (novo) | agenda absoluta é cálculo, não produto |
| `responderImagem` (cache/ETag) | `server.js` | resposta HTTP, não domínio |
| `desvioDoRelogio`, `noAr`, `duracaoEmMs`, `proximoIndice` | `frontend/src/lib/midiaAgenda.js` (novo) | relógio corrigido é cálculo |
| `reduzirImagem` | `frontend/src/lib/reduzirImagem.js` (novo) | canvas, não produto |

`backend/totemBanner.js` e `frontend/src/components/totemBanners.js` passaram a **delegar** a esses
helpers, mantendo a API pública intacta — os testes existentes dos dois provam que nada mudou de
comportamento.

### 2.1 Nomes

`TvConteudo`, `TvConteudoImagem`, `TvPlaylist`, `TvPlaylistItem`. O prefixo `Tv` é inequívoco (não
há outro canal de TV) e mantém a simetria com `Totem*` sem alongar cada linha do schema. Na
interface: **Telas** (os aparelhos) e **Conteúdos**; **Playlists** ficou como terceira folha porque
a programação é a peça que o produto pede para existir desde já.

---

## 3. Schema e migration

Migration `20260927120000_tv_indoor_v1`, **só aditiva e idempotente** (`IF NOT EXISTS` em tudo;
`ADD COLUMN IF NOT EXISTS` no Dispositivo). Nenhuma coluna existente muda de tipo, nenhum dado é
convertido — não há dado de TV em produção.

```prisma
model TvConteudo {
  id, empresaId, nome, ativo(true), duracaoSegundos(10),
  inicioEm?, fimEm?, imagemVersao(0), imagemTipo?, imagemBytes?,
  criadoEm, atualizadoEm
  imagem TvConteudoImagem?     // bytes fora daqui
  itens  TvPlaylistItem[]
  @@index([empresaId])
}
model TvConteudoImagem { conteudoId @id, dados Bytes, cascade }
model TvPlaylist {
  id, empresaId, nome, criadoEm, atualizadoEm
  itens TvPlaylistItem[]
  telas Dispositivo[]
  @@index([empresaId])
}
model TvPlaylistItem {
  id, playlistId, conteudoId, ordem
  @@unique([playlistId, conteudoId])   // o mesmo conteúdo não entra duas vezes
  @@index([playlistId, ordem])
}
model Dispositivo { + tvPlaylistId Int?  (onDelete: SetNull) }
```

**`onDelete: SetNull`** na playlist do dispositivo: apagar uma playlist não pode apagar a TV nem
travar o delete. A TV cai no fallback institucional, que é um estado legítimo.

**`@@unique([playlistId, conteudoId])`**: repetir o mesmo conteúdo na mesma playlist seria uma
programação que mostra a mesma imagem duas vezes por volta — quase sempre engano, e o custo de
proibir é zero (a loja duplica o conteúdo se quiser mesmo).

---

## 4. Endpoints

### Admin (`exigirAdmin` + `empresaDoAdmin`; área `aparelhos`)

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/tv-indoor/conteudos` | lista + `limites` (duração, KB, medida 1920×1080) |
| POST | `/api/tv-indoor/conteudos` | cria (nome e imagem obrigatórios) |
| PUT | `/api/tv-indoor/conteudos/:id` | nome/ativo/duração/agenda — **não** toca na versão |
| PUT | `/api/tv-indoor/conteudos/:id/imagem` | troca os bytes — **única** rota que incrementa a versão |
| DELETE | `/api/tv-indoor/conteudos/:id` | apaga (bytes vão por cascade) |
| GET | `/api/tv-indoor/conteudos/:id/imagem` | bytes para miniatura/prévia do admin |
| GET | `/api/tv-indoor/playlists` | playlists com os itens resolvidos |
| POST | `/api/tv-indoor/playlists` | cria |
| PUT | `/api/tv-indoor/playlists/:id` | renomeia |
| PUT | `/api/tv-indoor/playlists/:id/itens` | grava a lista ordenada inteira (transação) |
| DELETE | `/api/tv-indoor/playlists/:id` | apaga (itens por cascade; TVs caem para `null`) |
| GET | `/api/tv-indoor/telas` | aparelhos `TV_INDOOR` + playlist + resolução reportada |
| PUT | `/api/tv-indoor/telas/:id/playlist` | associa/desassocia (`{ playlistId: n \| null }`) |

Criar/parear/revogar/ativar/excluir a TV: **reuso** de `/api/aparelhos/*` com `tipo=TV_INDOOR`.

### Público (cookie do aparelho; `exigirTvIndoor`)

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/public/aparelho/tv/programacao` | `{ loja, tela, playlist, agoraServidor, itens[] }` — **nenhum byte** |
| GET | `/api/public/aparelho/tv/conteudo/:id/imagem?v=N` | bytes; `?v=` fora da versão atual → 404 |

`exigirTvIndoor` é o irmão de `exigirTotem`: um cookie de TOTEM não lê a programação, e um cookie de
TV_INDOOR não cota nem cria pedido (isso já era verdade).

---

## 5. Player

`frontend/src/pages/TvIndoorPlayer.jsx`, montado por `/dispositivo` quando o tipo é `TV_INDOOR`.

- **Fullscreen, sem cara de admin**: fundo preto, nenhum controle, `cursor: none`.
- **0 conteúdos elegíveis → fallback institucional**: logo da loja (ou a inicial do nome) sobre o
  fundo da marca, com o nome da loja. Nada de "nenhum conteúdo cadastrado" numa TV do salão.
- **1 → imagem estática** (sem temporizador nenhum). **2+ → rotação** com a duração de cada um.
- **Não pisca**: a `assinatura` da lista (id + versão + duração) governa o reset do índice —
  refresh que devolve a mesma programação não reinicia o player. Coberto por teste.
- **Pré-carrega a próxima** (uma só: TV de loja é hardware modesto).
- **Pula o que falhar** (`onError` → o id entra num `Set` de falhados); **todas falharem → fallback**.
- **Reage a mudança administrativa sem reiniciar o navegador**: repesca a programação a cada 60 s.
- **Relógio corrigido**: `agoraServidor` − relógio local = desvio; a agenda usa o corrigido, então um
  conteúdo agendado para as 18:00 entra às 18:00 mesmo tendo chegado às 17:00 (e mesmo com a TV com
  a hora errada).
- **`prefers-reduced-motion`**: o fade de entrada some; a troca continua acontecendo (a rotação é
  conteúdo, não decoração).
- **Heartbeat**: a MESMA rota do totem, 60 s + `visibilitychange`, mandando `tela: {w,h}` e versão.

### Escala da imagem — decisão

**`object-fit: cover`**, com o mesmo recorte na prévia do admin (caixa 16:9 com `cover`).

Razão: o formato recomendado é 16:9 (1920×1080), e numa arte 16:9 numa TV 16:9 `cover` **não corta
nada**. Ele só age quando a arte veio noutra proporção — e aí a escolha é entre cortar a borda ou
deixar tarja preta numa TV que fica ligada o dia inteiro. Tarja preta lê como defeito. Não há
`contain`, não há editor de recorte, não há opção por conteúdo: um comportamento só, e a prévia do
admin mostra exatamente o que a TV vai mostrar.

---

## 6. Armazenamento, cache e isolamento

- Bytes **no banco**, em tabela própria por conteúdo. Mesma razão dos banners: não existe arquivo
  órfão porque não existe arquivo, e o delete é transacional.
- Teto de **700 KB** por conteúdo (igual aos banners; o Nginx assume 1 MB). O admin reduz para
  1920 px no lado maior, JPEG 88%, antes de subir.
- `/conteudo/:id/imagem?v=N` responde `Cache-Control: private, max-age=31536000, immutable`,
  `Vary: Cookie`, `ETag: W/"logo-tv<id>-<empresaId>-<versao>"`. A **versão entra no WHERE**: `?v=`
  de outra geração é 404, nunca os bytes atuais sob número velho.
- **Isolamento**: toda consulta admin leva `empresaId` da sessão; toda consulta pública leva
  `whereDoAparelho(ap, {})`. `empresaId` **nunca** vem do navegador. Playlist de outra empresa não
  pode ser associada a uma TV (conferido com `findFirst` escopado antes de gravar), e conteúdo de
  outra empresa não entra numa playlist (os ids são filtrados contra o catálogo da empresa).

---

## 7. Riscos e dívidas

| Risco | Mitigação |
|---|---|
| Deploy sem `prisma migrate deploy` → tabelas ausentes | as leituras públicas têm `.catch` próprio: a TV cai no fallback em vez de estourar. O admin mostra o erro. |
| TV velha (WebView antiga) sem `object-fit` | `cover` degrada para imagem esticada; aceito no V1. |
| `client_max_body_size` do Nginx | mesmo teto dos banners, que já sobem hoje — sem mudança. |
| Testes HTTP de verdade | continuam ausentes no projeto (banco de dev com migrations de outras frentes). Os testes de contrato são **estáticos** sobre `server.js`, como nos banners. Dívida registrada. |
| Vídeo | **fora do V1**, como pedido. Nada de streaming, nada de `<video>`: a infraestrutura de bytes é boa para imagem (700 KB), não para vídeo. |

---

## 8. Fora do V1 (não implementado, de propósito)

vídeo · áudio · YouTube · feeds sociais · menu board dinâmico · preço do CW · zonas · widgets ·
relógio/clima · notícias · Canva · templates · animações complexas · TV vertical · sincronização
entre TVs · métricas de impressão.
