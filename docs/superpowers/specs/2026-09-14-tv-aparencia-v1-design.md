# TV Indoor — Aparência V1: investigação, arquitetura e decisões

**Data:** 2026-09-14 · **Canal:** Loja Digital › TV Indoor · **Estado:** implementado nesta frente.

Dar ao canal uma **identidade visual própria** — seis cores e uma logo — que alcança o
fallback institucional e os três layouts de Menu Board. **Arte enviada pelo gestor não é
tocada:** uma imagem 1920×1080 continua sendo exibida como foi criada.

---

## 1. Investigação

### 1.1 Como o player define aparência hoje

| Peça | Hoje | Depois |
|---|---|---|
| `.tv-raiz` | `background: #000` literal | token `fundo` |
| `.tv-institucional` | radial-gradient fixo + `.tv-inicial` em `#d79e00` | `fundo` + `destaque` + `textoDestaque` |
| `.tv-nome` | branco a 86% | derivado de `texto` |
| `.tvmb-caixa` | **já declara seis custom properties** (`--tvmb-fundo`, `-superficie`, `-texto`, `-texto-2`, `-destaque`, `-linha`) com literais da marca | as mesmas, escritas por CSSOM |
| Logo | `loja.logoDataUrl` (da **Empresa**, via `/eu`) | logo própria → Empresa → inicial |

**Achado que encurtou a frente:** os três layouts **já consomem tokens**. A grade, a lista e
o destaque leem `var(--tvmb-*)` em toda cor que importa. Não foi preciso reescrever layout
nenhum — só passar a escrever nessas propriedades.

### 1.2 O que era reutilizável, e o que estava acoplado

`backend/totemAparencia.js` tinha um miolo genuinamente neutro misturado com produto do totem:

| Peça | Natureza | Destino |
|---|---|---|
| `normalizarCor` (hex 3/6, sem alpha) | técnica | **`backend/cores.js`** (novo) |
| `validarPaleta` / `sanitizarPaleta` | técnica, faltava parametrizar as chaves | **`cores.js`**, com `chaves` por parâmetro |
| luminância sRGB, `contraste`, `diagnosticar` | técnica, faltava parametrizar os pares | **`cores.js`**, com `pares` por parâmetro |
| `CHAVES` (fundo, **cartao**, acaoFundo…), `PARES`, `PADROES_POR_LAYOUT` | **produto do totem** | ficam onde estão |
| `frontend/.../totemTema.js` — `propriedadesDe` com dupla filtragem | técnica | **`frontend/src/lib/temaCssom.js`** (novo), com o mapa por parâmetro |

`totemAparencia.js` e `totemTema.js` passaram a **delegar**, com a API pública intacta — os
testes existentes dos dois provam que o totem não mudou de comportamento.

### 1.3 Logo

`Empresa.logoDataUrl` é da **empresa**, não do totem — serve de fallback neutro e já chega
ao aparelho pelo `/eu`. O totem guarda a logo própria **dentro da linha de configuração**
(`TotemConfiguracao.logoDataUrl`), o que faz toda leitura da configuração arrastar a imagem.
A TV **não repete isso**: bytes em tabela própria, como `TvConteudoImagem`.

**Precedência:** logo do TV Indoor → `Empresa.logoDataUrl` → inicial do nome num disco.
Nunca a logo do totem.

**Tratamento por origem:** a logo própria da TV é feita para a televisão e pode ter
transparência — vai direto sobre o fundo, sem placa. A da Empresa costuma vir de material
impresso com fundo branco; sobre um fundo escuro ela ganha uma **placa clara discreta**,
exatamente como o totem resolveu o mesmo problema. A decisão é da ORIGEM, não do arquivo.

---

## 2. Fronteira TV ↔ Totem

Nenhuma leitura de `TotemConfiguracao`, nenhum token `--tq-*`/`--ds-*`, nenhum CSS do totem,
nenhum import de `totemAparencia.js`/`totemTema.js`. Um teste varre o canal e o módulo puro
para provar isso. Se o Totem sumisse do repositório, a TV continuaria funcionando.

O que se divide é **técnico**: `cores.js` e `temaCssom.js` não sabem o que é totem nem TV.

---

## 3. Schema e migration

`20260929120000_tv_aparencia_v1` — aditiva e idempotente, depois de `20260928120000`.

```prisma
model TvIndoorConfiguracao {
  id, empresaId @unique, tokens Json?,          // overrides ESPARSOS, chaves de domínio
  logoVersao Int @default(0), logoTipo String?, logoBytes Int?,
  criadoEm, atualizadoEm
  logo TvIndoorLogo?                             // bytes FORA da linha
}
model TvIndoorLogo { configuracaoId @id, dados Bytes, cascade }
```

`tokens` guarda **só chaves de domínio** — `fundo`, `superficie`, `texto`, `textoApoio`,
`destaque`, `textoDestaque`. Nunca `--tvmb-fundo`: o banco não conhece implementação visual,
e renomear um token da folha não pode invalidar a configuração das lojas.

---

## 4. Contrato dos tokens

**Defaults próprios**, embarcados em `tvIndoorAparencia.js` — os mesmos valores visuais que
a TV já mostrava, para ninguém acordar com a parede diferente, mas agora pertencentes ao
domínio da TV.

| Escrita (PUT) | Efeito |
|---|---|
| chave omitida | não altera |
| `"#rrggbb"` / `"#rgb"` | cria/altera override (normalizado para 6 dígitos minúsculos) |
| `null` | **remove** o override e volta ao padrão |
| chave desconhecida | **400** |
| cor inválida | **400** |

**Leitura**: tolerante. Dado antigo, escrito à mão ou corrompido é sanitizado e cai no
default — a TV nunca quebra por causa de um valor torto no banco.

`null` é operação só no PATCH; para a validação de cor, `null` continua não sendo cor. São
camadas diferentes, e afrouxar a régua faria um campo vazio apagar a escolha da loja.

---

## 5. Logo e cache

`GET /api/public/aparelho/tv/aparencia/logo?v=N` — os mesmos invariantes já validados:
versão **no WHERE** (`?v=` de outra geração → 404, nunca bytes atuais sob número velho),
`Content-Type` do MIME real lido dos bytes, ETag com empresa e versão,
`Cache-Control: private, max-age=31536000, immutable`, `Vary: Cookie`, empresa pelo cookie.

`logoVersao` sobe ao **trocar** e ao **remover**. Editar cores **não** mexe nela.

---

## 6. Endpoints

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/tv-indoor/aparencia` | `padroes`, `overrides`, `efetivas`, `contraste[]`, `logo{tem,versao,origem,url}` |
| PUT | `/api/tv-indoor/aparencia` | patch esparso dos tokens |
| PUT | `/api/tv-indoor/aparencia/logo` | troca os bytes (sobe a versão) |
| DELETE | `/api/tv-indoor/aparencia/logo` | remove (sobe a versão) |
| GET | `/api/tv-indoor/aparencia/logo` | bytes para a prévia do admin |

Público: bloco `aparencia` **dentro de `/tv/programacao`** — sem bytes, sem id interno, sem
metadado administrativo. Um endpoint separado custaria uma segunda ida de rede a cada
minuto para um objeto de sete campos.

---

## 7. Segurança de CSS

Allowlist explícita de seis entradas em `frontend/src/components/tvIndoorTema.js`, aplicada
**só** por `style.setProperty()`. Nenhuma `<style>` montada com string, nenhum
`dangerouslySetInnerHTML`, nenhuma chave do banco virando nome de propriedade. O valor passa
por hexadecimal canônico no último portão, que não confia no servidor.

Uma sétima propriedade é escrita — `--tvmb-linha`, a divisória da lista — **derivada em JS**
do token `texto` em `rgba(...)`. O nome é fixo no código e o valor sai de um hex validado;
nada arbitrário atravessa. Sem isso, a divisória branca a 14% desapareceria num fundo claro.

---

## 8. Contraste

Cinco pares: texto×fundo, texto×superfície, apoio×fundo, apoio×superfície,
textoDestaque×destaque. Baixo contraste é **aviso**, nunca bloqueio — a TV aceita a decisão
do gestor. A frase é humana ("pode ficar difícil de ler na TV"), não um relatório WCAG.

---

## 9. Atualização ao vivo e último estado bom

A aparência **não entra na assinatura** da programação: mudar uma cor redesenha o Menu Board
no lugar, sem reiniciar a playlist — a mesma filosofia já usada para preço. Trocar a logo
muda a URL versionada, e a TV busca a nova sem recarregar o navegador.

O player guarda a **última aparência válida** em estado próprio: um refresh que falha (ou que
volta sem o bloco) mantém o tema que está na tela. Defaults são para cold start e para
configuração ausente — nunca para apagar o visual por queda de rede.

---

## 10. Riscos e dívidas

| Risco / dívida | Nota |
|---|---|
| Deploy sem migration | leituras com `.catch` próprio → a TV usa defaults, nunca erro na parede |
| `superficie` padrão é transparente | o card do menu board não tem caixa hoje; configurar a cor passa a desenhá-la — é o que "superfície" significa |
| Fita mantém cor própria | **de propósito**: "Oferta" é verde porque é oferta, não porque é da marca. Sobrescrever com o destaque apagaria a semântica |
| Fora do V1 | fonte, gradiente, borda, sombra, animação, tema claro/escuro, config por aparelho, TV vertical, importar identidade do Totem/HUB |
