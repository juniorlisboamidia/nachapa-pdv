// Constantes e helpers do módulo Banco de Talentos (Dep. Pessoal).
export const STATUS = [
  { v: 'NOVO', l: 'Novo cadastro', cls: 'badge-blue' },
  { v: 'TRIAGEM', l: 'Em triagem', cls: 'badge-blue' },
  { v: 'PRE_SELECIONADO', l: 'Pré-selecionado', cls: 'badge-purple' },
  { v: 'CONTATO_REALIZADO', l: 'Contato realizado', cls: 'badge-yellow' },
  { v: 'ENTREVISTA_AGENDADA', l: 'Entrevista agendada', cls: 'badge-orange' },
  { v: 'TESTE_PRATICO', l: 'Teste prático', cls: 'badge-orange' },
  { v: 'APROVADO', l: 'Aprovado', cls: 'badge-green' },
  { v: 'BANCO_TALENTOS', l: 'Banco de talentos', cls: 'badge-purple' },
  { v: 'REPROVADO', l: 'Reprovado', cls: 'badge-red' },
  { v: 'SEM_RETORNO', l: 'Desistiu / Sem retorno', cls: 'badge-gray' },
]
export const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.v, s.l]))
export const STATUS_CLS = Object.fromEntries(STATUS.map((s) => [s.v, s.cls]))
export const ORIGENS = [['MANUAL', 'Manual'], ['PUBLICO', 'Formulário'], ['INSTAGRAM', 'Instagram'], ['WHATSAPP', 'WhatsApp'], ['INDICACAO', 'Indicação'], ['QRCODE', 'QR Code'], ['SITE', 'Site'], ['ANUNCIO', 'Anúncio'], ['LOJA', 'Currículo na loja'], ['OUTRO', 'Outro']]
export const ORIGEM_LABEL = Object.fromEntries(ORIGENS)
export const VINCULOS = [['CLT', 'CLT'], ['FREELANCER', 'Freelancer'], ['DIARISTA', 'Diarista'], ['ESTAGIO', 'Estágio'], ['A_COMBINAR', 'A combinar']]
export const VINCULO_LABEL = Object.fromEntries(VINCULOS)
export const TURNOS = [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['madrugada', 'Madrugada']]
export const TURNO_LABEL = Object.fromEntries(TURNOS)
export const DIAS = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']]
export const EXPERIENCIAS = ['Atendimento presencial', 'Atendimento WhatsApp', 'Caixa', 'iFood / delivery', 'Chapa', 'Montagem', 'Fritura', 'Pré-preparo', 'Pia', 'Limpeza', 'Estoque', 'Produção', 'Liderança', 'Gestão de equipe', 'Motoboy / entregas']
export const FUNCOES = ['Atendente', 'Auxiliar de cozinha', 'Chapista', 'Montagem', 'Caixa', 'Motoboy', 'Gerente / Líder', 'Serviços gerais']
export const CONTATO_TIPO = [['WHATSAPP', 'WhatsApp'], ['LIGACAO', 'Ligação'], ['EMAIL', 'E-mail'], ['PRESENCIAL', 'Presencial']]
export const CONTATO_RES = [['SEM_RESPOSTA', 'Sem resposta'], ['INTERESSADO', 'Interessado'], ['SEM_INTERESSE', 'Sem interesse'], ['ENTREVISTA_MARCADA', 'Entrevista marcada'], ['RETORNAR', 'Retornar depois']]
export const ENTREVISTA_TIPO = [['ONLINE', 'Online'], ['PRESENCIAL', 'Presencial'], ['TESTE', 'Teste prático']]
export const VAGA_STATUS = [['ABERTA', 'Aberta'], ['PAUSADA', 'Pausada'], ['ENCERRADA', 'Encerrada']]
export const VAGA_STATUS_CLS = { ABERTA: 'badge-green', PAUSADA: 'badge-yellow', ENCERRADA: 'badge-gray' }
export const CRITERIOS_AV = [['comunicacao', 'Comunicação'], ['organizacao', 'Organização'], ['postura', 'Postura profissional'], ['tecnico', 'Conhecimento técnico'], ['compatibilidade', 'Compatibilidade com a rotina'], ['disponibilidade', 'Disponibilidade'], ['interesse', 'Interesse demonstrado'], ['treinamento', 'Necessidade de treinamento']]
export const PESOS_LABEL = [['disponibilidade', 'Disponibilidade'], ['experiencia', 'Experiência'], ['deslocamento', 'Deslocamento'], ['triagem', 'Triagem'], ['gestor', 'Avaliação do gestor']]
export const PESOS_PADRAO = { disponibilidade: 30, experiencia: 25, deslocamento: 15, triagem: 15, gestor: 15 }

export const ENTREVISTA_STATUS = [['AGENDADA', 'Agendada'], ['REALIZADA', 'Realizada'], ['CANCELADA', 'Cancelada'], ['NAO_COMPARECEU', 'Não compareceu']]
export const QUALIDADE_LABEL = { COMPLETO: 'Score completo', PARCIAL: 'Score parcial', ESTIMADO: 'Score estimado' }
export const qualidadeCls = (q) => (q === 'COMPLETO' ? 'q-completo' : q === 'PARCIAL' ? 'q-parcial' : 'q-estimado')
export const CLASSIF_LABEL = { ATENDE: 'Atende aos requisitos', PARCIAL: 'Atende parcialmente', NAO_ATENDE: 'Não atende aos requisitos', INCOMPLETO: 'Informações incompletas' }
export const CLASSIF_CLS = { ATENDE: 'cl-atende', PARCIAL: 'cl-parcial', NAO_ATENDE: 'cl-nao', INCOMPLETO: 'cl-incompleto' }
export const SITUACAO_LABEL = { ATIVO: 'Ativo no banco', ARQUIVADO: 'Arquivado', CONTRATADO: 'Contratado' }
export const SITUACAO_CLS = { ATIVO: 'badge-green', ARQUIVADO: 'badge-gray', CONTRATADO: 'badge-blue' }
export const CAMPOS_META = [
  ['email', 'E-mail'], ['endereco', 'Endereço (rua e número)'], ['cidade', 'Cidade'], ['bairro', 'Bairro'], ['transporte', 'Meio de transporte'],
  ['tempoDeslocamento', 'Tempo de deslocamento'], ['disponivelEm', 'Data disponível para início'],
  ['funcoes', 'Funções de interesse'], ['experiencias', 'Experiências práticas'],
  ['ultimosEmpregos', 'Últimos empregos / experiências'], ['pretensao', 'Pretensão salarial'],
  ['sobre', 'Conte brevemente sua experiência'], ['disponibilidade', 'Disponibilidade (dias/turnos)'],
]
export const PERGUNTA_TIPOS = [['sim_nao', 'Sim ou não'], ['unica', 'Escolha única'], ['multipla', 'Múltipla escolha'], ['numero', 'Número'], ['escala', 'Escala (1-5)'], ['texto', 'Texto curto'], ['texto_longo', 'Texto longo (parágrafo)']]
export const PERGUNTA_PAPEIS = [['informativa', 'Informativa'], ['eliminatoria', 'Eliminatória'], ['prioridade', 'Prioridade']]
export const formularioPadrao = (vaga) => ({
  titulo: vaga ? 'Candidate-se a esta vaga' : 'Trabalhe conosco',
  apresentacao: vaga ? '' : 'Deixe seus dados no nosso banco de talentos. Quando surgir uma vaga, a gente te chama!',
  campos: { email: { ativo: true, obrigatorio: false }, endereco: { ativo: true }, cidade: { ativo: true }, bairro: { ativo: true }, funcoes: { ativo: true }, experiencias: { ativo: true }, disponibilidade: { ativo: true }, sobre: { ativo: true }, transporte: { ativo: false }, tempoDeslocamento: { ativo: false }, disponivelEm: { ativo: false }, ultimosEmpregos: { ativo: false }, pretensao: { ativo: false } },
  funcoes: ['Atendente', 'Auxiliar de cozinha', 'Chapista', 'Caixa', 'Motoboy'],
  experiencias: ['Atendimento', 'Caixa', 'Chapa', 'Montagem', 'Delivery'],
  dispDias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  dispTurnos: ['Manhã', 'Tarde', 'Noite'],
  perguntas: [],
})
export const DURACOES = [['Menos de 3 meses', 2], ['3 a 6 meses', 4], ['6 meses a 1 ano', 9], ['1 a 2 anos', 18], ['2 a 5 anos', 42], ['Mais de 5 anos', 72]]
// Leitura de permanência a partir do histórico de empresas (dura x pula de emprego).
export const permanencia = (exps) => {
  const meses = (exps || []).map((e) => e.duracaoMeses).filter((m) => m != null)
  if (meses.length < 2) return null
  const media = Math.round(meses.reduce((s, m) => s + m, 0) / meses.length)
  const label = media < 6 ? 'Troca de emprego com frequência' : media < 12 ? 'Permanência curta/média' : 'Costuma permanecer'
  const cls = media < 6 ? 'perm-baixa' : media < 12 ? 'perm-media' : 'perm-alta'
  return { media, empregos: exps.length, label, cls }
}
export const waLink = (tel) => 'https://wa.me/55' + String(tel || '').replace(/\D/g, '').replace(/^55/, '')
export const compatCls = (s) => (s == null ? 'compat-na' : s >= 80 ? 'compat-alta' : s >= 50 ? 'compat-media' : 'compat-baixa')
export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
export const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const dispResumo = (d) => {
  if (!d) return '—'
  const t = Array.isArray(d.turnos) ? d.turnos.map((x) => TURNO_LABEL[x] || x) : []
  return t.length ? t.join(', ') : (Array.isArray(d.dias) && d.dias.length ? `${d.dias.length} dias` : '—')
}
