# Servidor de ingest do coletor DIXI (Ponto Facial)

**Data:** 2026-07-13 · Repo: `nachapa-pdv`
**Objetivo:** receber as batidas do coletor DIXI Facial 40 e gravá-las como `PontoRegistro` (alimenta Espelho → Bonificação), largando o software pago da DIXI.

## Protocolo (capturado em produção — ver savepoint_ponto_facial_pdv)
WebSocket em `ws://<VPS>:7788/pub/chat`. Fluxo: device manda `{"cmd":"reg","sn":"AYTG04073202","devinfo":{...}}` → servidor responde `{"ret":"reg","result":true,"cloudtime":"YYYY-MM-DD HH:MM:SS","nosenduser":true}` → device manda `{"cmd":"sendlog","sn":"...","count":N,"logindex":0,"record":[{"enrollid":1,"name":"Junior Lisboa","time":"2026-07-13 03:16:36","mode":8,"inout":0,"event":0}]}` → servidor responde `{"ret":"sendlog","result":true,"count":N,"logindex":0,"cloudtime":"..."}`. **Sem ACK, o device REENVIA** (não perde). `time` em BR/UTC-3; `inout:0`=não distingue entrada/saída (o Espelho resolve pela sequência). Batida traz **enrollid+name, NÃO CPF**.

## Decisões (AskUserQuestion)
- Casar batida: **auto pelo nome na 1ª vez** (grava o `enrollidColetor`) + ajuste manual.
- Batida órfã (enrollid sem match): **fila de pendências** (não perde; admin vincula depois → vira ponto).
- Autorização: **só serial autorizado** — serial novo auto-cadastra um `Dispositivo` PENDENTE (inativo); só grava depois que o admin ativa. Enquanto pendente, NÃO responde ACK do sendlog (device retém e reenvia).

## 1. Schema (migration)
- `Funcionario.enrollidColetor Int?` + `@@unique([empresaId, enrollidColetor])`.
- `Dispositivo.serialColetor String? @unique` (o `sn`; NULL nos dispositivos-tablet existentes).
- `PontoRegistro.coletorRef String? @unique` (dedup = `sn:enrollid:time`); origem passa a aceitar `COLETOR`.
- **`model ColetorBatidaPendente`**: `id, empresaId, dispositivoId?, serial, enrollid Int, nome String?, dataHora DateTime, coletorRef String @unique, resolvidoEm DateTime?, criadoEm`. `@@index([empresaId, resolvidoEm])`.
- MODELS_TENANT += `coletorBatidaPendente` (se o PDV usa tenant-guard; conferir).

## 2. `backend/coletorServer.js` (novo) — servidor WS na 7788 (net puro, sem lib)
`iniciarColetorServer(prisma)`: `net.createServer` → handshake WS (101) → parse de frames (código do grampo v3) → por frame text JSON:
- **reg:** acha `Dispositivo{serialColetor:sn}`. Se não existe → cria PENDENTE (`ativo:false`, `nome:'Coletor '+sn`, `empresaId` da primeira empresa/heurística). Responde ACK reg sempre. Guarda `{dispositivo}` na conexão. `ultimaSync`.
- **sendlog:** se dispositivo ausente/`ativo:false` → **não** responde ACK (retém). Se ativo: ordena `record` por `time` asc; para cada:
  - `coletorRef = sn:enrollid:time`; se já há `PontoRegistro` ou `ColetorBatidaPendente` com esse ref → pula (dedup).
  - casa `enrollid`→`Funcionario` (por `enrollidColetor`; senão por **nome normalizado** e grava `enrollidColetor` = auto-aprende).
  - casou → `tipo = proximoTipoPontoNaData(func, empresaId, dataHora)` (sequência considerando **o dia da batida**, não hoje); grava `PontoRegistro{origem:'COLETOR', dispositivoId, dataHora, coletorRef}`.
  - não casou → grava `ColetorBatidaPendente{...coletorRef}`.
  - Responde ACK sendlog (`ret:sendlog,result:true,count,logindex,cloudtime`).
- Helpers: `wsAccept`, `parseFrames`, `encodeFrame`, `cloudtimeBR` (UTC-3), `normalizarNome`. `proximoTipoPontoNaData` = variante de `proximoTipoPonto` usando o dia BR de `dataHora` (via `brFields`).
- Robustez: try/catch por conexão/record; log estruturado; nunca derruba o processo.

## 3. `backend/server.js` — integra + admin
- Após o `app.listen(PORT)`: `require('./coletorServer').iniciar(prisma)` (porta 7788). Env `COLETOR_PORT` (default 7788); `COLETOR_ENABLED` p/ desligar em dev.
- Endpoints (admin, autenticado): `GET /api/ponto/coletores` (Dispositivos com serialColetor + status) · `PUT /api/ponto/coletores/:id/ativar {ativo}` · `GET /api/ponto/coletor/pendencias` (não resolvidas) · `POST /api/ponto/coletor/pendencias/vincular {enrollid, funcionarioId}` (seta `enrollidColetor` no func + converte as pendências daquele enrollid em `PontoRegistro`) · `PUT /api/ponto/colaboradores/:id/enrollid {enrollid|null}`.

## 4. Frontend (PDV) — aba/gestão do coletor
Aba nova em Ponto Facial (ex.: "Coletor") ou seção em Configurações: (a) **Coletores** (serial + ativar/desativar) · (b) **Pendências** (enrollid+nome+data → botão Vincular a funcionário) · (c) `enrollidColetor` visível/editável na aba **Colaboradores**.

## Deploy PDV (COMPLETO, com migration + porta)
`git pull` → `npx prisma migrate deploy` → `npx prisma generate` → build front → `pm2 restart pdv-backend`. **Abrir a porta 7788 no VPS** (ufw + painel). Apontar o coletor pra `198.199.73.63:7788` (HTTPS Não), **ativar o Dispositivo** que auto-cadastrar, e conferir as batidas.

## Verificação
- `node --check` server+coletorServer; migration aplica no dev PDV; um `sendlog` sintético (via um cliente WS de teste) grava `PontoRegistro`/pendência com dedup; reenvio não duplica; device inativo não grava.
