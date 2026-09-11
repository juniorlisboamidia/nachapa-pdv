// Segurança de tenant das rotas públicas do aparelho (regra do Junior, 2026-09-10):
// NADA de identidade vem do corpo da requisição. As rotas `/api/public/aparelho/*`
// rodam FORA do tenantStore, então o `where` de cada consulta é montado por estas
// duas funções puras — e elas só olham o aparelho resolvido pelo cookie:
//   `filtroAparelhoDoCookie(hash)` → acha o aparelho pelo hash da credencial;
//   `escopoEmpresa(aparelho)`      → { empresaId } do aparelho, nunca do payload.
// Este arquivo prova as funções; as linhas de rota que as usam estão no relatório
// da task (server.js: resolverAparelhoPorCookie, /eu, /heartbeat, /parear).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtroAparelhoDoCookie, escopoEmpresa, hashCredencial, TIPOS_APARELHO } from './aparelhos.js';

// Aparelho da loja 3 (o que o cookie resolveu).
const aparelho = { id: 7, empresaId: 3, nome: 'Totem da frente', tipo: 'TOTEM', ativo: true };

// Corpos hostis que um tablet (ou qualquer um com o cookie) poderia mandar.
const PAYLOADS_HOSTIS = [
  { empresaId: 99 },
  { empresaId: '99' },
  { clienteId: 'outro-cliente' },
  { dispositivoId: 12345 },
  { aparelhoId: 12345, empresaId: 0, clienteId: 'admin' },
  { empresa: { id: 99 }, loja: 99 },
];

test('escopoEmpresa devolve só o empresaId do aparelho resolvido', () => {
  assert.deepEqual(escopoEmpresa(aparelho), { empresaId: 3 });
  assert.deepEqual(Object.keys(escopoEmpresa(aparelho)), ['empresaId']);
});

test('escopoEmpresa ignora qualquer empresaId/clienteId do payload', () => {
  for (const corpo of PAYLOADS_HOSTIS) {
    // O escopo é função APENAS do aparelho: o corpo não entra na conta.
    const escopo = escopoEmpresa(aparelho);
    assert.deepEqual(escopo, { empresaId: 3 }, JSON.stringify(corpo));
    assert.equal(escopo.empresaId, aparelho.empresaId);
    assert.ok(!('clienteId' in escopo));
    assert.ok(!('dispositivoId' in escopo));
  }
});

test('where do /heartbeat e do /eu: id do aparelho + empresaId do aparelho', () => {
  // É este o objeto que as rotas passam ao Prisma (updateMany/findUnique).
  const whereHeartbeat = { id: aparelho.id, ...escopoEmpresa(aparelho) };
  assert.deepEqual(whereHeartbeat, { id: 7, empresaId: 3 });
  const whereLoja = { id: escopoEmpresa(aparelho).empresaId };
  assert.deepEqual(whereLoja, { id: 3 });
  // Trocar o aparelho troca a loja — e é o único jeito de trocar.
  assert.deepEqual(escopoEmpresa({ ...aparelho, empresaId: 4 }), { empresaId: 4 });
});

test('filtroAparelhoDoCookie: identidade = hash da credencial, aparelho ativo, tipo do totem', () => {
  const hash = hashCredencial('credencial-de-teste');
  const filtro = filtroAparelhoDoCookie(hash);
  assert.deepEqual(filtro, { credencialHash: hash, ativo: true, tipo: { in: TIPOS_APARELHO } });
  // Nada de id/empresaId/clienteId: quem manda é o cookie.
  assert.deepEqual(Object.keys(filtro).sort(), ['ativo', 'credencialHash', 'tipo']);
  // Fail-closed: PONTO/ETIQUETA (legados) nunca entram por aqui.
  assert.ok(!filtro.tipo.in.includes('PONTO'));
  assert.ok(!filtro.tipo.in.includes('ETIQUETA'));
  // Aparelho desativado no admin não resolve mais.
  assert.equal(filtro.ativo, true);
});

test('filtroAparelhoDoCookie: credencial diferente = filtro diferente (não vaza entre aparelhos)', () => {
  const a = filtroAparelhoDoCookie(hashCredencial('cred-A'));
  const b = filtroAparelhoDoCookie(hashCredencial('cred-B'));
  assert.notEqual(a.credencialHash, b.credencialHash);
});
