// Loja Digital › TV Indoor › Conteúdos — as peças de mídia que a TV reproduz.
//
// Interface OPERACIONAL, não construtor de design: subir a arte, dar um nome, dizer quanto
// tempo ela fica na tela e, se for o caso, de quando até quando. Nada de editor, nada de
// templates, nada de recorte — o V1 tem um comportamento de escala só (`cover`), e a
// prévia mostra exatamente o que a TV vai mostrar.
//
// O canal é IRMÃO do totem e a tela segue os mesmos padrões do PDV (`table-card`,
// `hb-table`, `ConfirmDialog` que só fecha por botão, `intel-switch`), mas o domínio é
// próprio: aqui não existe "tipo", não existe capa e não existe tela de espera.
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { reduzirImagem } from '../lib/reduzirImagem'

const STATUS = {
  ATIVO: { texto: 'No ar', cor: 'badge-green' },
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Desligado', cor: 'badge-gray' },
}

const MOTIVOS = {
  NOME_OBRIGATORIO: 'Dê um nome ao conteúdo.',
  DURACAO_INVALIDA: 'A duração está fora da faixa permitida.',
  DATA_INVALIDA: 'A data informada não é válida.',
  JANELA_INVALIDA: 'O fim precisa ser depois do início.',
  IMAGEM_AUSENTE: 'Escolha uma imagem.',
  IMAGEM_FORMATO: 'Arquivo inválido. Use PNG, JPG ou WEBP.',
  IMAGEM_TIPO: 'O arquivo não é a imagem que o nome diz ser.',
  IMAGEM_GRANDE: 'A imagem ficou grande demais mesmo depois de reduzida.',
}

const erroDe = (e, fallback) => {
  const erros = e?.response?.data?.erros
  if (erros?.length) return MOTIVOS[erros[0].motivo] ?? fallback
  return e?.response?.data?.error ?? fallback
}

/* O campo `datetime-local` fala em hora LOCAL do navegador; o banco guarda instante
   absoluto. A conversão usa o fuso de quem está configurando, que é o fuso da loja —
   assim a agenda não depende de onde o servidor está hospedado. */
function paraIso(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}
function paraCampo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function textoAgenda(c) {
  if (!c.inicioEm && !c.fimEm) return 'Sem agenda'
  const f = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (c.inicioEm && c.fimEm) return `${f(c.inicioEm)} → ${f(c.fimEm)}`
  if (c.inicioEm) return `A partir de ${f(c.inicioEm)}`
  return `Até ${f(c.fimEm)}`
}

const vazio = (limites) => ({
  id: null, nome: '', duracaoSegundos: limites?.duracaoPadrao ?? 10,
  inicioEm: '', fimEm: '', imagem: null, previa: null,
})
const deConteudo = (c) => ({
  id: c.id, nome: c.nome, duracaoSegundos: c.duracaoSegundos,
  inicioEm: paraCampo(c.inicioEm), fimEm: paraCampo(c.fimEm),
  imagem: null, previa: c.imagemUrl,
})

export default function TvIndoorConteudos() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [lista, setLista] = useState([])
  const [limites, setLimites] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  const buscar = useCallback(() => api.get('/tv-indoor/conteudos')
    .then((r) => {
      setLista(Array.isArray(r.data?.conteudos) ? r.data.conteudos : [])
      setLimites(r.data?.limites ?? null)
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler os conteúdos agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  async function alternar(c) {
    setOcupado(true)
    try {
      await api.put(`/tv-indoor/conteudos/${c.id}`, { ativo: !c.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(`/tv-indoor/conteudos/${excluindo.id}`)
      setExcluindo(null)
      await buscar()
      setToast({ message: 'Conteúdo excluído.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function salvar(form) {
    setOcupado(true)
    try {
      const corpo = {
        nome: form.nome,
        duracaoSegundos: Number(form.duracaoSegundos),
        inicioEm: paraIso(form.inicioEm),
        fimEm: paraIso(form.fimEm),
      }
      if (form.id) {
        await api.put(`/tv-indoor/conteudos/${form.id}`, corpo)
        // A imagem vai em chamada SEPARADA de propósito: é a única que incrementa a versão,
        // e quem só corrigiu um título não pode fazer todas as TVs rebaixarem o cache.
        if (form.imagem) await api.put(`/tv-indoor/conteudos/${form.id}/imagem`, { imagem: form.imagem })
      } else {
        await api.post('/tv-indoor/conteudos', { ...corpo, imagem: form.imagem })
      }
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Conteúdo atualizado.' : 'Conteúdo criado.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  const noAr = lista.filter((c) => c.status === 'ATIVO').length
  const medida = limites?.medida ?? { largura: 1920, altura: 1080 }

  if (carregando) return <div className="loading-state">Carregando…</div>
  if (erro) {
    return (
      <div className="empty-state">
        <div style={{ marginBottom: 12 }}>{erro}</div>
        <button type="button" className="btn btn-primary" onClick={() => { setCarregando(true); buscar() }}>Tentar de novo</button>
      </div>
    )
  }

  return (
    <>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="page-header">
        <div>
          <h1>Conteúdos da TV</h1>
          <div className="page-header-sub">
            As imagens que as TVs da loja reproduzem. Quem define a <strong>ordem</strong> de cada tela é a
            playlist — aqui fica o acervo.
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-cab-secao">
          <h2 className="ttm-secao-t">Acervo</h2>
          <span className="ttm-meta-txt">
            {lista.length} {lista.length === 1 ? 'conteúdo' : 'conteúdos'} · {noAr} no ar ·{' '}
            {medida.largura} × {medida.altura} px (16:9), até {limites?.imagemKb ?? 700} KB
          </span>
          <div className="ttm-cab-acao">
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => setEditando(vazio(limites))}>
              Novo conteúdo
            </button>
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">
            Nenhum conteúdo ainda. Enquanto não houver nada no ar, a TV mostra a marca da loja — que é o
            repouso do canal, não um defeito.
          </div>
        ) : (
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Imagem</th>
                <th>Nome</th>
                <th>Situação</th>
                <th className="ttm-nowrap">Duração</th>
                <th>Agenda</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className={c.ativo ? undefined : 'tvi-linha-off'}>
                  <td>
                    {/* A miniatura é 16:9 com `cover`: o MESMO recorte da TV, para o gestor
                        ver aqui o que vai aparecer lá. */}
                    <button type="button" className="tvi-mini" disabled={ocupado} title="Editar" onClick={() => setEditando(deConteudo(c))}>
                      <img src={c.imagemUrl} alt="" draggable={false} />
                    </button>
                  </td>
                  <td>
                    <button type="button" className="tvi-nome" disabled={ocupado} onClick={() => setEditando(deConteudo(c))}>
                      {c.nome}
                    </button>
                  </td>
                  <td><span className={'badge ' + STATUS[c.status].cor}>{STATUS[c.status].texto}</span></td>
                  <td className="ttm-nowrap">{c.duracaoSegundos}s</td>
                  <td className="ttm-meta-txt">{textoAgenda(c)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="ttm-acoes">
                      {/* Interruptor de verdade: o rótulo diz o que ele FAZ, não o estado. */}
                      <button
                        type="button"
                        className={'intel-switch' + (c.ativo ? ' on' : '')}
                        role="switch"
                        aria-checked={c.ativo}
                        aria-label={`${c.ativo ? 'Desligar' : 'Ligar'} ${c.nome}`}
                        disabled={ocupado}
                        onClick={() => alternar(c)}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setExcluindo(c)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <Editor
          valor={editando}
          limites={limites}
          ocupado={ocupado}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvar}
          aoAvisar={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      <ConfirmDialog
        open={!!excluindo}
        variant="danger"
        loading={ocupado}
        title="Excluir este conteúdo?"
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description="A imagem é apagada junto e ele sai de todas as playlists em que estiver. Se a ideia é só tirar do ar por um tempo, use o interruptor."
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />
    </>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────
function Editor({ valor, limites, ocupado, aoFechar, aoSalvar, aoAvisar }) {
  const [form, setForm] = useState(valor)
  // O que FALTA, por campo. Só aparece depois de tentar salvar: cobrar um campo que o
  // gestor ainda nem chegou a preencher é ruído, não ajuda.
  const [faltando, setFaltando] = useState({})
  const nomeRef = useRef(null)
  const medida = limites?.medida ?? { largura: 1920, altura: 1080 }

  const campo = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFaltando((x) => (x[k] ? { ...x, [k]: null } : x))
  }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    try {
      const dataUrl = await reduzirImagem(arquivo, medida.largura)
      setForm((f) => ({ ...f, imagem: dataUrl, previa: dataUrl }))
      setFaltando((x) => (x.imagem ? { ...x, imagem: null } : x))
    } catch {
      aoAvisar('Não foi possível ler esse arquivo. Use PNG, JPG ou WEBP.')
    }
  }

  /* O botão NÃO fica desabilitado por falta de preenchimento: desabilitado é o pior estado
     possível aqui — o gestor aperta, nada acontece, e a tela não diz o que está errado nem
     onde. Quem recusa é esta função, que aponta o campo e leva o cursor até lá. */
  function tentarSalvar() {
    if (ocupado) return
    const erros = {}
    if (!String(form.nome ?? '').trim()) erros.nome = 'Dê um nome para achar este conteúdo na lista.'
    if (!form.id && !form.imagem) erros.imagem = 'Escolha a imagem que vai aparecer na TV.'
    if (Object.keys(erros).length) {
      setFaltando(erros)
      if (erros.nome) nomeRef.current?.focus()
      return
    }
    aoSalvar(form)
  }

  return (
    // Modal fecha só por botão — regra do projeto. Clique no fundo não descarta trabalho.
    <div className="modal-overlay">
      <div className="modal ttm-banner-modal">
        <div className="modal-header">
          <h2>{form.id ? 'Editar conteúdo' : 'Novo conteúdo'}</h2>
        </div>
        <div className="ttm-banner-corpo">
          {/* A prévia é 16:9 com `cover` — o MESMO recorte da TV. Não é ilustração: é a
              resposta para "o que vai ser cortado?". */}
          <div className="tvi-previa">
            {form.previa
              ? <img src={form.previa} alt="" />
              : <div className="ttm-dica" style={{ margin: 0, textAlign: 'center' }}>A prévia aparece aqui</div>}
          </div>

          <div className="ttm-banner-campos">
            <div className="form-group">
              <label className="form-label" htmlFor="tvi-nome">
                Nome <span className="ttm-obrigatorio" aria-hidden="true">*</span>
              </label>
              <input
                id="tvi-nome"
                ref={nomeRef}
                className={'form-input' + (faltando.nome ? ' invalido' : '')}
                maxLength={60}
                value={form.nome}
                onChange={campo('nome')}
                placeholder="Ex.: Combo de terça"
                aria-required="true"
                aria-invalid={faltando.nome ? 'true' : undefined}
              />
              {faltando.nome
                ? <div className="ttm-erro-campo" role="alert">{faltando.nome}</div>
                : <div className="ttm-dica">Só para você se achar na lista. O cliente não vê.</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tvi-img">
                Imagem {!form.id && <span className="ttm-obrigatorio" aria-hidden="true">*</span>}
              </label>
              <input
                id="tvi-img"
                type="file"
                className={'form-input' + (faltando.imagem ? ' invalido' : '')}
                accept="image/png,image/jpeg,image/webp"
                aria-invalid={faltando.imagem ? 'true' : undefined}
                onChange={(e) => escolherArquivo(e.target.files?.[0])}
              />
              {faltando.imagem ? <div className="ttm-erro-campo" role="alert">{faltando.imagem}</div> : null}
              <div className="ttm-dica">
                <strong>{medida.largura} × {medida.altura} px</strong> (16:9 deitado, o formato da TV).
                PNG, JPG ou WEBP, até {limites?.imagemKb ?? 700} KB — a imagem é reduzida antes de subir.
                Arte noutra proporção é cortada nas bordas para preencher a tela.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tvi-dur">Tempo na tela</label>
              <input
                id="tvi-dur" type="number" className="form-input" style={{ maxWidth: 140 }}
                min={limites?.duracaoMin ?? 3} max={limites?.duracaoMax ?? 120}
                value={form.duracaoSegundos} onChange={campo('duracaoSegundos')}
              />
              <div className="ttm-dica">
                Segundos, de {limites?.duracaoMin ?? 3} a {limites?.duracaoMax ?? 120}. Só faz diferença quando a playlist tem mais de um conteúdo no ar.
              </div>
            </div>

            <div className="ttm-banner-datas">
              <div className="form-group">
                <label className="form-label" htmlFor="tvi-ini">Começa em</label>
                <input id="tvi-ini" type="datetime-local" className="form-input" value={form.inicioEm} onChange={campo('inicioEm')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="tvi-fim">Termina em</label>
                <input id="tvi-fim" type="datetime-local" className="form-input" value={form.fimEm} onChange={campo('fimEm')} />
              </div>
            </div>
            <div className="ttm-dica">
              Em branco, o conteúdo fica no ar enquanto estiver ligado. Agendado, ele já vai para as TVs e
              entra sozinho na hora marcada — sem ninguém mexer no aparelho.
            </div>
          </div>
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
