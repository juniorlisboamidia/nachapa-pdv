// Central de Ajuda — hoje só o Guia inicial do Checklist Inteligente (movido do Painel,
// que era um modal disparado por lá). Onboarding no formato da referência (passos
// coloridos + "marcar como aprendido"), mas com o conteúdo REAL do nosso Checklist:
// foto SEM IA, execução por login WhatsApp na Área do Colaborador (não é QR/anônimo) e
// só alerta imediato (sem lembrete/boletim). Progresso é manual e guardado no
// localStorage (mesma chave que o antigo card do Painel usava).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const GUIA_KEY = 'chk-guia-aprendidos'
function lerGuiaAprendidos() {
  try { const v = JSON.parse(localStorage.getItem(GUIA_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function salvarGuiaAprendidos(arr) {
  try { localStorage.setItem(GUIA_KEY, JSON.stringify(arr)) } catch { /* storage indisponível — segue sem persistir */ }
}
const GUIA_PASSOS = [
  { k: 'checklist', n: 1, cor: '#eab802', corTxt: '#0e1319', titulo: 'Crie seu primeiro checklist',
    desc: 'Em Checklist › Checklists, clique em "+ Novo checklist". Monte as informações, os itens e a recorrência (todo dia / dias da semana / avulso) — ou parta de um Template pronto.',
    chips: ['Check', 'Avaliação', 'Texto', 'Numérico', 'Seleção', 'Foto'] },
  { k: 'funcao', n: 2, cor: '#e8850c', corTxt: '#ffffff', titulo: 'Defina quem executa',
    desc: 'No editor do checklist, marque as Funções que executam. Quem tem essa função no cadastro (Ponto Facial › Colaboradores) vê o checklist na Área do Colaborador.',
    chips: ['Por função', 'Gestor acompanha', 'Operador executa'] },
  { k: 'alerta', n: 3, cor: '#16a34a', corTxt: '#ffffff', titulo: 'Ative o alerta no WhatsApp',
    desc: 'Em Checklist › Notificações, ligue o alerta imediato e cadastre quem recebe. Quando um item crítico sair do padrão ao concluir, o WhatsApp dispara na hora.',
    chips: ['Alerta imediato', 'WhatsApp'] },
  { k: 'execucao', n: 4, cor: '#2563eb', corTxt: '#ffffff', titulo: 'Acompanhe a primeira execução',
    desc: 'O colaborador executa pelo celular na Área do Colaborador (login por WhatsApp). Você acompanha aqui no Painel: próximos, alertas e execuções recentes com foto.',
    chips: ['Área do Colaborador', 'Login por WhatsApp'] },
]

// Etiquetas — solução de problemas (impressão Bluetooth Niimbot B1). O 1º item é o que mais
// pega na prática (o app da Niimbot disputando a única conexão da impressora).
const PROBLEMAS_ETIQUETA = [
  {
    q: 'A impressora não aparece no seletor / não conecta',
    a: [
      'A B1 aceita UMA conexão Bluetooth por vez. Se ela estiver conectada ou pareada no app da Niimbot (ou no Bluetooth do próprio aparelho), ela fica ocupada e para de anunciar o nome — aí o navegador não a encontra. É a causa nº 1.',
      'Como resolver:',
      '1. Feche o app da Niimbot (se preciso, Ajustes › Apps › Niimbot › Forçar parada).',
      '2. Em Ajustes › Bluetooth, se a "B1-…" estiver pareada, toque nela e Desemparelhar / Esquecer.',
      '3. Desligue e ligue a B1 (ela volta livre, anunciando o nome).',
      '4. Mantenha o Bluetooth e a Localização ligados; abra o link e toque em "Conectar impressora".',
      'Regra de ouro: use a B1 só pelo nosso link, nunca pelo app da Niimbot ao mesmo tempo.',
    ],
  },
  {
    q: 'A impressão sai apagada / falhada',
    a: ['Aumente a Densidade em Etiquetas › Configuração (o padrão é 4; suba para 5). Textos pequenos já saem em negrito automaticamente para não falhar na impressão térmica.'],
  },
  {
    q: 'Não conecta no iPhone',
    a: ['O iPhone não tem Bluetooth no navegador (limitação da Apple — vale para todos os navegadores do iOS). Use o Chrome no Android, ou um computador com Bluetooth.'],
  },
]

// Ícone de foguete (mesmo desenho do antigo ChkIcon('rocket') do Checklist) — cabeçalho do guia.
function IconeFoguete({ size = 20 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg {...p}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.79-.87.78-2.2-.02-3a2.12 2.12 0 0 0-2.98 0z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}

export default function CentralAjuda() {
  const navigate = useNavigate()
  const [aprendidos, setAprendidos] = useState(lerGuiaAprendidos) // etapas marcadas como aprendidas (localStorage)
  const feitos = GUIA_PASSOS.filter((s) => aprendidos.includes(s.k)).length

  const toggleAprendido = (k) => setAprendidos((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    salvarGuiaAprendidos(next)
    return next
  })

  // Navega pro destino de cada etapa. "execucao" não tem uma tela própria — leva pro
  // Painel do Checklist, onde vivem os próximos agendamentos e as execuções recentes.
  const abrirEtapa = (k) => {
    if (k === 'checklist') navigate('/checklist/checklists?novo=1')
    else if (k === 'funcao') navigate('/checklist/checklists')
    else if (k === 'alerta') navigate('/checklist/notificacoes')
    else if (k === 'execucao') navigate('/checklist')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Central de Ajuda</h1>
          <div className="page-header-sub">Guia do Checklist Inteligente e solução de problemas das Etiquetas.</div>
        </div>
      </div>

      <div className="chkp-guia" style={{ marginBottom: 20 }}>
        <div className="chkp-guia-head">
          <div className="chkp-guia-ic"><IconeFoguete /></div>
          <div className="chkp-guia-title">Como usar o Checklist Inteligente</div>
          <div className="chkp-guia-frac">{feitos}/{GUIA_PASSOS.length}</div>
        </div>
        <div className="chkp-guia-track"><div className="chkp-guia-fill" style={{ width: `${(feitos / GUIA_PASSOS.length) * 100}%` }} /></div>
      </div>

      <div className="chkg-body">
        {GUIA_PASSOS.map((s) => {
          const ok = aprendidos.includes(s.k)
          return (
            <div key={s.k} className="chkg-step">
              <div className="chkg-step-h" style={{ background: s.cor, color: s.corTxt }}>
                <span className="chkg-step-n" style={{ color: s.cor }}>{s.n}</span>
                <span className="chkg-step-t">{s.titulo}</span>
                <button type="button" className="chkg-mark" onClick={() => toggleAprendido(s.k)}
                  style={ok ? { background: '#ffffff', color: s.cor, borderColor: '#ffffff' } : { color: s.corTxt, borderColor: s.corTxt }}>
                  {ok ? '✓ Aprendido' : 'Marcar como aprendido'}
                </button>
              </div>
              <div className="chkg-step-b">
                <p className="chkg-step-desc">{s.desc}</p>
                <div className="chkg-recursos">
                  <div className="chkg-recursos-t">Ações e recursos:</div>
                  <div className="chkg-chips">{s.chips.map((c) => <span key={c} className="chkg-chip">{c}</span>)}</div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEtapa(s.k)}>Abrir etapa</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Etiquetas — Solução de problemas (accordion nativo <details>, sem estado). */}
      <div className="page-header" style={{ marginTop: 28 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Etiquetas — Solução de problemas</h1>
          <div className="page-header-sub">Impressão por Bluetooth (Niimbot B1).</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {PROBLEMAS_ETIQUETA.map((p) => (
          <details key={p.q} className="table-card" style={{ padding: '12px 16px' }}>
            <summary style={{ fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{p.q}</summary>
            <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6, color: 'var(--app-text-2, #555)' }}>
              {p.a.map((linha, i) => <p key={i} style={{ margin: '5px 0' }}>{linha}</p>)}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
