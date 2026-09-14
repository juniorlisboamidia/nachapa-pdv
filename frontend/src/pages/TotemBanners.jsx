import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import PreviaBannerTotem from '../components/PreviaBannerTotem'
import { useAuth } from '../contexts/AuthContext'

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
// Arrastar a linha, com o HTML5 nativo (draggable + dragover + drop). Nenhuma biblioteca:
// trazer uma dependência de drag-and-drop para ordenar uma lista de cinco itens custaria
// mais do que resolve.
//
// Arrastar NÃO pode ser o único caminho — num tablet, e para quem navega por teclado, ele
// simplesmente não existe. A alça é um botão focalizável que responde a ↑/↓, e é esse
// caminho que a lista garante.
//
// Os dois terminam no mesmo lugar: a ordem é reescrita por POSIÇÃO no servidor, e não por
// troca de vizinhos — trocar dois deixa buracos e empates quando duas abas mexem juntas.

const STATUS = {
  ATIVO: { texto: 'Ativo', cor: 'badge-green' },
  AGENDADO: { texto: 'Agendado', cor: 'badge-orange' },
  ENCERRADO: { texto: 'Encerrado', cor: 'badge-gray' },
  INATIVO: { texto: 'Inativo', cor: 'badge-gray' },
}

const TIPOS = [
  { id: 'CAPA', rota: 'capa', rotulo: 'Capa', ondeAparece: 'A faixa no topo do catálogo, enquanto o cliente escolhe.' },
  { id: 'ESPERA', rota: 'espera', rotulo: 'Tela de espera', ondeAparece: 'A tela inteira, com o totem parado no vidro.' },
  { id: 'FUNDO', rota: 'fundo', rotulo: 'Fundo da vitrine', ondeAparece: 'Atrás do título, na metade de cima da tela de espera padrão.' },
]

/* O tipo vem da URL, e a URL vem da SIDEBAR. Endereço torto cai na capa em vez de mostrar
   uma lista vazia — a mesma tolerância que o resto do totem tem com dado de fora. */
const tipoDaRota = (r) => TIPOS.find((t) => t.rota === String(r ?? '').toLowerCase())?.id ?? 'CAPA'

/* SVG inline, sem biblioteca — mesma técnica de `components/totem/icones.jsx`. São três
   desenhos usados só nesta tela; um pacote inteiro para isso seria peso sem uso. */
function IconeBn({ nome }) {
  const d = {
    alca: <><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
    olho: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
    lixeira: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16" /><path d="M9.5 7V5h5v2" /><path d="M6.5 7l1 12.5h9L17.5 7" /><path d="M10 11v5.5M14 11v5.5" /></g>,
  }[nome]
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{d}</svg>
}

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
  /* A aparência que a loja configurou, só para a prévia desenhar as cores e a logo certas.
     Chamada SEPARADA da lista: ela não muda enquanto o gestor mexe nos banners, então não
     tem por que voltar a cada salvamento. Se falhar, a prévia cai nas cores padrão do
     totem — é uma ilustração, não pode derrubar a tela de quem veio trocar uma arte. */
  const [aparencia, setAparencia] = useState(null)
  const [vendo, setVendo] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)
  const { tipo: tipoRota } = useParams()
  const { lojas, empresaAtual } = useAuth()
  const aba = tipoDaRota(tipoRota)

  const buscar = useCallback(() => api.get('/totem/banners')
    .then((r) => {
      setLista(Array.isArray(r.data?.banners) ? r.data.banners : [])
      setLimites(r.data?.limites ?? null)
      setErro(null)
    })
    .catch(() => setErro('Não foi possível ler os banners agora.'))
    .finally(() => setCarregando(false)), [])

  useEffect(() => { buscar() }, [buscar])
  useEffect(() => {
    let vivo = true
    api.get('/totem/aparencia')
      .then((r) => { if (vivo) setAparencia(r.data ?? null) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  async function alternar(b) {
    setOcupado(true)
    try {
      await api.put(`/totem/banners/${b.id}`, { ativo: !b.ativo })
      await buscar()
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível alterar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  /* A reordenação é DENTRO do tipo: só os ids da aba visível são enviados, e o servidor
     reescreve a ordem por POSIÇÃO. Misturar os dois tipos numa lista só faria uma capa
     trocar de lugar com um banner da tela de espera. */
  async function reordenar(ids) {
    setOcupado(true)
    try {
      const r = await api.put('/totem/banners/ordem', { ids })
      setLista(r.data?.banners ?? lista)
    } catch (e) { setToast({ message: erroDe(e, 'Não foi possível reordenar.'), type: 'error' }) } finally { setOcupado(false) }
  }

  // Um passo, para o teclado. Arrastar usa `soltarEm`, que move para a posição de destino.
  async function mover(indice, passo) {
    const doTipo = lista.filter((b) => b.tipo === aba)
    const destino = indice + passo
    if (destino < 0 || destino >= doTipo.length) return
    const ids = doTipo.map((b) => b.id)
    ;[ids[indice], ids[destino]] = [ids[destino], ids[indice]]
    await reordenar(ids)
  }

  /* Arrastar move a linha PARA a posição de destino, e não troca com o vizinho: trocar
     dois é o que o botão de subir faz, e num arrasto de três posições o resultado seria
     outro. `mover` continua existindo porque é ele que o teclado usa. */
  async function soltarEm(destino) {
    const origem = arrastando
    setArrastando(null)
    if (origem === null || origem === destino) return
    const doTipo = visiveis.map((b) => b.id)
    const [movido] = doTipo.splice(origem, 1)
    doTipo.splice(destino, 0, movido)
    await reordenar(doTipo)
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

  /* Sem `useMemo` à mão: o React Compiler está ligado neste projeto e já dá identidade
     estável a este array. Isso importa aqui — o carrossel da prévia guarda um `setTimeout`
     com a duração da arte atual, e se o array fosse novo a cada render o temporizador
     reiniciaria junto e a prévia nunca giraria. Escrever o `useMemo` mesmo assim faz o
     compilador DESISTIR do arquivo inteiro, que é o contrário do que se quer. */
  const visiveis = lista.filter((b) => b.tipo === aba)
  const noAr = visiveis.filter((b) => b.status === 'ATIVO').length
  const medida = limites?.medidas?.[aba] ?? (aba === 'CAPA' ? { largura: 1200, altura: 400 } : { largura: 1080, altura: 1920 })
  // Só serve de reserva para quando a loja não subiu logo — é o que o totem desenha.
  const inicial = (lojas.find((l) => String(l.id) === String(empresaAtual))?.nome ?? '?').trim().charAt(0).toUpperCase() || '?'

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

      {/* Sem seletor aqui dentro: quem escolhe entre Capa e Tela de espera é a SIDEBAR,
          no mesmo drill que o resto do PDV usa. Um seletor na página duplicaria a
          navegação que já existe ao lado. */}
      <div className="page-header">
        <div>
          <h1>{TIPOS.find((t) => t.id === aba)?.rotulo ?? 'Banners'}</h1>
          <div className="page-header-sub">
            {TIPOS.find((t) => t.id === aba)?.ondeAparece}
          </div>
        </div>
      </div>

      {/* Uma barra, três informações: o que fazer, o que já está no ar e em que tamanho
          desenhar a arte.

          Aqui havia um parágrafo que repetia a linha de baixo do título e ainda explicava
          o comportamento do totem. Explicação que se repete deixa de ser lida — e a que
          sobrou é a única que muda uma decisão de quem está nesta tela: a medida. */}
      <div className="ttm-bn-barra">
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => setEditando(vazio(limites, aba))}>
          {{ CAPA: 'Nova capa', ESPERA: 'Novo banner', FUNDO: 'Novo fundo' }[aba] ?? 'Novo'}
        </button>
        {/* NO AR, não "cadastradas": conta o status, que já pesa o liga-desliga e a agenda
            juntos. Uma capa agendada para amanhã está cadastrada e não está aparecendo. */}
        <span className={'badge ' + (noAr ? 'badge-green' : 'badge-gray')}>
          {noAr === 0 ? 'Nada no ar' : `${noAr} no ar`}
        </span>
        <span className="ttm-bn-medida">
          Sugestão de tamanho: <strong>{medida.largura} × {medida.altura} px</strong>
        </span>
      </div>

      {/* Lista à esquerda, prévia à direita. A tela é larga e a lista é estreita por
          natureza — sobrava metade da largura, e a pergunta que o gestor tem aqui ("como
          isso vai ficar?") não tinha resposta sem ir até o totem olhar. */}
      <div className="ttm-bn-split">
        <div>
        {visiveis.length === 0 ? (
          <div className="empty-state">
            {{
              CAPA: 'Nenhuma capa cadastrada. O cabeçalho do catálogo está mostrando o título.',
              ESPERA: 'Nenhum banner cadastrado. O totem está mostrando a vitrine — que é o padrão, não um caso degradado.',
              FUNDO: 'Nenhum fundo cadastrado. A metade de cima da vitrine usa o chão do template.',
            }[aba]}
          </div>
        ) : (
          /* Lista de CARTÕES, não tabela. A arte é o assunto da linha, e numa tabela ela
             virava uma célula do lado de cinco colunas de texto. Aqui ela ocupa a linha e o
             resto se organiza em volta.
             A ORDEM é o número à esquerda, e ele só significa alguma coisa quando há mais de
             uma arte no ar ao mesmo tempo — é a sequência do rodízio. */
          <ul className="ttm-bn-lista">
            {visiveis.map((b, i) => (
              <li
                key={b.id}
                className={'ttm-bn' + (b.ativo ? '' : ' desligado')
                  + (arrastando === i ? ' arrastando' : '')
                  + (sobre === i && arrastando !== null && arrastando !== i ? ' sobre' : '')}
                draggable={!ocupado}
                onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { setArrastando(null); setSobre(null) }}
                /* `preventDefault` no dragover é o que AUTORIZA o drop — sem ele o navegador
                   recusa a soltura e o arrasto volta sozinho para o lugar. */
                onDragOver={(e) => { e.preventDefault(); if (sobre !== i) setSobre(i) }}
                onDrop={(e) => { e.preventDefault(); setSobre(null); soltarEm(i) }}
              >
                {/* A alça é BOTÃO, e responde às setas do teclado: arrastar não pode ser o
                    único jeito de reordenar, senão quem não usa mouse fica de fora. */}
                <button
                  type="button"
                  className="ttm-bn-alca"
                  disabled={ocupado}
                  aria-label={`Reordenar ${b.nome}. Posição ${i + 1} de ${visiveis.length}. Use as setas para cima e para baixo.`}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); mover(i, -1) }
                    if (e.key === 'ArrowDown') { e.preventDefault(); mover(i, 1) }
                  }}
                >
                  <IconeBn nome="alca" />
                </button>
                <span className="ttm-bn-num">{i + 1}</span>

                {/* A arte abre a edição: é o alvo grande e óbvio da linha. */}
                <button
                  type="button"
                  className={'ttm-bn-arte' + (aba === 'CAPA' ? ' capa' : '')}
                  disabled={ocupado}
                  onClick={() => setEditando(deBanner(b))}
                  title="Editar"
                >
                  {/* A imagem tem arrasto próprio no navegador: sem isto, puxar pela arte
                      arrastaria a FIGURA em vez da linha. */}
                  <img src={b.imagemUrl} alt="" draggable={false} />
                </button>

                <div className="ttm-bn-info">
                  <button type="button" className="ttm-bn-nome" disabled={ocupado} onClick={() => setEditando(deBanner(b))}>
                    {b.nome}
                  </button>
                  <div className="ttm-bn-meta">
                    <span className={'badge ' + STATUS[b.status].cor}>{STATUS[b.status].texto}</span>
                    <span>{textoAgenda(b)}</span>
                    <span>{b.duracaoSegundos}s</span>
                  </div>
                </div>

                <div className="ttm-bn-acoes">
                  <button type="button" className="ttm-bn-ico" disabled={ocupado} title="Visualizar" aria-label={`Visualizar ${b.nome}`} onClick={() => setVendo(b)}>
                    <IconeBn nome="olho" />
                  </button>
                  {/* Toggle de verdade, com semântica de interruptor — o rótulo diz o que ele
                      faz, e não só o estado em que está. */}
                  <button
                    type="button"
                    className={'intel-switch' + (b.ativo ? ' on' : '')}
                    role="switch"
                    aria-checked={b.ativo}
                    aria-label={`${b.ativo ? 'Desativar' : 'Ativar'} ${b.nome}`}
                    disabled={ocupado}
                    onClick={() => alternar(b)}
                  />
                  <button type="button" className="ttm-bn-ico perigo" disabled={ocupado} title="Excluir" aria-label={`Excluir ${b.nome}`} onClick={() => setExcluindo(b)}>
                    <IconeBn nome="lixeira" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>

        <PreviaBannerTotem
          tipo={aba}
          itens={visiveis}
          cores={aparencia?.efetivas}
          logoUrl={aparencia?.logo?.tem ? aparencia.logo.url : null}
          inicial={inicial}
          posicaoCategorias={aparencia?.posicaoCategoriasPadrao}
        />
      </div>

      {vendo && (
        /* Visualizar é só ver: nenhuma ação, e fecha por botão como todo modal do PDV. */
        <div className="modal-overlay">
          <div className="modal ttm-bn-ver">
            <div className="modal-header"><h2>{vendo.nome}</h2></div>
            <div className={'ttm-bn-ver-arte' + (vendo.tipo === 'CAPA' ? ' capa' : '')}>
              <img src={vendo.imagemUrl} alt="" />
            </div>
            <div className="ttm-banner-rodape">
              <button type="button" className="btn btn-secondary" onClick={() => setVendo(null)}>Fechar</button>
            </div>
          </div>
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
  // O que FALTA, por campo. Só aparece depois de tentar salvar: cobrar um campo que o
  // gestor ainda nem chegou a preencher é ruído, não ajuda.
  const [faltando, setFaltando] = useState({})
  const nomeRef = useRef(null)
  const medida = limites?.medidas?.[form.tipo] ?? { largura: 1080, altura: 1920 }

  // Digitar limpa o aviso daquele campo na hora. Erro que fica na tela depois de
  // corrigido ensina o gestor a ignorar aviso.
  const campo = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFaltando((x) => (x[k] ? { ...x, [k]: null } : x))
  }

  async function escolherArquivo(arquivo) {
    if (!arquivo) return
    try {
      const dataUrl = await reduzirImagem(arquivo, form.tipo === 'CAPA' ? 1200 : 1920)
      setForm((f) => ({ ...f, imagem: dataUrl, previa: dataUrl }))
      setFaltando((x) => (x.imagem ? { ...x, imagem: null } : x))
    } catch {
      aoAvisar('Não foi possível ler esse arquivo. Use PNG, JPG ou WEBP.')
    }
  }

  /* O botão NÃO fica desabilitado por falta de preenchimento.

     Desabilitado é o pior estado possível aqui: o gestor aperta, nada acontece, e a tela
     não diz o que está errado nem onde. Ele fica enabled, e quem recusa é esta função —
     que aponta o campo, escreve o que falta e leva o cursor até lá. */
  function tentarSalvar() {
    if (ocupado) return
    const erros = {}
    if (!String(form.nome ?? '').trim()) erros.nome = 'Dê um nome para achar esta arte na lista.'
    if (!form.id && !form.imagem) erros.imagem = 'Escolha a imagem que vai aparecer no totem.'
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
          <h2>{(form.id ? 'Editar ' : 'Nova ') + ({ CAPA: 'capa', ESPERA: 'arte da tela de espera', FUNDO: 'arte de fundo da vitrine' }[form.tipo] ?? 'arte')}</h2>
        </div>
        <div className="ttm-banner-corpo">
          <div className={'ttm-banner-previa' + (form.tipo === 'CAPA' ? ' capa' : '')}>
            {form.previa
              ? <img src={form.previa} alt="" />
              : <div className="ttm-dica" style={{ margin: 0, textAlign: 'center' }}>A prévia aparece aqui</div>}
          </div>

          <div className="ttm-banner-campos">
            <div className="form-group">
              <label className="form-label" htmlFor="bn-nome">
                Nome <span className="ttm-obrigatorio" aria-hidden="true">*</span>
              </label>
              <input
                id="bn-nome"
                ref={nomeRef}
                className={'form-input' + (faltando.nome ? ' invalido' : '')}
                maxLength={60}
                value={form.nome}
                onChange={campo('nome')}
                placeholder="Ex.: Combo de terça"
                aria-required="true"
                aria-invalid={faltando.nome ? 'true' : undefined}
                aria-describedby={faltando.nome ? 'bn-nome-erro' : undefined}
              />
              {faltando.nome
                ? <div id="bn-nome-erro" className="ttm-erro-campo" role="alert">{faltando.nome}</div>
                : <div className="ttm-dica">Só para você se achar na lista. O cliente não vê.</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="bn-img">
                Imagem {!form.id && <span className="ttm-obrigatorio" aria-hidden="true">*</span>}
              </label>
              <input
                id="bn-img"
                type="file"
                className={'form-input' + (faltando.imagem ? ' invalido' : '')}
                accept="image/png,image/jpeg,image/webp"
                aria-invalid={faltando.imagem ? 'true' : undefined}
                onChange={(e) => escolherArquivo(e.target.files?.[0])}
              />
              {faltando.imagem ? <div className="ttm-erro-campo" role="alert">{faltando.imagem}</div> : null}
              <div className="ttm-dica">
                Recomendado: <strong>{medida.largura} × {medida.altura} px</strong>{' '}
                {{
                  CAPA: '— a mesma proporção da capa do Cardápio Web, então dá para usar a mesma arte nos dois.',
                  ESPERA: '(retrato, a tela inteira do totem).',
                  // A tela inteira mesmo, e não a metade: o recorte é `cover`, e pedir meia
                  // tela obrigaria a loja a pensar num enquadramento que a tela já resolve.
                  FUNDO: '(retrato — a vitrine usa a metade de cima, recortando o resto).',
                }[form.tipo]}
                {' '}PNG, JPG ou WEBP, até {limites?.imagemKb ?? 700} KB. A imagem é reduzida antes de subir.
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
          {/* Só desabilita enquanto SALVA — nunca por falta de preenchimento. */}
          <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={ocupado}>
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
