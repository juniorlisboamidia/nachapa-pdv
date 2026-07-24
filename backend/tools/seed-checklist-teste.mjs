// Cria UM checklist de teste "Diária" atribuído a uma FUNÇÃO (padrão: Gerente), pra
// ver o painel "Seu dia" da Área do Colaborador com número real. Idempotente: se já
// existir um checklist com o mesmo nome na empresa, não duplica.
//
// Uso (em backend/, com DATABASE_URL no .env):
//   node tools/seed-checklist-teste.mjs            → função "Gerente"
//   node tools/seed-checklist-teste.mjs Chapeira   → outra função
//
// pg cru de propósito (mesmo padrão do scripts/copiar-hamburgao.mjs) — não depende do
// client Prisma/TS. Escopo por empresaId explícito (fora de qualquer tenantStore).
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const FUNCAO = (process.argv[2] || 'Gerente').trim();
const NOME = 'Checklist de Teste (Diária)';

// recorrenciaConfig: DIÁRIA vence todo dia (diasSemana vazio não importa p/ DIÁRIA).
// horarioLimite 23:00 = deadline de fim de dia (não dispara lembrete cedo).
const REC = { diasSemana: [], horarioLimite: '23:00', toleranciaMin: 15 };

// Itens variados, todos com shape de config confirmado no código (min/max/unidade do
// NUMÉRICO; dica/instrucaoAlerta comuns). SELEÇÃO ficou de fora (opcoes são objetos).
const ITENS = [
  { tipo: 'CHECK',    titulo: 'Bancada higienizada e organizada', critico: true,  config: { dica: 'Passe pano e álcool antes de começar o turno.' } },
  { tipo: 'CHECK',    titulo: 'Uniforme e EPIs em ordem',         critico: false, config: null },
  { tipo: 'NUMERICO', titulo: 'Temperatura do freezer',           critico: true,  config: { min: -25, max: -15, unidade: '°C', instrucaoAlerta: 'Fora da faixa: avise a liderança na hora.' } },
  { tipo: 'FOTO',     titulo: 'Foto da área de produção',         critico: true,  config: { dica: 'Enquadre a bancada inteira.' } },
  { tipo: 'TEXTO',    titulo: 'Alguma observação do turno?',      critico: false, config: null },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Empresa: a de um Funcionário ATIVO com essa função (é a loja do colaborador de
    // teste); senão a primeira empresa.
    const porFunc = await client.query(
      `SELECT "empresaId" FROM "Funcionario" WHERE lower(coalesce("funcao",'')) = lower($1) AND status = 'ATIVO' ORDER BY id LIMIT 1`,
      [FUNCAO],
    );
    let empresaId = porFunc.rows[0]?.empresaId;
    if (!empresaId) {
      const emp = await client.query(`SELECT id FROM "Empresa" ORDER BY id LIMIT 1`);
      empresaId = emp.rows[0]?.id;
    }
    if (!empresaId) throw new Error('Nenhuma empresa encontrada no banco.');
    const nomeEmp = (await client.query(`SELECT nome FROM "Empresa" WHERE id = $1`, [empresaId])).rows[0]?.nome || `empresa ${empresaId}`;

    const existe = await client.query(`SELECT id FROM "Checklist" WHERE "empresaId" = $1 AND nome = $2 LIMIT 1`, [empresaId, NOME]);
    if (existe.rows[0]) {
      console.log(`Já existe "${NOME}" (id ${existe.rows[0].id}) em "${nomeEmp}". Nada a fazer.`);
      return;
    }

    const ins = await client.query(
      `INSERT INTO "Checklist"
        ("empresaId", nome, categoria, descricao, prioridade, "atribuicaoTipo", funcoes, "funcionarioIds", "recorrenciaTipo", "recorrenciaConfig", "tempoEstimadoMin", ativo, "atualizadoEm")
       VALUES ($1,$2,$3,$4,$5::"PrioridadeChecklist",'FUNCAO',$6::text[],'{}'::int[],'DIARIA'::"RecorrenciaTipo",$7::jsonb,$8,true,now())
       RETURNING id`,
      [empresaId, NOME, 'Operação', 'Checklist de teste pra ver o painel "Seu dia".', 'MEDIA', [FUNCAO], JSON.stringify(REC), 5],
    );
    const checklistId = ins.rows[0].id;

    for (let i = 0; i < ITENS.length; i++) {
      const it = ITENS[i];
      await client.query(
        `INSERT INTO "ChecklistItem" ("empresaId", "checklistId", ordem, tipo, titulo, critico, config)
         VALUES ($1,$2,$3,$4::"TipoItemChecklist",$5,$6,$7::jsonb)`,
        [empresaId, checklistId, i, it.tipo, it.titulo, it.critico, it.config ? JSON.stringify(it.config) : null],
      );
    }

    console.log(`✅ Criado "${NOME}" (id ${checklistId}) em "${nomeEmp}" · função ${FUNCAO} · ${ITENS.length} itens · DIÁRIA (deadline 23:00).`);
    console.log('   Abra a Área do Colaborador › Início: deve aparecer "Você tem 1 checklist para hoje".');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('Falhou:', e.message || e); process.exit(1); });
