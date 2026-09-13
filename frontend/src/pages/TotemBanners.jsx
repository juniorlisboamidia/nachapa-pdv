import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// Loja Digital › Totem › Aparência › Banners.
//
// DOIS lugares, um cadastro só:
//
//   CAPA   — a faixa no topo do catálogo, enquanto o cliente escolhe. Não é tocável; o
//            único alvo daquela faixa continua sendo o Cancelar.
//   BANNER — a tela inteira, com o totem parado no vidro. Tocar nele começa uma sessão,
//            exatamente como tocar em qualquer outro lugar da espera já fazia.
//
// Nenhum dos dois tem CTA no V1: não existe pular para produto ou categoria a partir de
// uma arte — isso é outro produto.
//
// Sem arte elegível, cada lugar tem o seu padrão: a espera institucional e o cabeçalho com
// o título. Nenhum dos dois é caso degradado — os dois são o normal.
//
// ── ORDENAÇÃO SEM BIBLIOTECA ──────────────────────────────────────────────────────────
// Subir/descer, e não arrastar. O projeto não tem infraestrutura de drag-and-drop, e trazer
// uma dependência para ordenar uma lista de cinco itens custaria mais do que resolve. A
// ordem é reescrita por POSIÇÃO no servidor, não por troca de vizinhos — trocar dois deixa
// buracos e empates quando duas abas mexem juntas.

const STATUS = {
  ATIVO: { texto: 'Ativo', cor: 'badge-green' },
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Inativo', cor: 'badge-gray' },
}

const TIPOS = [
  { id: 'CAPA', rotulo: 'Capa', ondeAparece: 'A faixa no topo do catálogo, enquanto o cliente escolhe.' },
  { id: 'ESPERA', rotulo: 'Tela de espera', ondeAparece: 'A tela inteira, com o totem parado no vidro.' },
]

const erroDe = (e, fallback) => {
  const erros = e?.response?.data?.erros
  if (erros?.length) {
    const m = {
      NOME_OBRIGATORIO: 'Dê um nome ao banner.',
      DURACAO_INVALIDA: 'A duração está fora da faixa permitida.',
      DATA_INVALIDA: 'A data informada não é válida.',
      TIPO_INVALIDO: 'Escolha onde a arte vai aparecer.',
      JANELA_INVALIDA: 'O fim precisa ser depois do início.',
      IMAGEM_AUSENTE: 'Escolha uma imagem.',
      IMAGEM_FORMATO: 'Arquivo inválido. Use PNG, JPG ou WEBP.',
      IMAGEM_TIPO: 'O arquivo não é a imagem que o nome diz ser.',
      IMAGEM_GRANDE: 'A imagem ficou grande demais mesmo depois de reduzida.',
    }
    return m[erros[0].motivo] ?? fallback
  }
  return e?.response?.data?.error ?? fallback
}

export default function TotemBanners() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [lista, setLista] = useState([])
  const [limites, setLimites] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)   // { id? , tipo, nome, duracaoSegundos, ... }
  const [excluindo, setExcluindo] = useState(null)
  const [aba, setAba] = useState('CAPA')

  const buscar = useCallback(() => api.get('/totem/banners')
    .then((r) => {
      setLista(Array.isArray(r.data?.banners) ? r.data.banners : [])
      setLimites(r.data?.limites ?? null)
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler os banners agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])

  async function alternar(b) {
    setOcupado(true)
    try {
      await api.put(`/totem/banners/${b.id}`, { ativo: !b.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function mover(indice, passo) {
    // A reordenação é DENTRO do tipo: só os ids da aba visível são enviados, e o servidor
    // reescreve a ordem por posição. Misturar os dois tipos numa lista só faria uma capa
    // trocar de lugar com um banner da espera.
    const doTipo = lista.filter((b) => b.tipo === aba)
    const destino = indice + passo
    if (destino < 0 || destino >= doTipo.length) return
    const ids = doTipo.map((b) => b.id)
    ;[ids[indice], ids[destino]] = [ids[destino], ids[indice]]
    setOcupado(true)
    try {
      const r = await api.put('/totem/banners/ordem', { ids })
      setLista(r.data?.banners ?? lista)
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível reordenar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function excluir() {
    if (!excluindo) return
    setOcupado(true)
    try {
      await api.delete(`/totem/banners/${excluindo.id}`)
      setExcluindo(null)
      await buscar()
      setToast({ message: 'Banner excluído.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível excluir.'), type: 'error' }) } finally { setOcupado(false) }
  }

  async function salvar(form) {
    setOcupado(true)
    try {
      const corpo = {
        nome: form.nome,
        tipo: form.tipo,
        duracaoSegundos: Number(form.duracaoSegundos),
        inicioEm: paraIso(form.inicioEm),
        fimEm: paraIso(form.fimEm),
      }
      if (form.id) {
        await api.put(`/totem/banners/${form.id}`, corpo)
        if (form.imagem) await api.put(`/totem/banners/${form.id}/imagem`, { imagem: form.imagem })
      } else {
        await api.post('/totem/banners', { ...corpo, imagem: form.imagem })
      }
      setEditando(null)
      await buscar()
      setToast({ message: form.id ? 'Banner atualizado.' : 'Banner criado.', type: 'success' })
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível salvar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  const visiveis = lista.filter((b) => b.tipo === aba)

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

      <nav className="ttm-abas" aria-label="Onde a arte aparece">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'ttm-aba' + (t.id === aba ? ' ativa' : '')}
            aria-current={t.id === aba ? 'true' : undefined}
            onClick={() => setAba(t.id)}
          >
            {t.rotulo}
            <span className="ttm-aba-conta">{lista.filter((b) => b.tipo === t.id).length}</span>
          </button>
        ))}
      </nav>

      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ttm-nota" style={{ marginTop: 0 }}>
          {TIPOS.find((t) => t.id === aba)?.ondeAparece}{' '}
          {aba === 'CAPA'
            ? 'Ela não é tocável — o único alvo daquela faixa é o botão de cancelar. Sem capa no ar, o cabeçalho mostra o título de sempre.'
            : 'Tocar nela começa o pedido, como tocar em qualquer outro lugar da tela. Sem banner no ar, o totem mostra a tela institucional.'}
        </div>
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => setEditando(vazio(limites, aba))}>
          {aba === 'CAPA' ? 'Nova capa' : 'Novo banner'}
        </button>
      </div>

      {visiveis.length === 0 ? (
        <div className="empty-state">
          {aba === 'CAPA'
            ? 'Nenhuma capa cadastrada. O cabeçalho do catálogo está mostrando o título.'
            : 'Nenhum banner cadastrado. O totem está mostrando a tela institucional.'}
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table hb-table-compact">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Arte</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Agenda</th>
                <th>Duração</th>
                <th style={{ width: 90 }}>Ordem</th>
                <th className="ttm-acoes-col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((b, i) => (
                <tr key={b.id}>
                  <td>
                    <img className="ttm-banner-mini" src={b.imagemUrl} alt="" />
                  </td>
                  <td>
                    <div className="apr-nome">{b.nome}</div>
                    {b.imagemBytes ? <div className="ttm-meta-txt">{Math.round(b.imagemBytes / 1024)} KB</div> : null}
                  </td>
                  <td><span className={'badge ' + STATUS[b.status].cor}>{STATUS[b.status].texto}</span></td>
                  <td className="ttm-meta-txt">{textoAgenda(b)}</td>
                  <td className="ttm-nowrap">{b.duracaoSegundos}s</td>
                  <td>
                    <div className="ttm-ordem">
                      <button type="button" className="btn btn-secondary" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                      <button type="button" className="btn btn-secondary" disabled={ocupado || i === visiveis.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                    </div>
                  </td>
                  <td>
                    <div className="ttm-acoes">
                      <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => alternar(b)}>
                        {b.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setEditando(deBanner(b))}>Editar</button>
                      <button type="button" className="btn btn-danger" disabled={ocupado} onClick={() => setExcluindo(b)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
        title="Excluir este banner?"
        message={excluindo ? `“${excluindo.nome}”` : ''}
        description="A arte é apagada junto e não tem como voltar. Se a ideia é só tirar do ar por um tempo, use Desativar."
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
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const medida = limites?.medidas?.[form.tipo] ?? { largura: 1080, altura: 1920 }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    try {
      const dataUrl = await reduzirImagem(arquivo, form.tipo === 'CAPA' ? 1080 : 1920)
      setForm((f) => ({ ...f, imagem: dataUrl, previa: dataUrl }))
    } catch {
      aoAvisar('Não foi possível ler esse arquivo. Use PNG, JPG ou WEBP.')
    }
  }

  const podeSalvar = form.nome.trim() && (form.id || form.imagem) && !ocupado

  return (
    // Modal fecha só por botão — regra do projeto. Clique no fundo não descarta trabalho.
    <div className="modal-overlay">
      <div className="modal ttm-banner-modal">
        <div className="modal-header">
          <h2>{(form.id ? 'Editar ' : 'Nova ') + (form.tipo === 'CAPA' ? 'capa' : 'arte da tela de espera')}</h2>
        </div>
        <div className="ttm-banner-corpo">
          <div className={'ttm-banner-previa' + (form.tipo === 'CAPA' ? ' capa' : '')}>
            {form.previa
              ? <img src={form.previa} alt="" />
              : <div className="ttm-dica" style={{ margin: 0, textAlign: 'center' }}>A prévia aparece aqui</div>}
          </div>

          <div className="ttm-banner-campos">
            <div className="form-group">
              <label className="form-label" htmlFor="bn-nome">Nome</label>
              <input id="bn-nome" className="form-input" maxLength={60} value={form.nome} onChange={campo('nome')} placeholder="Ex.: Combo de terça" />
              <div className="ttm-dica">Só para você se achar na lista. O cliente não vê.</div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="bn-img">Imagem</label>
              <input id="bn-img" type="file" className="form-input" accept="image/png,image/jpeg,image/webp" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
              <div className="ttm-dica">
                Recomendado: <strong>{medida.largura} × {medida.altura} px</strong>{' '}
                {form.tipo === 'CAPA' ? '(faixa deitada, o topo do catálogo)' : '(retrato, a tela inteira do totem)'}.
                PNG, JPG ou WEBP, até {limites?.imagemKb ?? 700} KB. A imagem é reduzida antes de subir.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="bn-dur">Duração na tela</label>
              <input
                id="bn-dur" type="number" className="form-input" style={{ maxWidth: 140 }}
                min={limites?.duracaoMin ?? 3} max={limites?.duracaoMax ?? 60}
                value={form.duracaoSegundos} onChange={campo('duracaoSegundos')}
              />
              <div className="ttm-dica">
                Segundos, de {limites?.duracaoMin ?? 3} a {limites?.duracaoMax ?? 60}. Só faz diferença com mais de um banner no ar.
              </div>
            </div>

            <div className="ttm-banner-datas">
              <div className="form-group">
                <label className="form-label" htmlFor="bn-ini">Começa em</label>
                <input id="bn-ini" type="datetime-local" className="form-input" value={form.inicioEm} onChange={campo('inicioEm')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="bn-fim">Termina em</label>
                <input id="bn-fim" type="datetime-local" className="form-input" value={form.fimEm} onChange={campo('fimEm')} />
              </div>
            </div>
            <div className="ttm-dica">Deixe em branco para o banner ficar no ar enquanto estiver ativo.</div>
          </div>
        </div>
        <div className="ttm-banner-rodape">
          <button type="button" className="btn btn-secondary" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => aoSalvar(form)} disabled={!podeSalvar}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── auxiliares ─────────────────────────────────────────────────────────────
const vazio = (limites, tipo) => ({ id: null, tipo, nome: '', duracaoSegundos: limites?.duracaoPadrao ?? 6, inicioEm: '', fimEm: '', imagem: null, previa: null })
const deBanner = (b) => ({
  id: b.id, tipo: b.tipo, nome: b.nome, duracaoSegundos: b.duracaoSegundos,
  inicioEm: paraCampo(b.inicioEm), fimEm: paraCampo(b.fimEm),
  imagem: null, previa: b.imagemUrl,
})

/* O campo `datetime-local` fala em hora LOCAL do navegador. O banco guarda instante
   absoluto: `new Date(local).toISOString()` faz a conversão usando o fuso de quem está
   configurando, que é o fuso da loja. Assim a agenda não depende de onde o servidor está
   hospedado — o PDV não tem fuso por loja, e inventar um a partir do VPS seria pior. */
function paraIso(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

/* O caminho de volta: instante absoluto → o texto que o campo entende, na hora local. */
function paraCampo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function textoAgenda(b) {
  if (!b.inicioEm && !b.fimEm) return 'Sem agenda'
  const f = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (b.inicioEm && b.fimEm) return `${f(b.inicioEm)} → ${f(b.fimEm)}`
  if (b.inicioEm) return `A partir de ${f(b.inicioEm)}`
  return `Até ${f(b.fimEm)}`
}

/* Reduz no CLIENTE antes de subir. O teto do servidor é de segurança; aqui é onde a arte
   de 4000px que veio do celular do gestor vira algo do tamanho da tela do totem.
   JPEG a 88% porque banner é fotografia — PNG guardaria a mesma arte em três vezes o
   tamanho, e transparência não serve para nada numa imagem que ocupa a tela inteira. */
function reduzirImagem(arquivo, ladoMaior = 1920) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('leitura'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('imagem'))
      img.onload = () => {
        const escala = Math.min(1, ladoMaior / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * escala))
        const h = Math.max(1, Math.round(img.height * escala))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
}
