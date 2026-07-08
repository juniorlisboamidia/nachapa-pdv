// Copia UMA loja (o Hamburgão) do banco do H360 (ORIGEM) para o banco próprio do
// PDV/Operação (DESTINO). Preserva os ids (Empresa + FKs batem de primeira).
//
// Uso (em backend/, com SRC_DATABASE_URL e DATABASE_URL no .env):
//   npm run copiar-hamburgao          → detecta a loja por nome (~ "hamburg")
//   npm run copiar-hamburgao -- 3     → força o empresaId de origem = 3
//
// Requisitos: o schema do DESTINO já criado (npx prisma migrate deploy) e o usuário
// do DESTINO com permissão de 'SET session_replication_role' (ex.: superusuário
// postgres — o caso do Postgres local). Idempotente (ON CONFLICT DO NOTHING).
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const SRC = process.env.SRC_DATABASE_URL;
const DEST = process.env.DATABASE_URL;

// Empresa primeiro; o resto em qualquer ordem (FKs desligadas no destino durante a carga).
const TABELAS = [
  'Empresa',
  'Insumo', 'ReceitaProducao', 'ReceitaProducaoItem', 'Produto', 'ComboItem', 'ComboInsumo',
  'FichaTecnicaItem', 'ConfiguracaoPrecificacao', 'CustoFixo', 'CustoVariavel', 'FaturamentoDiario',
  'AnaliseVenda', 'EscalaMotoboy', 'EscalaMotoboyDia', 'EscalaMotoboyInscricao', 'Motoboy',
  'MotoboyOcorrencia', 'AvaliacaoCampanha', 'AvaliacaoResposta',
  'IndicacaoConfig', 'Promotor', 'Indicacao', 'RecompensaTier', 'Cupom',
  'Cargo', 'Vaga', 'Candidato', 'ExperienciaProfissional', 'Candidatura', 'CandidatoHistorico',
  'AvaliacaoCandidato', 'ContatoCandidato', 'EntrevistaCandidato', 'RecrutamentoTag', 'RecrutamentoConfig', 'ScoreHistorico',
  'Funcionario', 'BonificacaoConfig', 'BonificacaoTipoOcorrencia',
  'BonificacaoOcorrencia', 'BonificacaoColetiva', 'BonificacaoFechamento',
  'BonificacaoNivel', 'BonificacaoXp', 'Conquista', 'ConquistaDesbloqueada',
  'BonificacaoMoeda', 'MercadoItem', 'MercadoResgate',
];

const ident = (n) => '"' + String(n).replace(/"/g, '') + '"';

async function colMeta(client, tabela) {
  const r = await client.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = $1`,
    [tabela],
  );
  const m = {};
  for (const c of r.rows) m[c.column_name] = { dataType: c.data_type, udt: c.udt_name };
  return m;
}
// json/jsonb precisam ir como string; arrays/Date/números/bool o pg trata nativamente.
function serialize(val, meta) {
  if (val === null || val === undefined) return null;
  if (meta && (meta.udt === 'json' || meta.udt === 'jsonb')) return JSON.stringify(val);
  return val;
}

async function main() {
  if (!SRC || !DEST) throw new Error('Defina SRC_DATABASE_URL (H360) e DATABASE_URL (PDV) no backend/.env');
  const src = new Client({ connectionString: SRC });
  const dest = new Client({ connectionString: DEST });
  await src.connect();
  await dest.connect();
  try {
    const arg = process.argv[2] ? Number(process.argv[2]) : null;
    let empresaId = arg;
    if (!empresaId) {
      const r = await src.query(`SELECT id, nome FROM "Empresa" WHERE nome ILIKE '%hamburg%' ORDER BY id ASC LIMIT 1`);
      if (!r.rows.length) throw new Error('Não achei a loja "Hamburgão" na origem. Rode com o id: npm run copiar-hamburgao -- <id>');
      empresaId = r.rows[0].id;
      console.log(`Loja de origem: #${empresaId} — ${r.rows[0].nome}`);
    }

    await dest.query(`SET session_replication_role = replica`); // desliga FK/triggers durante a carga
    let total = 0;
    for (const tabela of TABELAS) {
      const filtro = tabela === 'Empresa' ? `WHERE id = $1` : `WHERE "empresaId" = $1`;
      let rows;
      try {
        rows = (await src.query(`SELECT * FROM ${ident(tabela)} ${filtro}`, [empresaId])).rows;
      } catch (e) {
        console.warn(`  (pulando ${tabela}: ${e.message})`);
        continue;
      }
      if (!rows.length) continue;
      const meta = await colMeta(src, tabela);
      const cols = Object.keys(rows[0]);
      const colList = cols.map(ident).join(', ');
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      for (const row of rows) {
        const vals = cols.map((c) => serialize(row[c], meta[c]));
        await dest.query(`INSERT INTO ${ident(tabela)} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
      }
      total += rows.length;
      console.log(`  ${tabela}: ${rows.length}`);
    }
    await dest.query(`SET session_replication_role = origin`);

    // Reseta as sequences (senão novos inserts colidiriam com ids copiados).
    const seqs = await dest.query(`
      SELECT quote_ident(t.relname) AS tbl, quote_ident(a.attname) AS col, s.relname AS seq
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S'
    `);
    for (const s of seqs.rows) {
      await dest.query(`SELECT setval('${s.seq}', COALESCE((SELECT MAX(${s.col}) FROM ${s.tbl}), 1))`);
    }

    console.log(`\n✅ ${total} linhas copiadas. Sequences ajustadas.`);
  } finally {
    await src.end();
    await dest.end();
  }
}

main().catch((e) => { console.error('❌ FALHOU:', e.message); process.exit(1); });
