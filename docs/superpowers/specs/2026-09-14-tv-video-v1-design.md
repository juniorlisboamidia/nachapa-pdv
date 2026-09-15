# TV Indoor — Vídeo V1: investigação, arquitetura e decisões

**Data:** 2026-09-14 · **Canal:** Loja Digital › TV Indoor · **Estado:** implementado nesta frente.

Terceiro tipo de item da programação, ao lado de IMAGEM e MENU_BOARD. **Sem segundo player**:
o motor que já existe passa a saber tocar vídeo.

---

## 1. Investigação

### 1.1 O que o repositório diz

| Achado | Consequência |
|---|---|
| `backend/package.json` tem **8 dependências** e nenhuma de upload (sem multer, sem busboy) | o upload é por **corpo cru** (`req.pipe`), sem dependência nova |
| `app.use(express.json({ limit: '5mb' }))` é global | só age em `application/json`; um `PUT` com `video/mp4` **atravessa sem ser consumido** — é o que torna o `req.pipe` possível |
| `deploy.sh` faz `git pull` + npm + migrate + build + `pm2 restart` | **não apaga nada fora do repositório** e **não toca no Nginx** — um diretório em `/var/lib` é seguro, e a mudança de Nginx é passo manual |
| Node 24 local, `fs.statfs` disponível | checagem de disco livre possível, com guarda para ambiente sem ela |
| Envs existentes: `DATABASE_URL`, `JWT_SECRET`, `HUB_API_URL`, `PDV_PUBLIC_URL`, `PORT`, `CORS_ORIGINS` | entra `PDV_MEDIA_DIR`, opcional, com default |

### 1.2 O que NÃO foi possível verificar

Não tenho acesso ao VPS nesta execução. Portanto **nada foi pressuposto**:

- **ffmpeg/ffprobe**: não verificado, e por isso **não é usado**. Duração e dimensões vêm do
  `<video>` do navegador do gestor, são gravadas como **informativas** e o player **nunca**
  depende delas (ele avança no evento `ended`). O admin diz de onde o número veio.
- **`client_max_body_size` do PDV**: desconhecido. A mudança de Nginx está documentada em §3
  como passo manual — o `deploy.sh` não a faria.
- **Espaço em disco**: o código o consulta em tempo de execução (`fs.statfs`) e recusa o
  upload que deixaria a margem abaixo do piso.

O diretório de mídia é **criado pelo próprio servidor** no boot (`mkdir -p`, com erro claro
se não puder escrever): o caminho feliz não depende de ninguém lembrar de um passo manual.

### 1.3 Compatibilidade da TV

O alvo é Chromium/Android/WebView. **MP4 com H.264 + AAC** é o denominador universal —
toca em qualquer TV, box ou tablet que a loja tenha. **WebM (VP8/VP9)** entra junto porque
o custo é zero (um magic byte a mais) e o Chromium o reproduz nativamente; a recomendação na
tela continua sendo MP4.

**Autoplay** exige `muted` + `playsInline` — é por isso que o V1 é mudo, e não por falta de
tempo: um vídeo com áudio simplesmente **não começa** sozinho, e uma TV de loja não tem quem
clique. **Range Requests** são obrigatórios: sem `Accept-Ranges`/206, o Chromium recusa
buscar dentro do arquivo e alguns WebViews nem iniciam a reprodução.

---

## 2. Armazenamento — a decisão

**Filesystem fora do repositório**, com a metadata no banco.

BYTEA foi certo para imagens de 700 KB e é **errado** para vídeo, por três razões concretas:

1. **RAM**: o driver do Postgres materializa o `bytea` inteiro no processo. Servir um vídeo
   de 150 MB significaria 150 MB de heap por requisição — com três TVs, o PM2 morre.
2. **Range**: responder `bytes=1048576-2097151` exigiria `substring()` no SQL a cada seek do
   navegador. Com arquivo, é `createReadStream(path, { start, end })` — o SO faz o trabalho.
3. **Backup**: o dump do banco passaria de alguns MB para gigabytes, e o banco do PDV é
   copiado inteiro hoje.

```
PDV_MEDIA_DIR (default /var/lib/nachapa-pdv/media)
└── tv-indoor/
    └── videos/
        └── <empresaId>/
            └── <chave-opaca>.mp4      ← nome GERADO pelo servidor
        └── .tmp/                       ← parciais, limpáveis
```

**O nome do arquivo nunca vem do usuário.** A chave é `randomBytes(16).toString('hex')` mais
a extensão derivada do **container validado**. Antes de qualquer `open`, o caminho resolvido
é conferido contra o diretório base (`path.resolve(...).startsWith(base + sep)`) — path
traversal não tem por onde entrar, mesmo que a `storageKey` do banco fosse adulterada.

### Consistência DB ↔ filesystem (não há transação conjunta)

| Momento | Ordem | Se falhar no meio |
|---|---|---|
| **Upload novo** | grava `.tmp` → valida → move para o final → grava no DB | DB falhou: o arquivo novo é **removido**; nada aponta para nada |
| **Substituição** | grava o novo com chave **nova** → atualiza o DB → só então apaga o antigo | apagar o antigo falhou: vira órfão, e o DB está correto — **nunca** o contrário |
| **Exclusão** | apaga a linha do DB → apaga o arquivo | o arquivo sobrou: órfão. O registro **não ressuscita** |

**O DB é a autoridade.** Um órfão custa disco; um DB apontando para arquivo inexistente custa
uma TV preta. A assimetria é deliberada.

**Órfãos e temporários** são varridos por `GET/POST /api/tv-indoor/videos/manutencao`: lista
e remove `.tmp` com mais de 6 h e arquivos sem linha no banco. É uma ação administrativa
explícita — nada apaga arquivo sozinho em segundo plano.

---

## 3. Nginx — passo manual obrigatório

`deploy.sh` **não** mexe no Nginx. Sem isto, o upload falha com **413** antes de chegar ao Node:

```nginx
# no server/location do PDV (pdv.nachapahub.com.br)
location /api/tv-indoor/videos/ {
    client_max_body_size 220m;      # teto do app é 200 MB + folga de protocolo
    proxy_request_buffering off;    # streaming de verdade: sem isto o Nginx grava o corpo
                                    # inteiro em disco antes de repassar, e o progresso do
                                    # admin mente (chega a 100% e "trava" esperando)
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_pass http://127.0.0.1:4001;
    # ... as mesmas diretivas de proxy do bloco /api já existente
}
```

Escopo **na rota**, não global: o resto da API continua com o limite pequeno que já tem.

---

## 4. Formato, limites e defaults

| Item | Valor | Por quê |
|---|---|---|
| Containers | **MP4** (`ftyp`) e **WebM** (`1A45DFA3`) | validados por **magic bytes**, nunca pela extensão ou pelo MIME que o navegador manda |
| Codec | **H.264 + AAC** recomendado | **não verificado** — sem ffprobe não há como afirmar, e o admin diz isso com todas as letras. Falha de decode é tratada no player |
| Teto por arquivo | **200 MB** (`PDV_VIDEO_MAX_MB`) | 1080p bem comprimido dá ~60 s; acima disso é arte mal exportada |
| Cota por empresa | **2 GB** (`PDV_VIDEO_COTA_MB`) | uma loja não lota o disco do servidor |
| Margem livre | **2 GB** (`PDV_DISCO_MIN_MB`) | via `fs.statfs`; sem ela, a checagem é pulada e registrada |

---

## 5. Schema e migration

`20260930120000_tv_video_v1`, aditiva e idempotente, depois de `20260929120000`.

```prisma
model TvVideo {
  id, empresaId, nome, ativo, inicioEm?, fimEm?,
  arquivoVersao, arquivoTipo?, arquivoBytes?, storageKey?,
  // INFORMATIVAS, vindas do navegador do gestor. O player NUNCA as usa.
  duracaoMs?, largura?, altura?, nomeOriginal?,
  criadoEm, atualizadoEm
}
model TvPlaylistItem { + videoId Int?  (CASCADE) }   // tipo: IMAGEM | MENU_BOARD | VIDEO
```

O CHECK polimórfico é **reescrito** para três tipos — exatamente uma referência, coerente
com o `tipo`. Os itens existentes não são tocados: o CHECK antigo é derrubado e o novo
aceita tudo o que o antigo aceitava.

---

## 6. Range Requests

`GET /api/public/aparelho/tv/video/:id/arquivo?v=N`

- sempre `Accept-Ranges: bytes`;
- sem `Range` → **200** com `Content-Length` completo;
- `Range` válido → **206**, `Content-Range: bytes i-f/total`, `Content-Length` do trecho, e
  `createReadStream(path, { start, end })` — **nunca** o arquivo inteiro em memória;
- `Range` fora do arquivo → **416** com `Content-Range: bytes */total`;
- `Range` malformado ou múltiplo → ignorado, responde 200 (é o que a RFC 9110 permite, e é
  mais seguro que adivinhar).

**Cache com 206:** `ETag` e `Cache-Control: private, max-age=31536000, immutable` vão nas
duas respostas (a URL é versionada, logo imutável), mas `If-None-Match` só vira **304** numa
requisição **sem Range** — devolver 304 para um pedido de trecho quebra o buffer do
`<video>`. O helper de imagem **não** foi reusado: ele não conhece Range, e copiá-lo seria
plantar esse defeito.

---

## 7. Player

O mesmo motor. O que muda é quem decide o avanço:

| Tipo | Avanço |
|---|---|
| IMAGEM / MENU_BOARD | `setTimeout` com a duração do item |
| **VIDEO** | evento **`ended`** — nunca uma duração fixa |

- **um vídeo só** na playlist: `loop`, e a TV o repete;
- **falha** (erro de rede, decode, `play()` rejeitado): marca `v:<id>:<versao>` como falhado e
  avança. A chave inclui a **versão** — arquivo novo merece chance nova;
- **watchdog de stall**: se `currentTime` não avançar por **12 s** com o vídeo supostamente
  tocando, é falha. Um vídeo longo funcionando avança o `currentTime`; um travado não. A
  distinção é essa, e não o tempo total;
- **pré-carregamento**: `preload="metadata"` no elemento em tela e **nada** para os próximos
  — nunca `<video preload="auto">` oculto baixando a playlist inteira;
- **personalização não toca o vídeo**: como a arte estática, ele é exibido como foi criado.

**Agenda**: decide se o vídeo **pode começar**. Se `fimEm` passar durante a reprodução, ele
**termina** — cortar no meio é pior do que exibir 20 s além da janela. Na volta seguinte ele
já não é elegível.

---

## 8. Riscos e dívidas

| Item | Nota |
|---|---|
| Nginx não ajustado | upload falha com 413 **antes** do Node; está em §3 e no relatório |
| Codec não verificado | sem ffprobe. O admin recomenda H.264 e o player trata falha de decode |
| Órfãos | rota de manutenção explícita; nenhuma varredura automática |
| Backup | o dump do banco **não** leva os vídeos. `PDV_MEDIA_DIR` precisa entrar na rotina de backup do VPS — registrado |
| Fora do V1 | áudio, volume, YouTube/Vimeo/URL externa, HLS/DASH, transcodificação, legendas, thumbnail, Service Worker, TV vertical, analytics |
