// Loja Digital › TV Indoor › Programação — a GRADE SEMANAL de cada tela.
//
// ── O QUE ESTA TELA RESOLVE ───────────────────────────────────────────────────────────
// "Almoço toca o cardápio executivo, jantar toca outra coisa, e terça tem promoção." Antes
// disso, a única saída era trocar a playlist da TV na mão duas vezes por dia — e quem
// esquece de trocar de volta descobre pelo cliente.
//
// ── A ÚNICA REGRA QUE O GESTOR PRECISA ENTENDER ───────────────────────────────────────
// A de cima ganha. Sobreposição não é erro: "seg–sex jantar" com "terça em dobro" por cima
// é exatamente como ele pensa. Por isso não existe campo de prioridade para digitar — só
// ↑ e ↓, e a ordem na tela É a resposta.
//
// ── A HORA É A DA LOJA ────────────────────────────────────────────────────────────────
// Nem a do servidor, nem a do navegador de quem configura. O fuso fica no topo da tela, à
// vista, porque uma grade avaliada no fuso errado erra por horas sem dar nenhum sinal.
//
// ── "AGORA" VEM DO SERVIDOR ───────────────────────────────────────────────────────────
// O bloco "no ar agora" e a "próxima troca" são calculados pela MESMA função que a parede
// usa. Recalcular aqui faria o admin e a TV discordarem sobre o mesmo instante — e quem
// estivesse certo seria sempre o outro.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// ISO-8601: 1 = segunda … 7 = domingo. A sigla é só rótulo; o que viaja é o número.
const NOMES = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' }
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 7]
const ATALHOS = [
  { rotulo: 'Seg–Sex', dias: [1, 2, 3, 4, 5] },
  { rotulo: 'Fim de semana', dias: [6, 7] },
  { rotulo: 'Todos', dias: ORDEM_DIAS },
]

/* Lista pequena e conservadora: são os fusos que uma loja brasileira realmente usa, mais o
   UTC para quem estiver testando. Não é catálogo mundial de propósito — um seletor com 400
   entradas é um convite a escolher errado, e o backend valida qualquer IANA de qualquer
   forma se um dia precisarmos abrir. */
const FUSOS = [
  { id: 'America/Sao_Paulo', rotulo: 'Brasília (São Paulo)' },
  { id: 'America/Bahia', rotulo: 'Bahia' },
  { id: 'America/Fortaleza', rotulo: 'Fortaleza' },
  { id: 'America/Recife', rotulo: 'Recife' },
  { id: 'America/Belem', rotulo: 'Belém' },
  { id: 'America/Manaus', rotulo: 'Manaus' },
  { id: 'America/Cuiaba', rotulo: 'Cuiabá' },
  { id: 'America/Campo_Grande', rotulo: 'Campo Grande' },
  { id: 'America/Porto_Velho', rotulo: 'Porto Velho' },
  { id: 'America/Rio_Branco', rotulo: 'Rio Branco' },
  { id: 'America/Noronha', rotulo: 'Fernando de Noronha' },
  { id: 'UTC', rotulo: 'UTC' },
]

const MOTIVOS = {
  DIAS_INVALIDOS: 'Escolha pelo menos um dia da semana.',
  HORA_INVALIDA: 'Horário inválido. Use HH:MM, por exemplo 18:00.',
  JANELA_NULA: 'O início e o fim não podem ser iguais. Para o dia inteiro, use a playlist padrão.',
  PLAYLIST_INVALIDA: 'Escolha uma playlist desta loja.',
  FUSO_INVALIDO: 'Esse fuso horário não é reconhecido.',
  ITENS_INVALIDOS: 'A lista de regras não confere. Recarregue a tela.',
}
const erroDe = (e, fallback) => {
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

/* Os dias como o gestor lê: faixas contíguas viram "Seg–Sex", o resto vira lista. Escrever
   "Seg, Ter, Qua, Qui, Sex" numa linha de tabela custa o dobro do espaço e diz o mesmo. */
function textoDias(dias) {
  const d = [...(dias ?? [])].sort((a, b) => a - b)
  if (!d.length) return '—'
  if (d.length === 7) return 'Todos os dias'
  const faixas = []
  let ini = d[0]
  let ant = d[0]
  for (const atual of d.slice(1)) {
    if (atual === ant + 1) { ant = atual; continue }
    faixas.push([ini, ant])
    ini = atual
    ant = atual
  }
  faixas.push([ini, ant])
  return faixas.map(([a, b]) => (a === b ? NOMES[a] : `${NOMES[a]}–${NOMES[b]}`)).join(', ')
}

/* Um instante do servidor escrito como hora de quem está lendo. Só para EXIBIR: nenhuma
   decisão sai daqui — a resolução é toda do backend, no fuso da loja. */
function horaCurta(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

const vazia = (dispositivoId) => ({
  id: null, dispositivoId, ativo: true, dias: [1, 2, 3, 4, 5], horaInicio: '18:00', horaFim: '23:00', playlistId: '',
})
const daRegra = (r) => ({
  id: r.id, dispositivoId: r.dispositivoId, ativo: r.ativo,
  dias: [...r.dias], horaInicio: r.horaInicio, horaFim: r.horaFim, playlistId: String(r.playlistId),
})

export default function TvIndoorProgramacao() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [dados, setDados] = useState(null)
  const [telaId, setTelaId] = useState(null)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  const buscar = useCallback((id) => api.get('/tv-indoor/programacao', { params: id ? { dispositivoId: id } : {} })
    .then((r) => {
      setDados(r.data ?? null)
      if (r.data?.tela?.id) setTelaId(r.data.tela.id)
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler a programação agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  // As respostas de escrita já trazem a grade inteira recalculada — inclusive o "agora".
  // Aproveitá-las evita um segundo GET e, principalmente, evita a janela em que a tela
  // mostraria o estado antigo como se fosse o novo.
  const aplicar = (r) => { if (r?.data?.regras) setDados((d) => ({ ...d, ...r.data })) }

  async function salvar(form) {
    setOcupado(true)
    try {
      const corpo = {
        dispositivoId: telaId,
        ativo: form.ativo,
        dias: form.dias,
        horaInicio: form.horaInicio,
        horaFim: form.horaFim,
        playlistId: Number(form.playlistId),
      }
      const r = form.id
        ? await api.put(`/tv-indoor/programacao/regras/${form.id}`, corpo)
        : await api.post('/tv-indoor/programacao/regras', corpo)
      aplicar(r)
      setEditando(null)
      setToast({ message: form.id ? 'Regra atualizada.' : 'Regra criada no fim da lista.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function alternar(regra) {
    setOcupado(true)
    try {
      aplicar(await api.put(`/tv-indoor/programacao/regras/${regra.id}`, { ativo: !regra.ativo }))
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      aplicar(await api.delete(`/tv-indoor/programacao/regras/${excluindo.id}`))
      setExcluindo(null)
      setToast({ message: 'Regra excluída.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  /* A lista INTEIRA sobe de uma vez e o servidor reescreve a ordem por posição. Mesmo
     caminho da programação da playlist, e pela mesma razão: trocar dois vizinhos deixa
     buracos e empates quando duas abas mexem juntas. */
  async function mover(indice, passo) {
    const ids = regras.map((r) => r.id)
    const destino = indice + passo
    if (destino < 0 || destino >= ids.length) return
    ;[ids[indice], ids[destino]] = [ids[destino], ids[indice]]
    setOcupado(true)
    try {
      aplicar(await api.put('/tv-indoor/programacao/regras/ordem', { dispositivoId: telaId, ids }))
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível reordenar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function trocarFuso(valor) {
    setOcupado(true)
    try {
      await api.put('/tv-indoor/programacao/fuso', { fusoHorario: valor })
      await buscar(telaId)
      setToast({ message: 'Fuso atualizado. A grade passa a ser avaliada nesse horário.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar o fuso.'), type: 'error' }) } finally { setOcupado(false) }
  }

  const telas = dados?.telas ?? []
  const playlists = dados?.playlists ?? []
  const regras = dados?.regras ?? []
  const agora = dados?.agora ?? null
  const tela = dados?.tela ?? null
  const nomeDaPlaylist = (id) => playlists.find((p) => p.id === id)?.nome ?? null

  if (carregando) return <div className="loading-state">Carregando…</div>
  if (erro) {
    return (
      <div className="empty-state">
        <div style={{ marginBottom: 12 }}>{erro}</div>
        <button type="button" className="btn btn-primary" onClick={() => { setCarregando(true); buscar(telaId) }}>Tentar de novo</button>
      </div>
    )
  }

  return (
    <>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="page-header">
        <div>
          <h1>Programação da TV</h1>
          <div className="page-header-sub">
            Qual playlist cada tela reproduz em cada horário. Fora dos horários programados, ela volta para a
            <strong> playlist padrão</strong>.
          </div>
        </div>
      </div>

      {telas.length === 0 ? (
        <div className="table-card" style={{ padding: 16 }}>
          <div className="empty-state">
            Nenhuma TV cadastrada ainda. Cadastre uma em <strong>Telas</strong> — a programação é por tela.
          </div>
        </div>
      ) : (
        <>
          {/* ── O topo: qual tela, o que está no ar, e quando muda ─────── */}
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Tela</h2>
              <div className="ttm-cab-acao">
                <select
                  className="form-input"
                  style={{ minWidth: 200 }}
                  value={telaId ?? ''}
                  disabled={ocupado}
                  aria-label="Escolha a TV"
                  onChange={(e) => { setCarregando(true); buscar(Number(e.target.value)) }}
                >
                  {telas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="tvi-grade-topo">
              <div className="tvi-grade-cartao">
                <span className="tvi-grade-rotulo">No ar agora</span>
                <strong className="tvi-grade-valor">
                  {agora?.playlistId
                    ? (nomeDaPlaylist(agora.playlistId) ?? agora.playlistNome ?? `Playlist ${agora.playlistId}`)
                    : 'Marca da loja'}
                </strong>
                <span className="ttm-meta-txt">
                  {agora?.origem === 'REGRA' ? 'Por uma regra da grade' : 'Playlist padrão da tela'}
                </span>
              </div>

              <div className="tvi-grade-cartao">
                <span className="tvi-grade-rotulo">Próxima troca</span>
                <strong className="tvi-grade-valor">{horaCurta(agora?.proximaTrocaEm) ?? 'Sem troca prevista'}</strong>
                <span className="ttm-meta-txt">
                  {agora?.proximaTrocaEm
                    ? 'A TV muda sozinha nesse horário.'
                    : 'Sem regra ativa: a playlist padrão fica o tempo todo.'}
                </span>
              </div>

              <div className="tvi-grade-cartao">
                <span className="tvi-grade-rotulo">Playlist padrão</span>
                <strong className="tvi-grade-valor">
                  {tela?.playlistPadraoId ? (nomeDaPlaylist(tela.playlistPadraoId) ?? '—') : 'Nenhuma'}
                </strong>
                <span className="ttm-meta-txt">Escolhida em <strong>Telas</strong>.</span>
              </div>

              <div className="tvi-grade-cartao">
                <span className="tvi-grade-rotulo">Fuso da loja</span>
                <select
                  className="form-input"
                  value={dados?.fuso ?? 'America/Sao_Paulo'}
                  disabled={ocupado}
                  aria-label="Fuso horário da loja"
                  onChange={(e) => trocarFuso(e.target.value)}
                >
                  {FUSOS.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
                </select>
                <span className="ttm-meta-txt">Os horários abaixo são lidos neste fuso.</span>
              </div>
            </div>
          </div>

          {/* ── As regras, na ordem que É a prioridade ──────────────────── */}
          <div className="table-card" style={{ padding: 16 }}>
            <div className="ttm-cab-secao">
              <h2 className="ttm-secao-t">Regras semanais</h2>
              <span className="ttm-meta-txt">
                {regras.length} {regras.length === 1 ? 'regra' : 'regras'} · quando duas coincidirem, vale a que estiver <strong>mais acima</strong>
              </span>
              <div className="ttm-cab-acao">
                <button type="button" className="btn btn-primary btn-sm" disabled={ocupado || playlists.length === 0} onClick={() => setEditando(vazia(telaId))}>
                  Nova regra
                </button>
              </div>
            </div>

            {playlists.length === 0 ? (
              <div className="empty-state">Crie uma playlist antes — a regra existe para apontar para uma.</div>
            ) : regras.length === 0 ? (
              <div className="empty-state">
                Nenhuma regra. Esta TV reproduz a playlist padrão o tempo todo, que é exatamente o comportamento
                de antes desta tela existir.
              </div>
            ) : (
              <ul className="tvi-lista">
                {regras.map((r, i) => {
                  // Cruza com alguma regra ACIMA? Só isso importa: uma regra perde para as de
                  // cima, nunca para as de baixo. Avisar sobre as de baixo seria ruído.
                  const perdePara = regras.slice(0, i).find((outra) => outra.ativo && r.ativo && cruzam(outra, r))
                  return (
                    <li key={r.id} className={'tvi-item' + (r.ativo ? '' : ' off')}>
                      <span className="tvi-ordem">{i + 1}</span>
                      <span className="tvi-item-info">
                        <span className="tvi-item-nome">
                          {textoDias(r.dias)} · {r.horaInicio} — {r.horaFim}
                          {r.cruzaMeiaNoite ? <span className="tvi-vira-noite" title="A janela atravessa a meia-noite">+1 dia</span> : null}
                        </span>
                        <span className="tvi-item-meta">
                          <span className={'badge ' + (r.ativo ? 'badge-green' : 'badge-gray')}>{r.ativo ? 'Ativa' : 'Desligada'}</span>
                          <span>{nomeDaPlaylist(r.playlistId) ?? r.playlistNome ?? `Playlist ${r.playlistId}`}</span>
                          {agora?.regraId === r.id ? <span className="badge badge-orange">No ar agora</span> : null}
                        </span>
                        {perdePara ? (
                          <span className="ttm-meta-txt tvi-aviso-overlap">
                            Coincide com a regra {regras.indexOf(perdePara) + 1}, que está acima e tem prioridade.
                          </span>
                        ) : null}
                      </span>
                      <span className="tvi-item-acoes">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || i === 0} aria-label="Subir regra" onClick={() => mover(i, -1)}>↑</button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || i === regras.length - 1} aria-label="Descer regra" onClick={() => mover(i, 1)}>↓</button>
                        <button
                          type="button"
                          className={'intel-switch' + (r.ativo ? ' on' : '')}
                          role="switch"
                          aria-checked={r.ativo}
                          aria-label={`${r.ativo ? 'Desligar' : 'Ligar'} esta regra`}
                          disabled={ocupado}
                          onClick={() => alternar(r)}
                        />
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setEditando(daRegra(r))}>Editar</button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(r)}>Excluir</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {editando && (
        <Editor
          valor={editando}
          playlists={playlists}
          regras={regras}
          ocupado={ocupado}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvar}
        />
      )}

      <ConfirmDialog
        open={!!excluindo}
        variant="danger"
        loading={ocupado}
        title="Excluir esta regra?"
        message={excluindo ? `${textoDias(excluindo.dias)} · ${excluindo.horaInicio} — ${excluindo.horaFim}` : ''}
        description="A playlist NÃO é apagada. Nos horários que esta regra cobria, a TV volta para a playlist padrão (ou para outra regra que também valha)."
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}

/* Duas regras se cruzam? A mesma conta do servidor, e ela existe aqui por um motivo só:
   AVISAR. Nada é bloqueado — sobreposição é recurso, e a de cima ganha.

   Uma janela que atravessa a meia-noite vira duas faixas: o pedaço do dia marcado e o
   pedaço do dia seguinte. Sem isso, "sexta 18:00–02:00" nunca pareceria cruzar com
   "sábado 00:00–01:00", que é justamente o caso que confunde. */
function faixas(r) {
  const ini = minutos(r.horaInicio)
  const fim = minutos(r.horaFim)
  if (ini === null || fim === null) return []
  if (ini > fim) {
    return (r.dias ?? []).flatMap((d) => [[d, ini, 1440], [d === 7 ? 1 : d + 1, 0, fim]])
  }
  return (r.dias ?? []).map((d) => [d, ini, fim])
}
function cruzam(a, b) {
  for (const [dia, i1, f1] of faixas(a)) {
    for (const [dia2, i2, f2] of faixas(b)) {
      if (dia === dia2 && i1 < f2 && i2 < f1) return true
    }
  }
  return false
}
function minutos(hhmm) {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(String(hhmm ?? ''))
  if (!m) return null
  const h = Number(m[1])
  return h > 23 ? null : h * 60 + Number(m[2])
}

// ── Editor ─────────────────────────────────────────────────────────────────
function Editor({ valor, playlists, regras, ocupado, aoFechar, aoSalvar }) {
  const [form, setForm] = useState(valor)
  const [faltando, setFaltando] = useState({})
  const primeiroRef = useRef(null)

  useEffect(() => { primeiroRef.current?.focus() }, [])

  const alternarDia = (d) => setForm((f) => ({
    ...f,
    dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort((a, b) => a - b),
  }))

  const viraNoite = minutos(form.horaInicio) !== null && minutos(form.horaFim) !== null
    && minutos(form.horaInicio) > minutos(form.horaFim)

  // Avisa, não bloqueia. E só compara com as OUTRAS: uma regra sempre cruza consigo mesma.
  const conflito = regras.find((r) => r.id !== form.id && r.ativo && cruzam(r, form))

  function tentarSalvar() {
    if (ocupado) return
    const erros = {}
    if (!form.dias.length) erros.dias = 'Escolha pelo menos um dia.'
    if (minutos(form.horaInicio) === null) erros.horaInicio = 'Use HH:MM, por exemplo 18:00.'
    if (minutos(form.horaFim) === null) erros.horaFim = 'Use HH:MM, por exemplo 23:00.'
    if (!erros.horaInicio && !erros.horaFim && form.horaInicio === form.horaFim) {
      erros.horaFim = 'O início e o fim não podem ser iguais. Para o dia inteiro, use a playlist padrão.'
    }
    if (!form.playlistId) erros.playlistId = 'Escolha a playlist que vai tocar nesse horário.'
    if (Object.keys(erros).length) { setFaltando(erros); return }
    aoSalvar(form)
  }

  return (
    // Modal fecha só por botão — regra do projeto.
    <div className="modal-overlay">
      <div className="modal ttm-banner-modal">
        <div className="modal-header"><h2>{form.id ? 'Editar regra' : 'Nova regra'}</h2></div>
        <div className="ttm-banner-campos" style={{ padding: 16 }}>
          <div className="form-group">
            <label className="form-label">
              Dias da semana <span className="ttm-obrigatorio" aria-hidden="true">*</span>
            </label>
            <div className="tvi-chips" role="group" aria-label="Dias da semana">
              {ORDEM_DIAS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  ref={i === 0 ? primeiroRef : undefined}
                  className={'tvi-chip' + (form.dias.includes(d) ? ' on' : '')}
                  aria-pressed={form.dias.includes(d)}
                  onClick={() => { alternarDia(d); setFaltando((x) => ({ ...x, dias: null })) }}
                >
                  {NOMES[d]}
                </button>
              ))}
            </div>
            <div className="tvi-atalhos">
              {ATALHOS.map((a) => (
                <button key={a.rotulo} type="button" className="tvi-atalho" onClick={() => { setForm((f) => ({ ...f, dias: [...a.dias] })); setFaltando((x) => ({ ...x, dias: null })) }}>
                  {a.rotulo}
                </button>
              ))}
            </div>
            {faltando.dias ? <div className="ttm-erro-campo" role="alert">{faltando.dias}</div> : null}
          </div>

          <div className="ttm-banner-datas">
            <div className="form-group">
              <label className="form-label" htmlFor="tvg-ini">Começa às</label>
              <input
                id="tvg-ini" type="time" className={'form-input' + (faltando.horaInicio ? ' invalido' : '')}
                value={form.horaInicio}
                onChange={(e) => { setForm((f) => ({ ...f, horaInicio: e.target.value })); setFaltando((x) => ({ ...x, horaInicio: null })) }}
              />
              {faltando.horaInicio ? <div className="ttm-erro-campo" role="alert">{faltando.horaInicio}</div> : null}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="tvg-fim">Termina às</label>
              <input
                id="tvg-fim" type="time" className={'form-input' + (faltando.horaFim ? ' invalido' : '')}
                value={form.horaFim}
                onChange={(e) => { setForm((f) => ({ ...f, horaFim: e.target.value })); setFaltando((x) => ({ ...x, horaFim: null })) }}
              />
              {faltando.horaFim ? <div className="ttm-erro-campo" role="alert">{faltando.horaFim}</div> : null}
            </div>
          </div>
          {viraNoite ? (
            <div className="ttm-dica">
              A janela <strong>atravessa a meia-noite</strong>: começa no dia marcado e termina de madrugada no dia
              seguinte. Marque só o dia em que ela <strong>começa</strong> — não é preciso criar uma segunda regra.
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label" htmlFor="tvg-pl">
              Playlist <span className="ttm-obrigatorio" aria-hidden="true">*</span>
            </label>
            <select
              id="tvg-pl" className={'form-input' + (faltando.playlistId ? ' invalido' : '')}
              value={form.playlistId}
              onChange={(e) => { setForm((f) => ({ ...f, playlistId: e.target.value })); setFaltando((x) => ({ ...x, playlistId: null })) }}
            >
              <option value="">Escolha…</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            {faltando.playlistId ? <div className="ttm-erro-campo" role="alert">{faltando.playlistId}</div> : null}
          </div>

          <div className="form-group">
            <label className="form-label">Situação</label>
            <div className="ttm-acoes">
              <button
                type="button"
                className={'intel-switch' + (form.ativo ? ' on' : '')}
                role="switch"
                aria-checked={form.ativo}
                aria-label={form.ativo ? 'Desligar esta regra' : 'Ligar esta regra'}
                onClick={() => setForm((f) => ({ ...f, ativo: !f.ativo }))}
              />
              <span className="ttm-meta-txt">{form.ativo ? 'Ativa' : 'Desligada — não entra na grade'}</span>
            </div>
          </div>

          {conflito ? (
            <div className="ttm-dica tvi-aviso-overlap">
              Este horário coincide com a regra <strong>{textoDias(conflito.dias)} · {conflito.horaInicio} — {conflito.horaFim}</strong>.
              Isso é permitido: quando duas coincidirem, vale a que estiver <strong>mais acima</strong> na lista.
            </div>
          ) : null}
        </div>
        <div className="ttm-banner-rodape">
          <button type="button" className="btn btn-secondary" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
