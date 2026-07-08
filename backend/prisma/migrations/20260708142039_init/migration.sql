-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('INGREDIENTE', 'PRODUCAO_PROPRIA', 'BEBIDA', 'HORTIFRUTI', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "TipoUsoFicha" AS ENUM ('INGREDIENTE', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "FormaRateioFicha" AS ENUM ('POR_PRODUTO', 'POR_EMBALAGEM', 'POR_PEDIDO');

-- CreateEnum
CREATE TYPE "CategoriaCustoVariavel" AS ENUM ('TAXA_CARTAO', 'MARKETPLACE', 'EMBALAGEM', 'ENTREGA', 'IMPOSTO', 'CUPOM', 'COMISSAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "TipoCalculoCustoVariavel" AS ENUM ('PERCENTUAL_FATURAMENTO', 'VALOR_POR_PEDIDO', 'VALOR_FIXO_MENSAL_VARIAVEL');

-- CreateEnum
CREATE TYPE "EscalaStatus" AS ENUM ('ABERTA', 'FECHADA');

-- CreateEnum
CREATE TYPE "EscalaDiaStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "InscricaoStatus" AS ENUM ('INSCRITO', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InscricaoOrigem" AS ENUM ('PUBLICO', 'ADMIN');

-- CreateEnum
CREATE TYPE "MotoboyStatus" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "PresencaMotoboyStatus" AS ENUM ('PENDENTE', 'COMPARECEU', 'FALTOU', 'JUSTIFICOU');

-- CreateEnum
CREATE TYPE "MotoboyOcorrenciaTipo" AS ENUM ('NAO_COMPARECEU', 'ABANDONO', 'MOTO_QUEBROU', 'ATRASO', 'PREJUIZO', 'CONDUTA', 'ATENDIMENTO', 'OBSERVACAO_POSITIVA', 'OUTRO');

-- CreateEnum
CREATE TYPE "MotoboyOcorrenciaGravidade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "PromotorOrigem" AS ENUM ('PUBLICO', 'ADMIN');

-- CreateEnum
CREATE TYPE "PromotorTipo" AS ENUM ('CLIENTE', 'INFLUENCER', 'PARCEIRA');

-- CreateEnum
CREATE TYPE "PromotorStatus" AS ENUM ('ATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "IndicacaoStatus" AS ENUM ('PENDENTE', 'VALIDADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RecompensaDestino" AS ENUM ('SALAO', 'DELIVERY');

-- CreateEnum
CREATE TYPE "CupomTipo" AS ENUM ('INDICACAO', 'RECOMPENSA');

-- CreateEnum
CREATE TYPE "CupomStatus" AS ENUM ('DISPONIVEL', 'USADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "VagaStatus" AS ENUM ('ABERTA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "CandidatoStatus" AS ENUM ('NOVO', 'TRIAGEM', 'PRE_SELECIONADO', 'CONTATO_REALIZADO', 'ENTREVISTA_AGENDADA', 'TESTE_PRATICO', 'APROVADO', 'BANCO_TALENTOS', 'REPROVADO', 'SEM_RETORNO');

-- CreateTable
CREATE TABLE "Insumo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoInsumo" NOT NULL DEFAULT 'INGREDIENTE',
    "unidade" TEXT NOT NULL,
    "custoUnitario" DECIMAL(12,4) NOT NULL,
    "fornecedor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "considerarPerdaPreparo" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeBrutaPreparo" DOUBLE PRECISION,
    "quantidadeAproveitavelPreparo" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaProducao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "rendimento" DECIMAL(10,3) NOT NULL,
    "unidadeRendimento" TEXT NOT NULL,
    "modoRendimento" TEXT DEFAULT 'TOTAL',
    "quantidadePorcoes" DECIMAL(10,3),
    "pesoPorcao" DECIMAL(10,3),
    "unidadePorcao" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceitaProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaProducaoItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "receitaId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceitaProducaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "precoVenda" DECIMAL(12,2) NOT NULL,
    "tipoProduto" TEXT NOT NULL DEFAULT 'PRODUTO',
    "custoDireto" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "produtoAncora" BOOLEAN NOT NULL DEFAULT false,
    "produtoIsca" BOOLEAN NOT NULL DEFAULT false,
    "incluirAnaliseEstrategica" BOOLEAN NOT NULL DEFAULT true,
    "tipoBebidaAnalise" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "comboId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(10,2) NOT NULL,
    "incluirEmbalagemIndividual" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboInsumo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "comboId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "modoUsoQuantidade" TEXT DEFAULT 'BASE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTecnicaItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "modoUsoQuantidade" TEXT DEFAULT 'BASE',
    "tipoUso" "TipoUsoFicha" NOT NULL DEFAULT 'INGREDIENTE',
    "formaRateio" "FormaRateioFicha" NOT NULL DEFAULT 'POR_PRODUTO',
    "quantidadeAtendida" DECIMAL(10,3),
    "aplicarMargem" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaTecnicaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoPrecificacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "cmvAlvoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 32.00,
    "lucroDesejadoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    "taxaIfoodPercentual" DECIMAL(10,2) NOT NULL DEFAULT 23.00,
    "campanhaInteligente" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "maiorTaxaEntrega" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "cupomDesconto" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "ticketMedioDelivery" DECIMAL(10,2) NOT NULL DEFAULT 40.00,
    "taxaPagamentoOnlinePercentual" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "taxaRepasseAntecipadoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "campanhaIfoodPercentual" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "custoFixoIfood" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "produtosPorPedidoIfood" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPrecificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoFixo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "tipo" TEXT,
    "observacao" TEXT,
    "tipoCusto" TEXT DEFAULT 'GERAL',
    "tipoColaborador" TEXT,
    "salarioBase" DECIMAL(12,2),
    "calcularEncargos" BOOLEAN NOT NULL DEFAULT false,
    "valorDiaria" DECIMAL(12,2),
    "quantidade" DECIMAL(10,2),
    "dias" DECIMAL(10,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoFixo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoVariavel" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaCustoVariavel" NOT NULL,
    "tipoCalculo" "TipoCalculoCustoVariavel" NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaturamentoDiario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "quantidadePedidos" INTEGER NOT NULL,
    "canal" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaturamentoDiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnaliseVenda" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'SAIPOS',
    "periodoInicio" TIMESTAMP(3),
    "periodoFim" TIMESTAMP(3),
    "totalVendido" INTEGER NOT NULL DEFAULT 0,
    "itensUnicos" INTEGER NOT NULL DEFAULT 0,
    "qtdPrincipal" INTEGER NOT NULL DEFAULT 0,
    "qtdComplemento" INTEGER NOT NULL DEFAULT 0,
    "qtdOfertaCombo" INTEGER NOT NULL DEFAULT 0,
    "produtosAssociados" INTEGER NOT NULL DEFAULT 0,
    "produtosNaoIdentificados" INTEGER NOT NULL DEFAULT 0,
    "valorEstimadoConsumido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insumosConsumidos" INTEGER NOT NULL DEFAULT 0,
    "alertasDados" INTEGER NOT NULL DEFAULT 0,
    "classeAQtd" INTEGER NOT NULL DEFAULT 0,
    "classeBQtd" INTEGER NOT NULL DEFAULT 0,
    "classeCQtd" INTEGER NOT NULL DEFAULT 0,
    "classeAValorPercentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classeBValorPercentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classeCValorPercentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itens" JSONB NOT NULL,
    "diagnostico" JSONB NOT NULL,
    "consumo" JSONB NOT NULL,
    "curvaABC" JSONB NOT NULL,
    "alertas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnaliseVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNome" TEXT,
    "nome" TEXT NOT NULL DEFAULT 'Hamburgueria',
    "whatsapp" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "logoDataUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaMotoboy" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "titulo" TEXT,
    "tokenPublico" TEXT NOT NULL,
    "status" "EscalaStatus" NOT NULL DEFAULT 'ABERTA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalaMotoboy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaMotoboyDia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "escalaId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "semanaDoMes" INTEGER NOT NULL,
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "status" "EscalaDiaStatus" NOT NULL DEFAULT 'ABERTO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalaMotoboyDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaMotoboyInscricao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "escalaDiaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "status" "InscricaoStatus" NOT NULL DEFAULT 'INSCRITO',
    "origem" "InscricaoOrigem" NOT NULL DEFAULT 'PUBLICO',
    "motoboyId" INTEGER,
    "presencaStatus" "PresencaMotoboyStatus" NOT NULL DEFAULT 'PENDENTE',
    "presencaObservacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalaMotoboyInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motoboy" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "status" "MotoboyStatus" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motoboy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotoboyOcorrencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "motoboyId" INTEGER NOT NULL,
    "escalaDiaId" INTEGER,
    "inscricaoId" INTEGER,
    "tipo" "MotoboyOcorrenciaTipo" NOT NULL,
    "gravidade" "MotoboyOcorrenciaGravidade" NOT NULL DEFAULT 'MEDIA',
    "dataOcorrencia" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorPrejuizo" DECIMAL(10,2),
    "resolvida" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotoboyOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" TEXT,
    "cpf" TEXT,
    "whatsapp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "tokenPrivado" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoConfig" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tokenPublico" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tetoAssiduidade" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "tetoDesempenho" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "tetoColetiva" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "bonusTop1" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "bonusTop2" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "bonusTop3" DECIMAL(10,2) NOT NULL DEFAULT 25,
    "xpPorNivel" INTEGER NOT NULL DEFAULT 500,
    "moedasPorReal" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonificacaoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoNivel" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonificacaoNivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoXp" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "pontos" INTEGER NOT NULL,
    "motivo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "ano" INTEGER,
    "mes" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonificacaoXp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoTipoOcorrencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "pilar" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonificacaoTipoOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoOcorrencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipoId" INTEGER,
    "nomeTipo" TEXT NOT NULL,
    "pilar" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "data" DATE NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonificacaoOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoColetiva" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonificacaoColetiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoFechamento" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "coletivaPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "itensJson" JSONB NOT NULL,
    "totalGeral" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechadoPor" TEXT,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonificacaoFechamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conquista" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '🏅',
    "raridade" TEXT NOT NULL DEFAULT 'COMUM',
    "regra" TEXT NOT NULL DEFAULT 'MANUAL',
    "meta" INTEGER NOT NULL DEFAULT 1,
    "xpBonus" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conquista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConquistaDesbloqueada" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "conquistaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'AUTO',
    "ano" INTEGER,
    "mes" INTEGER,
    "desbloqueadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConquistaDesbloqueada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoMoeda" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "pontos" INTEGER NOT NULL,
    "motivo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "resgateId" INTEGER,
    "ano" INTEGER,
    "mes" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonificacaoMoeda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MercadoItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '🎁',
    "custo" INTEGER NOT NULL DEFAULT 100,
    "estoque" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MercadoResgate" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "itemNome" TEXT NOT NULL,
    "itemEmoji" TEXT NOT NULL DEFAULT '🎁',
    "custo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MercadoResgate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoCampanha" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tokenPublico" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "categorias" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvaliacaoCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoResposta" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "campanhaId" INTEGER NOT NULL,
    "notaGeral" INTEGER NOT NULL,
    "notasCategorias" JSONB NOT NULL DEFAULT '{}',
    "comentario" TEXT,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjudaArtigo" (
    "id" SERIAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "resumo" TEXT,
    "conteudo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AjudaArtigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicacaoConfig" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "promotorToken" TEXT NOT NULL,
    "atendenteToken" TEXT NOT NULL,
    "cupomAmigoTitulo" TEXT NOT NULL DEFAULT 'Cupom de boas-vindas',
    "cupomEmoji" TEXT NOT NULL DEFAULT '🎁',
    "cupomAmigoDestino" "RecompensaDestino" NOT NULL DEFAULT 'SALAO',
    "cupomAmigoPercentual" INTEGER NOT NULL DEFAULT 10,
    "cupomAmigoTipoDesconto" TEXT NOT NULL DEFAULT 'percent_discount',
    "cupomAmigoValor" DOUBLE PRECISION,
    "cupomAmigoTipos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cupomCorTipo" TEXT NOT NULL DEFAULT 'gradiente',
    "cupomCor1" TEXT NOT NULL DEFAULT '#ecc558',
    "cupomCor2" TEXT NOT NULL DEFAULT '#c48a1c',
    "botaoCor" TEXT NOT NULL DEFAULT '#7c3aed',
    "campoEmail" TEXT NOT NULL DEFAULT 'opcional',
    "campoNascimento" TEXT NOT NULL DEFAULT 'opcional',
    "bannerDataUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicacaoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotor" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "painelToken" TEXT NOT NULL,
    "origem" "PromotorOrigem" NOT NULL DEFAULT 'PUBLICO',
    "tipo" "PromotorTipo" NOT NULL DEFAULT 'CLIENTE',
    "status" "PromotorStatus" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "promotorId" INTEGER NOT NULL,
    "amigoNome" TEXT NOT NULL,
    "amigoWhatsapp" TEXT NOT NULL,
    "amigoEmail" TEXT,
    "amigoNascimento" DATE,
    "status" "IndicacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "validadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Indicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecompensaTier" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "meta" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'CONSUMO',
    "emoji" TEXT NOT NULL DEFAULT '🎁',
    "descricao" TEXT,
    "destino" "RecompensaDestino" NOT NULL,
    "destinos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecompensaTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cupom" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "CupomTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "destino" "RecompensaDestino" NOT NULL,
    "status" "CupomStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "promotorId" INTEGER,
    "indicacaoId" INTEGER,
    "recompensaTierId" INTEGER,
    "cwCouponId" INTEGER,
    "usadoEm" TIMESTAMP(3),
    "usadoPor" TEXT,
    "valorPedido" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cupom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cargo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaga" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "cargoId" INTEGER,
    "titulo" TEXT NOT NULL,
    "status" "VagaStatus" NOT NULL DEFAULT 'ABERTA',
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT,
    "jornada" TEXT,
    "turno" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diasTrabalho" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salarioMin" DOUBLE PRECISION,
    "salarioMax" DOUBLE PRECISION,
    "inicioPrevisto" DATE,
    "requisitos" TEXT,
    "diferenciais" TEXT,
    "responsavel" TEXT,
    "observacoes" TEXT,
    "atividadesEssenciais" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perguntas" JSONB,
    "pesos" JSONB,
    "formulario" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidato" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefoneNorm" TEXT NOT NULL,
    "email" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "bairro" TEXT,
    "nascimento" DATE,
    "linkedin" TEXT,
    "instagram" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "funcoesInteresse" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pretensaoSalarial" DOUBLE PRECISION,
    "disponivelEm" DATE,
    "tipoVinculo" TEXT,
    "disponibilidade" JSONB,
    "experienciasRapidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "respostasTriagem" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bancoTalentos" BOOLEAN NOT NULL DEFAULT false,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
    "respostasFormulario" JSONB,
    "observacoesInternas" TEXT,
    "consentimentoLGPD" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoBanco" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoEm" TIMESTAMP(3),
    "consentimentoOrigem" TEXT,
    "termoVersao" TEXT,
    "anonimizado" BOOLEAN NOT NULL DEFAULT false,
    "anonimizadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienciaProfissional" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "empresa" TEXT NOT NULL,
    "cargo" TEXT,
    "funcao" TEXT,
    "periodo" TEXT,
    "duracao" TEXT,
    "duracaoMeses" INTEGER,
    "atividades" TEXT,
    "motivoSaida" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienciaProfissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidatura" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "vagaId" INTEGER NOT NULL,
    "status" "CandidatoStatus" NOT NULL DEFAULT 'NOVO',
    "avaliacaoGestor" INTEGER,
    "proximaAcao" TEXT,
    "dataRetorno" DATE,
    "motivoReprovacao" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "respostas" JSONB,
    "classificacao" TEXT,
    "classificacaoManual" TEXT,
    "aderencia" INTEGER,
    "classificacaoDetalhe" JSONB,
    "score" INTEGER,
    "scoreBreakdown" JSONB,
    "scorePesos" JSONB,
    "scoreVersao" TEXT,
    "scoreMotivo" TEXT,
    "scorePreenchimento" INTEGER,
    "scoreQualidade" TEXT,
    "scoreCalculadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreHistorico" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidaturaId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB,
    "pesos" JSONB,
    "versao" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "preenchimento" INTEGER NOT NULL,
    "qualidade" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidatoHistorico" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "candidaturaId" INTEGER,
    "tipo" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "descricao" TEXT,
    "usuario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoCandidato" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "candidaturaId" INTEGER,
    "comunicacao" INTEGER,
    "organizacao" INTEGER,
    "postura" INTEGER,
    "tecnico" INTEGER,
    "compatibilidade" INTEGER,
    "disponibilidade" INTEGER,
    "interesse" INTEGER,
    "treinamento" INTEGER,
    "evidencias" TEXT NOT NULL,
    "autor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContatoCandidato" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "candidaturaId" INTEGER,
    "tipo" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "observacao" TEXT,
    "proximaAcao" TEXT,
    "dataRetorno" DATE,
    "autor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContatoCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntrevistaCandidato" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "candidatoId" INTEGER NOT NULL,
    "candidaturaId" INTEGER,
    "quando" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "responsavel" TEXT,
    "local" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntrevistaCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecrutamentoTag" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecrutamentoTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecrutamentoConfig" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "publicoAtivo" BOOLEAN NOT NULL DEFAULT true,
    "retencaoMeses" INTEGER NOT NULL DEFAULT 12,
    "termoVersao" TEXT NOT NULL DEFAULT '1.0',
    "formulario" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecrutamentoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insumo_empresaId_idx" ON "Insumo"("empresaId");

-- CreateIndex
CREATE INDEX "Insumo_nome_idx" ON "Insumo"("nome");

-- CreateIndex
CREATE INDEX "Insumo_ativo_idx" ON "Insumo"("ativo");

-- CreateIndex
CREATE INDEX "Insumo_tipo_idx" ON "Insumo"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaProducao_insumoId_key" ON "ReceitaProducao"("insumoId");

-- CreateIndex
CREATE INDEX "ReceitaProducao_empresaId_idx" ON "ReceitaProducao"("empresaId");

-- CreateIndex
CREATE INDEX "ReceitaProducaoItem_empresaId_idx" ON "ReceitaProducaoItem"("empresaId");

-- CreateIndex
CREATE INDEX "ReceitaProducaoItem_receitaId_idx" ON "ReceitaProducaoItem"("receitaId");

-- CreateIndex
CREATE INDEX "ReceitaProducaoItem_insumoId_idx" ON "ReceitaProducaoItem"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaProducaoItem_receitaId_insumoId_key" ON "ReceitaProducaoItem"("receitaId", "insumoId");

-- CreateIndex
CREATE INDEX "Produto_empresaId_idx" ON "Produto"("empresaId");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE INDEX "Produto_ativo_idx" ON "Produto"("ativo");

-- CreateIndex
CREATE INDEX "ComboItem_empresaId_idx" ON "ComboItem"("empresaId");

-- CreateIndex
CREATE INDEX "ComboItem_comboId_idx" ON "ComboItem"("comboId");

-- CreateIndex
CREATE INDEX "ComboItem_produtoId_idx" ON "ComboItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboItem_comboId_produtoId_key" ON "ComboItem"("comboId", "produtoId");

-- CreateIndex
CREATE INDEX "ComboInsumo_empresaId_idx" ON "ComboInsumo"("empresaId");

-- CreateIndex
CREATE INDEX "ComboInsumo_comboId_idx" ON "ComboInsumo"("comboId");

-- CreateIndex
CREATE INDEX "ComboInsumo_insumoId_idx" ON "ComboInsumo"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboInsumo_comboId_insumoId_key" ON "ComboInsumo"("comboId", "insumoId");

-- CreateIndex
CREATE INDEX "FichaTecnicaItem_empresaId_idx" ON "FichaTecnicaItem"("empresaId");

-- CreateIndex
CREATE INDEX "FichaTecnicaItem_produtoId_idx" ON "FichaTecnicaItem"("produtoId");

-- CreateIndex
CREATE INDEX "FichaTecnicaItem_insumoId_idx" ON "FichaTecnicaItem"("insumoId");

-- CreateIndex
CREATE INDEX "ConfiguracaoPrecificacao_ativo_idx" ON "ConfiguracaoPrecificacao"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoPrecificacao_empresaId_key" ON "ConfiguracaoPrecificacao"("empresaId");

-- CreateIndex
CREATE INDEX "CustoFixo_empresaId_idx" ON "CustoFixo"("empresaId");

-- CreateIndex
CREATE INDEX "CustoFixo_ativo_idx" ON "CustoFixo"("ativo");

-- CreateIndex
CREATE INDEX "CustoVariavel_empresaId_idx" ON "CustoVariavel"("empresaId");

-- CreateIndex
CREATE INDEX "CustoVariavel_ativo_idx" ON "CustoVariavel"("ativo");

-- CreateIndex
CREATE INDEX "CustoVariavel_categoria_idx" ON "CustoVariavel"("categoria");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_empresaId_idx" ON "FaturamentoDiario"("empresaId");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_data_idx" ON "FaturamentoDiario"("data");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_canal_idx" ON "FaturamentoDiario"("canal");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_ativo_idx" ON "FaturamentoDiario"("ativo");

-- CreateIndex
CREATE INDEX "AnaliseVenda_empresaId_idx" ON "AnaliseVenda"("empresaId");

-- CreateIndex
CREATE INDEX "AnaliseVenda_createdAt_idx" ON "AnaliseVenda"("createdAt");

-- CreateIndex
CREATE INDEX "Empresa_clienteId_idx" ON "Empresa"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaMotoboy_tokenPublico_key" ON "EscalaMotoboy"("tokenPublico");

-- CreateIndex
CREATE INDEX "EscalaMotoboy_empresaId_idx" ON "EscalaMotoboy"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaMotoboy_empresaId_ano_mes_key" ON "EscalaMotoboy"("empresaId", "ano", "mes");

-- CreateIndex
CREATE INDEX "EscalaMotoboyDia_empresaId_idx" ON "EscalaMotoboyDia"("empresaId");

-- CreateIndex
CREATE INDEX "EscalaMotoboyDia_escalaId_idx" ON "EscalaMotoboyDia"("escalaId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaMotoboyDia_escalaId_data_key" ON "EscalaMotoboyDia"("escalaId", "data");

-- CreateIndex
CREATE INDEX "EscalaMotoboyInscricao_empresaId_idx" ON "EscalaMotoboyInscricao"("empresaId");

-- CreateIndex
CREATE INDEX "EscalaMotoboyInscricao_escalaDiaId_idx" ON "EscalaMotoboyInscricao"("escalaDiaId");

-- CreateIndex
CREATE INDEX "EscalaMotoboyInscricao_escalaDiaId_whatsapp_idx" ON "EscalaMotoboyInscricao"("escalaDiaId", "whatsapp");

-- CreateIndex
CREATE INDEX "EscalaMotoboyInscricao_motoboyId_idx" ON "EscalaMotoboyInscricao"("motoboyId");

-- CreateIndex
CREATE INDEX "Motoboy_empresaId_idx" ON "Motoboy"("empresaId");

-- CreateIndex
CREATE INDEX "Motoboy_status_idx" ON "Motoboy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Motoboy_empresaId_whatsapp_key" ON "Motoboy"("empresaId", "whatsapp");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_empresaId_idx" ON "MotoboyOcorrencia"("empresaId");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_motoboyId_idx" ON "MotoboyOcorrencia"("motoboyId");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_dataOcorrencia_idx" ON "MotoboyOcorrencia"("dataOcorrencia");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_tipo_idx" ON "MotoboyOcorrencia"("tipo");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_gravidade_idx" ON "MotoboyOcorrencia"("gravidade");

-- CreateIndex
CREATE INDEX "MotoboyOcorrencia_resolvida_idx" ON "MotoboyOcorrencia"("resolvida");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_tokenPrivado_key" ON "Funcionario"("tokenPrivado");

-- CreateIndex
CREATE INDEX "Funcionario_empresaId_idx" ON "Funcionario"("empresaId");

-- CreateIndex
CREATE INDEX "Funcionario_empresaId_status_idx" ON "Funcionario"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BonificacaoConfig_empresaId_key" ON "BonificacaoConfig"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "BonificacaoConfig_tokenPublico_key" ON "BonificacaoConfig"("tokenPublico");

-- CreateIndex
CREATE INDEX "BonificacaoNivel_empresaId_ordem_idx" ON "BonificacaoNivel"("empresaId", "ordem");

-- CreateIndex
CREATE INDEX "BonificacaoXp_empresaId_funcionarioId_idx" ON "BonificacaoXp"("empresaId", "funcionarioId");

-- CreateIndex
CREATE INDEX "BonificacaoXp_funcionarioId_idx" ON "BonificacaoXp"("funcionarioId");

-- CreateIndex
CREATE INDEX "BonificacaoTipoOcorrencia_empresaId_pilar_ordem_idx" ON "BonificacaoTipoOcorrencia"("empresaId", "pilar", "ordem");

-- CreateIndex
CREATE INDEX "BonificacaoOcorrencia_empresaId_ano_mes_idx" ON "BonificacaoOcorrencia"("empresaId", "ano", "mes");

-- CreateIndex
CREATE INDEX "BonificacaoOcorrencia_funcionarioId_ano_mes_idx" ON "BonificacaoOcorrencia"("funcionarioId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "BonificacaoColetiva_empresaId_ano_mes_key" ON "BonificacaoColetiva"("empresaId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "BonificacaoFechamento_empresaId_ano_mes_key" ON "BonificacaoFechamento"("empresaId", "ano", "mes");

-- CreateIndex
CREATE INDEX "Conquista_empresaId_ordem_idx" ON "Conquista"("empresaId", "ordem");

-- CreateIndex
CREATE INDEX "ConquistaDesbloqueada_empresaId_funcionarioId_idx" ON "ConquistaDesbloqueada"("empresaId", "funcionarioId");

-- CreateIndex
CREATE INDEX "ConquistaDesbloqueada_funcionarioId_idx" ON "ConquistaDesbloqueada"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConquistaDesbloqueada_conquistaId_funcionarioId_key" ON "ConquistaDesbloqueada"("conquistaId", "funcionarioId");

-- CreateIndex
CREATE INDEX "BonificacaoMoeda_empresaId_funcionarioId_idx" ON "BonificacaoMoeda"("empresaId", "funcionarioId");

-- CreateIndex
CREATE INDEX "BonificacaoMoeda_funcionarioId_idx" ON "BonificacaoMoeda"("funcionarioId");

-- CreateIndex
CREATE INDEX "MercadoItem_empresaId_ordem_idx" ON "MercadoItem"("empresaId", "ordem");

-- CreateIndex
CREATE INDEX "MercadoResgate_empresaId_status_idx" ON "MercadoResgate"("empresaId", "status");

-- CreateIndex
CREATE INDEX "MercadoResgate_funcionarioId_idx" ON "MercadoResgate"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AvaliacaoCampanha_tokenPublico_key" ON "AvaliacaoCampanha"("tokenPublico");

-- CreateIndex
CREATE INDEX "AvaliacaoCampanha_empresaId_idx" ON "AvaliacaoCampanha"("empresaId");

-- CreateIndex
CREATE INDEX "AvaliacaoResposta_empresaId_idx" ON "AvaliacaoResposta"("empresaId");

-- CreateIndex
CREATE INDEX "AvaliacaoResposta_campanhaId_idx" ON "AvaliacaoResposta"("campanhaId");

-- CreateIndex
CREATE UNIQUE INDEX "AjudaArtigo_slug_key" ON "AjudaArtigo"("slug");

-- CreateIndex
CREATE INDEX "AjudaArtigo_categoria_idx" ON "AjudaArtigo"("categoria");

-- CreateIndex
CREATE INDEX "AjudaArtigo_publicado_idx" ON "AjudaArtigo"("publicado");

-- CreateIndex
CREATE UNIQUE INDEX "IndicacaoConfig_promotorToken_key" ON "IndicacaoConfig"("promotorToken");

-- CreateIndex
CREATE UNIQUE INDEX "IndicacaoConfig_atendenteToken_key" ON "IndicacaoConfig"("atendenteToken");

-- CreateIndex
CREATE UNIQUE INDEX "IndicacaoConfig_empresaId_key" ON "IndicacaoConfig"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotor_codigo_key" ON "Promotor"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Promotor_painelToken_key" ON "Promotor"("painelToken");

-- CreateIndex
CREATE INDEX "Promotor_empresaId_idx" ON "Promotor"("empresaId");

-- CreateIndex
CREATE INDEX "Promotor_status_idx" ON "Promotor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Promotor_empresaId_whatsapp_key" ON "Promotor"("empresaId", "whatsapp");

-- CreateIndex
CREATE INDEX "Indicacao_empresaId_idx" ON "Indicacao"("empresaId");

-- CreateIndex
CREATE INDEX "Indicacao_promotorId_idx" ON "Indicacao"("promotorId");

-- CreateIndex
CREATE INDEX "Indicacao_status_idx" ON "Indicacao"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Indicacao_empresaId_promotorId_amigoWhatsapp_key" ON "Indicacao"("empresaId", "promotorId", "amigoWhatsapp");

-- CreateIndex
CREATE INDEX "RecompensaTier_empresaId_idx" ON "RecompensaTier"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "RecompensaTier_empresaId_meta_key" ON "RecompensaTier"("empresaId", "meta");

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_codigo_key" ON "Cupom"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_indicacaoId_key" ON "Cupom"("indicacaoId");

-- CreateIndex
CREATE INDEX "Cupom_empresaId_idx" ON "Cupom"("empresaId");

-- CreateIndex
CREATE INDEX "Cupom_status_idx" ON "Cupom"("status");

-- CreateIndex
CREATE INDEX "Cupom_promotorId_idx" ON "Cupom"("promotorId");

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_empresaId_promotorId_recompensaTierId_key" ON "Cupom"("empresaId", "promotorId", "recompensaTierId");

-- CreateIndex
CREATE INDEX "Cargo_empresaId_idx" ON "Cargo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_empresaId_nome_key" ON "Cargo"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Vaga_empresaId_idx" ON "Vaga"("empresaId");

-- CreateIndex
CREATE INDEX "Vaga_status_idx" ON "Vaga"("status");

-- CreateIndex
CREATE INDEX "Candidato_empresaId_idx" ON "Candidato"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidato_empresaId_telefoneNorm_key" ON "Candidato"("empresaId", "telefoneNorm");

-- CreateIndex
CREATE INDEX "ExperienciaProfissional_empresaId_idx" ON "ExperienciaProfissional"("empresaId");

-- CreateIndex
CREATE INDEX "ExperienciaProfissional_candidatoId_idx" ON "ExperienciaProfissional"("candidatoId");

-- CreateIndex
CREATE INDEX "Candidatura_empresaId_idx" ON "Candidatura"("empresaId");

-- CreateIndex
CREATE INDEX "Candidatura_vagaId_idx" ON "Candidatura"("vagaId");

-- CreateIndex
CREATE INDEX "Candidatura_candidatoId_idx" ON "Candidatura"("candidatoId");

-- CreateIndex
CREATE INDEX "Candidatura_empresaId_status_idx" ON "Candidatura"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidatura_empresaId_candidatoId_vagaId_key" ON "Candidatura"("empresaId", "candidatoId", "vagaId");

-- CreateIndex
CREATE INDEX "ScoreHistorico_empresaId_idx" ON "ScoreHistorico"("empresaId");

-- CreateIndex
CREATE INDEX "ScoreHistorico_candidaturaId_idx" ON "ScoreHistorico"("candidaturaId");

-- CreateIndex
CREATE INDEX "CandidatoHistorico_empresaId_idx" ON "CandidatoHistorico"("empresaId");

-- CreateIndex
CREATE INDEX "CandidatoHistorico_candidatoId_idx" ON "CandidatoHistorico"("candidatoId");

-- CreateIndex
CREATE INDEX "CandidatoHistorico_candidaturaId_idx" ON "CandidatoHistorico"("candidaturaId");

-- CreateIndex
CREATE INDEX "AvaliacaoCandidato_empresaId_idx" ON "AvaliacaoCandidato"("empresaId");

-- CreateIndex
CREATE INDEX "AvaliacaoCandidato_candidatoId_idx" ON "AvaliacaoCandidato"("candidatoId");

-- CreateIndex
CREATE INDEX "AvaliacaoCandidato_candidaturaId_idx" ON "AvaliacaoCandidato"("candidaturaId");

-- CreateIndex
CREATE INDEX "ContatoCandidato_empresaId_idx" ON "ContatoCandidato"("empresaId");

-- CreateIndex
CREATE INDEX "ContatoCandidato_candidatoId_idx" ON "ContatoCandidato"("candidatoId");

-- CreateIndex
CREATE INDEX "ContatoCandidato_candidaturaId_idx" ON "ContatoCandidato"("candidaturaId");

-- CreateIndex
CREATE INDEX "EntrevistaCandidato_empresaId_idx" ON "EntrevistaCandidato"("empresaId");

-- CreateIndex
CREATE INDEX "EntrevistaCandidato_candidatoId_idx" ON "EntrevistaCandidato"("candidatoId");

-- CreateIndex
CREATE INDEX "EntrevistaCandidato_candidaturaId_idx" ON "EntrevistaCandidato"("candidaturaId");

-- CreateIndex
CREATE INDEX "EntrevistaCandidato_empresaId_quando_idx" ON "EntrevistaCandidato"("empresaId", "quando");

-- CreateIndex
CREATE INDEX "RecrutamentoTag_empresaId_idx" ON "RecrutamentoTag"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "RecrutamentoTag_empresaId_nome_key" ON "RecrutamentoTag"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "RecrutamentoConfig_slug_key" ON "RecrutamentoConfig"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RecrutamentoConfig_empresaId_key" ON "RecrutamentoConfig"("empresaId");

-- AddForeignKey
ALTER TABLE "ReceitaProducao" ADD CONSTRAINT "ReceitaProducao_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaProducaoItem" ADD CONSTRAINT "ReceitaProducaoItem_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "ReceitaProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaProducaoItem" ADD CONSTRAINT "ReceitaProducaoItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboInsumo" ADD CONSTRAINT "ComboInsumo_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboInsumo" ADD CONSTRAINT "ComboInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTecnicaItem" ADD CONSTRAINT "FichaTecnicaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTecnicaItem" ADD CONSTRAINT "FichaTecnicaItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaMotoboyDia" ADD CONSTRAINT "EscalaMotoboyDia_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "EscalaMotoboy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaMotoboyInscricao" ADD CONSTRAINT "EscalaMotoboyInscricao_escalaDiaId_fkey" FOREIGN KEY ("escalaDiaId") REFERENCES "EscalaMotoboyDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaMotoboyInscricao" ADD CONSTRAINT "EscalaMotoboyInscricao_motoboyId_fkey" FOREIGN KEY ("motoboyId") REFERENCES "Motoboy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotoboyOcorrencia" ADD CONSTRAINT "MotoboyOcorrencia_motoboyId_fkey" FOREIGN KEY ("motoboyId") REFERENCES "Motoboy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoResposta" ADD CONSTRAINT "AvaliacaoResposta_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AvaliacaoCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicacao" ADD CONSTRAINT "Indicacao_promotorId_fkey" FOREIGN KEY ("promotorId") REFERENCES "Promotor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupom" ADD CONSTRAINT "Cupom_promotorId_fkey" FOREIGN KEY ("promotorId") REFERENCES "Promotor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupom" ADD CONSTRAINT "Cupom_indicacaoId_fkey" FOREIGN KEY ("indicacaoId") REFERENCES "Indicacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupom" ADD CONSTRAINT "Cupom_recompensaTierId_fkey" FOREIGN KEY ("recompensaTierId") REFERENCES "RecompensaTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaga" ADD CONSTRAINT "Vaga_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienciaProfissional" ADD CONSTRAINT "ExperienciaProfissional_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "Vaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreHistorico" ADD CONSTRAINT "ScoreHistorico_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatoHistorico" ADD CONSTRAINT "CandidatoHistorico_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatoHistorico" ADD CONSTRAINT "CandidatoHistorico_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoCandidato" ADD CONSTRAINT "AvaliacaoCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoCandidato" ADD CONSTRAINT "AvaliacaoCandidato_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCandidato" ADD CONSTRAINT "ContatoCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCandidato" ADD CONSTRAINT "ContatoCandidato_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrevistaCandidato" ADD CONSTRAINT "EntrevistaCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrevistaCandidato" ADD CONSTRAINT "EntrevistaCandidato_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
