# Banners do Totem — V1

**Data:** 2026-09-13 · **Repo:** `nachapa-pdv` · **Escopo:** Loja Digital › Totem › Aparência › Banners, e a Tela de espera do quiosque.

**Objetivo:** a tela de espera passa a exibir arte promocional da loja. O toque continua significando **só** "começar uma sessão" — nenhum banner leva a produto, categoria ou cupom no V1. Sem banner elegível, a espera institucional de hoje continua sendo o fallback.

---

## 1 · O que a investigação encontrou

**Mídia no PDV é, hoje, `data URL` em coluna `TEXT`.** Precedentes: `Empresa.logoDataUrl`, `Empresa.logoPublicaDataUrl`, a foto do Checklist, a da Bonificação e a logo do totem (A4). **Não existe upload em disco em lugar nenhum** — nem `multer`, nem `writeFile`, nem diretório servido estaticamente. Não existe `Bytes` no schema.

**O `deploy.sh` não apaga nada** (`git pull --ff-only`, `npm install`, `prisma generate`, `migrate deploy`, build, `pm2 restart`). Mesmo assim não há diretório persistente combinado, e `tmp/` está no `.gitignore` — qualquer coisa que eu inventasse ali seria uma convenção nova, sem backup e sem quem a conheça.

**Fuso:** o PDV usa `America/Sao_Paulo` em **um** ponto (`server.js:2215`), para calcular "hoje". Não existe fuso por loja, nem coluna, nem configuração.

**Componentes prontos:** `ConfirmDialog` (open/title/message/description/variant/loading/onConfirm/onCancel) e `Toast`. Não há biblioteca de drag-and-drop.

**Limites:** `express.json({ limit: '5mb' })`. O Nginx não é verificável daqui; o padrão, quando ninguém configurou, é 1 MB — foi o que dimensionou o teto da logo (300 KB) na A4.

**HUB, só como referência de produto:** o módulo Banner/Vídeo/Roleta tem nome, ativo, agenda, prioridade, imagem, prévia e métricas. Do conceito, o V1 aproveita **nome, ativo, ordem, agenda e prévia**. Métricas, CTA e roleta ficam fora. **Nenhum import, FK, chamada ou dependência de runtime** — o domínio do totem é próprio.

**Cardápio Web:** não participa. Banner é arte da loja, não item de cardápio. Nada a alterar lá.

---

## 2 · Arquitetura escolhida

### Armazenamento: `Bytes` no Postgres, em tabela separada

Avaliei as três opções:

| Opção | Por que não / por que sim |
|---|---|
| Filesystem persistente | Exigiria inventar um diretório fora do repo, combinar backup, e tratar deploy, permissão e limpeza órfã. Infra nova para o primeiro caso de uso. |
| Infra de mídia existente | **Não existe** no PDV. O Supabase é do HUB, e usá-lo criaria exatamente a dependência que esta frente proíbe. |
| **Bytes no banco** | Segue o precedente (mídia no Postgres), entra no backup que já existe, é transacional com o registro e não inventa infra. |

Data URL foi descartado: infla 33% à toa. `Bytes` guarda o arquivo como ele é.

**A imagem mora em tabela PRÓPRIA (`TotemBannerImagem`), 1:1 com o banner.** Não é purismo: a listagem do admin lê `TotemBanner` a cada abertura, e um `findMany` sem `select` numa tabela com blob traria vinte artes de 400 KB para a memória. Com a tabela separada, esse erro é **impossível** em vez de improvável.

### Agenda e relógio

O admin manda **instantes absolutos** (`toISOString()` do `datetime-local`, convertido no navegador). O banco guarda `DateTime`. **Nunca se compara data em texto nem se assume o fuso do VPS.**

O bootstrap entrega `agoraServidor`. O quiosque calcula um **offset** contra o próprio relógio na chegada do bootstrap e usa `Date.now() + offset` para decidir elegibilidade. Assim um tablet com relógio errado — cenário real em Android sem rede — continua acertando a janela, e um banner que começa às 18:00 entra **na hora**, sem esperar o próximo bootstrap.

### Cache da imagem

O mesmo mecanismo da logo (A4), pelo mesmo motivo: `private, max-age=31536000, immutable` + `ETag` com `empresaId` na marca + `Vary: Cookie`. A URL é versionada (`?v=`), e `imagemVersao` sobe **só** quando os bytes mudam.

---

## 3 · Model

```prisma
model TotemBanner {
  id               Int       @id @default(autoincrement())
  empresaId        Int
  nome             String
  ativo            Boolean   @default(true)
  ordem            Int       @default(0)
  duracaoSegundos  Int       @default(6)
  inicioEm         DateTime?
  fimEm            DateTime?
  imagemVersao     Int       @default(0)
  imagemTipo       String?
  imagemBytes      Int?      // tamanho, para a tela mostrar sem carregar o blob
  criadoEm         DateTime  @default(now())
  atualizadoEm     DateTime  @updatedAt
  imagem           TotemBannerImagem?
  @@index([empresaId, ordem])
}

model TotemBannerImagem {
  bannerId Int    @id
  dados    Bytes
  banner   TotemBanner @relation(fields: [bannerId], references: [id], onDelete: Cascade)
}
```

`onDelete: Cascade` resolve a consistência DB↔mídia: apagar o banner apaga a arte **na mesma transação do banco**. Não há arquivo órfão possível, porque não há arquivo.

---

## 4 · Contratos

**Admin** (área `aparelhos`, já coberta pelo prefixo `/totem`):

| Rota | O quê |
|---|---|
| `GET /api/totem/banners` | lista, com status derivado |
| `POST /api/totem/banners` | cria (nome + imagem obrigatórios) |
| `PUT /api/totem/banners/:id` | edita nome, ativo, duração, agenda |
| `PUT /api/totem/banners/:id/imagem` | substitui a arte, `imagemVersao += 1` |
| `PUT /api/totem/banners/ordem` | reordena em lote |
| `DELETE /api/totem/banners/:id` | exclui |
| `GET /api/totem/banners/:id/imagem` | bytes, para a prévia do admin |

**Público** (cookie do aparelho → empresa; `empresaId` do corpo **nunca** é autoridade):

- `GET /api/public/aparelho/totem/banner/:id/imagem?v=N` — bytes.
- Bootstrap ganha bloco `banners: { agoraServidor, itens: [...] }`, com metadados e **nenhum byte**, com `catch` próprio.

---

## 5 · Regras

**Elegibilidade:** `ativo` **e** dentro da janela. Sem início e sem fim = sempre; só início = a partir dele; só fim = até ele. `fim <= início` é **entrada inválida** (400).

**Duração:** padrão 6 s, faixa 3–60 s. Fora da faixa é grampeado na leitura e recusado na escrita — mesma divisão rigor/tolerância da aparência.

**Carrossel:** 0 elegíveis → espera institucional. 1 → estático. 2+ → rotação pela duração de cada um. Timers próprios, que **não** encostam em ociosidade, `MS_AMBIGUO` nem sessão; limpos ao sair de `espera` e recriados ao voltar.

**Falha de mídia:** a imagem que não carrega é pulada; se todas falharem, cai no institucional. A espera nunca fica preta.

**A chamada "TOQUE PARA COMEÇAR" não depende da arte:** vai sobre um degradê próprio, com superfície e contraste garantidos por CSS. Arte toda branca ou toda preta não a apaga.

---

## 6 · Testes

Puros: elegibilidade (janela aberta, futura, expirada, limites), duração, validação de imagem e MIME real por **magic bytes**, ordenação, offset de relógio, status derivado, versão da imagem. Integração: as rotas críticas com isolamento entre duas empresas.

---

## 7 · Deploy

🔴 Leva migration (aditiva, duas tabelas novas). `bash deploy.sh` já roda `migrate deploy`.
