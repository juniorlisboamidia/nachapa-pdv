// Loja Digital › Totem › Apresentação (spec §8) — quem decide o que o cliente vê no totem.
//
// A ideia em uma frase: alguns itens do Cardápio Web são, na verdade, uma VITRINE. O item
// "TRADICIONAIS 🍔" custa R$ 0,00 e existe só para segurar um grupo "escolha 1 de 1" com
// nove hambúrgueres dentro. No totem isso vira uma tela com um card só, e o cliente precisa
// abrir e escolher para ver o que existe. No modo EXPANDIDO cada opção daquele grupo vira um
// card próprio — com o nome, a foto, a descrição e o preço dela.
//
// Três regras que esta tela existe para respeitar (§1 do plano):
//  1. NADA é automático. Só vira vitrine o item que alguém marcou aqui, um por um. A seção
//     "Sugestões" é palpite: ela preenche o formulário e nada mais.
//  2. Quem diz se uma configuração é possível é o SERVIDOR, com o catálogo vivo na mão
//     (`validarConfiguracao`). Esta tela só mostra o veredito: grupo não `selecionavel`
//     entra no select DESABILITADO, com o código do motivo à vista.
//  3. NORMAL não é um estado guardado: é a AUSÊNCIA de configuração. Voltar para NORMAL
//     apaga a linha — e é também o que remove uma órfã.
import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// Erros de CARREGAMENTO (409/503 do §7). Todos falam do mesmo problema por ângulos
// diferentes: sem o catálogo vivo não há o que validar nem o que listar.
const ERROS_CARGA = {
  CLIENTE_SEM_CW: 'Esta loja ainda não está ligada ao Cardápio Web. Vincule o cliente antes de configurar a vitrine do totem.',
  HUB_NAO_CONFIGURADO: 'A ponte com o Cardápio Web ainda não está configurada para esta loja.',
  HUB_INDISPONIVEL: 'Não foi possível falar com o sistema agora. Tente de novo em instantes.',
  CATALOGO_INDISPONIVEL: 'O cardápio não pôde ser lido agora. Tente de novo em instantes.',
}
// Erros de SALVAMENTO (400/422).
const ERROS_SALVAR = {
  ID_INVALIDO: 'Item inválido.',
  MODO_INVALIDO: 'Modo inválido.',
  GRUPO_OBRIGATORIO: 'Escolha o grupo principal antes de salvar.',
  APRESENTACAO_INVALIDA: 'Esta configuração não é possível.',
}
// Códigos de VALIDAÇÃO (o veredito do servidor sobre um item ou um grupo). Frase curta,
// porque ela aparece dentro de uma linha da tabela e dentro de um <option> desabilitado.
const MOTIVOS = {
  ITEM_AUSENTE: 'o item não existe mais no cardápio',
  GRUPO_AUSENTE: 'o grupo escolhido não existe mais neste item',
  GRUPO_INDISPONIVEL: 'o grupo está inativo no cardápio',
  GRUPO_NAO_E_ESCOLHA_UNICA: 'não é "escolha 1 de 1"',
  GRUPO_SEM_OPCOES: 'o grupo está sem opções',
  OUTRO_GRUPO_OBRIGATORIO: 'o item tem outro grupo obrigatório',
  MODO_INVALIDO: 'modo inválido',
}
// O código CRU acompanha a frase: é ele que aparece no aviso do bootstrap e nos testes, e é
// por ele que o Junior procura quando algo não bate.
const motivo = (codigo) => (codigo ? `${MOTIVOS[codigo] ?? 'não é possível'} (${codigo})` : '')

const erroDe = (e, mapa, fallback) => {
  const d = e?.response?.data
  return mapa[d?.erro] ?? mapa[d?.codigo] ?? d?.error ?? fallback
}
const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const regraDoGrupo = (g) => {
  const max = g.max === null || g.max === undefined ? '∞' : g.max
  return `${g.choiceType ?? '—'} · ${g.min}–${max} · ${g.nOpcoes} ${g.nOpcoes === 1 ? 'opção' : 'opções'}`
}

export default function TotemApresentacao() {
  const [dados, setDados] = useState(null)     // { itens, orfas, sugestoes, avisosApresentacao }
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(null)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({})         // { [cwItemId]: { modo, grupoId } }
  const [salvando, setSalvando] = useState(null)   // cwItemId em voo
  const [confirmNormal, setConfirmNormal] = useState(null) // { cwItemId, nome }
  const [confirmOrfa, setConfirmOrfa] = useState(null)     // órfã

  const notify = (message, type = 'success') => setToast({ message, type })

  function carregar() {
    setCarregando(true)
    api.get('/totem/apresentacao')
      .then((r) => {
        setDados(r.data)
        setErroCarga(null)
        // O formulário nasce espelhando o que está salvo: quem abre a tela vê o estado
        // real, e "Salvar" sem mexer em nada não muda nada.
        const inicial = {}
        for (const it of (Array.isArray(r.data?.itens) ? r.data.itens : [])) {
          inicial[String(it.cwItemId)] = {
            modo: it.config?.modo ?? 'NORMAL',
            grupoId: it.config?.cwGrupoPrincipalId ? String(it.config.cwGrupoPrincipalId) : '',
          }
        }
        setForm(inicial)
      })
      .catch((e) => {
        setDados(null)
        setErroCarga(erroDe(e, ERROS_CARGA, 'Não foi possível carregar a apresentação do totem.'))
      })
      .finally(() => setCarregando(false))
  }

  // Sem Promise devolvida do efeito (regra do projeto): a função chama, o efeito não espera.
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // PUT único das duas ações (§4.3). NORMAL não precisa de catálogo no servidor — é por
  // isso que remover uma órfã funciona mesmo quando o GET desta tela está devolvendo 503.
  async function salvar(cwItemId, corpo, textoOk) {
    setSalvando(String(cwItemId))
    try {
      await api.put(`/totem/apresentacao/${cwItemId}`, corpo)
      notify(textoOk)
      carregar()
      return true
    } catch (e) {
      const d = e?.response?.data
      // 422 vem com `{ erro:'APRESENTACAO_INVALIDA', codigo }`: quem explica é o `codigo`.
      const texto = d?.erro === 'APRESENTACAO_INVALIDA'
        ? `Não dá para usar este grupo: ${motivo(d?.codigo)}.`
        : erroDe(e, ERROS_SALVAR, 'Não foi possível salvar.')
      notify(texto, 'error')
      return false
    } finally {
      setSalvando(null)
    }
  }

  function salvarLinha(item) {
    const f = form[String(item.cwItemId)] ?? { modo: 'NORMAL', grupoId: '' }
    if (f.modo === 'NORMAL') {
      // Sem configuração salva não há o que apagar: pedir confirmação para um PUT que
      // devolveria `removida: false` só ensinaria o operador a clicar em "sim" no vazio.
      if (!item.config) { notify(`“${item.nome}” já está em Normal.`, 'info'); return }
      setConfirmNormal({ cwItemId: item.cwItemId, nome: item.nome })
      return
    }
    if (!f.grupoId) { notify(ERROS_SALVAR.GRUPO_OBRIGATORIO, 'error'); return }
    salvar(item.cwItemId, { modo: 'EXPANDIDO', cwGrupoPrincipalId: Number(f.grupoId) }, `“${item.nome}” agora aparece como vitrine no totem.`)
  }

  const mudarForm = (cwItemId, campo, valor) => setForm((f) => ({
    ...f,
    [String(cwItemId)]: { ...(f[String(cwItemId)] ?? { modo: 'NORMAL', grupoId: '' }), [campo]: valor },
  }))

  // "Usar" da sugestão SÓ preenche o formulário da linha (§8): quem salva é o humano.
  function usarSugestao(s) {
    mudarForm(s.cwItemId, 'modo', 'EXPANDIDO')
    mudarForm(s.cwItemId, 'grupoId', String(s.cwGrupoPrincipalId))
    notify(`Formulário de “${s.nome}” preenchido. Confira e clique em Salvar.`, 'info')
  }

  const itens = Array.isArray(dados?.itens) ? dados.itens : []
  const orfas = Array.isArray(dados?.orfas) ? dados.orfas : []
  const sugestoes = Array.isArray(dados?.sugestoes) ? dados.sugestoes : []
  const expandidos = itens.filter((i) => i.config?.modo === 'EXPANDIDO').length
  const invalidos = itens.filter((i) => i.config && !i.validacao?.ok).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Apresentação do totem</h1>
          <div className="page-header-sub">
            Alguns itens do cardápio são só uma <strong>capa</strong>: “TRADICIONAIS 🍔” custa R$ 0,00 e guarda nove
            hambúrgueres dentro de um grupo de escolha única. No modo <strong>Vitrine</strong> cada um desses
            hambúrgueres vira um card próprio no totem, com foto, descrição e preço. O pedido enviado ao Cardápio Web
            é exatamente o mesmo de antes.
          </div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {carregando ? (
        <div className="loading-state">Carregando…</div>
      ) : erroCarga ? (
        // Sem catálogo vivo não há lista — e, por tabela, não há como listar as ÓRFÃS
        // (uma órfã só se descobre comparando a configuração salva com o catálogo). O
        // caminho de remoção continua existindo no servidor (o PUT NORMAL não consulta o
        // Cardápio Web), mas ele só pode ser oferecido aqui depois que a lista carregar.
        <div className="empty-state">
          <div style={{ marginBottom: 12 }}>{erroCarga}</div>
          <button type="button" className="btn btn-primary" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : (
        <>
          <div className="ttm-filtros">
            <span className="ttm-meta-txt">
              {itens.length} {itens.length === 1 ? 'item no cardápio' : 'itens no cardápio'} ·{' '}
              {expandidos} {expandidos === 1 ? 'em vitrine' : 'em vitrine'}
              {invalidos > 0 ? ` · ${invalidos} com problema` : ''}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={carregar}>Atualizar</button>
          </div>

          {invalidos > 0 && (
            <div className="ttm-alerta-admin">
              <strong>{invalidos === 1 ? '1 configuração não está valendo' : `${invalidos} configurações não estão valendo`}.</strong>{' '}
              O cardápio mudou e elas deixaram de ser possíveis. No totem esses itens já voltaram ao modo normal —
              corrija o grupo aqui ou volte para Normal.
            </div>
          )}

          {itens.length === 0 ? (
            <div className="empty-state">Nenhum item no cardápio desta loja. Assim que o Cardápio Web tiver itens, eles aparecem aqui.</div>
          ) : (
            <div className="table-card">
              <table className="hb-table hb-table-compact">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Preço base</th>
                    <th>Hoje</th>
                    <th>Como mostrar no totem</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => {
                    const chave = String(item.cwItemId)
                    const f = form[chave] ?? { modo: 'NORMAL', grupoId: '' }
                    const emVitrine = item.config?.modo === 'EXPANDIDO'
                    const problema = item.config && !item.validacao?.ok
                    const grupoAtual = item.grupos.find((g) => String(g.id) === String(item.config?.cwGrupoPrincipalId))
                    // Nenhum grupo serve? O modo Vitrine continua ESCOLHÍVEL — é escolhendo
                    // que o operador vê a lista de grupos com cada recusa escrita (o caso
                    // COMBO - TRADICIONAIS, `OUTRO_GRUPO_OBRIGATORIO`, é justamente esse).
                    // Bloquear a opção esconderia o motivo e deixaria o item mudo.
                    const semGrupoUtil = item.grupos.every((g) => !g.selecionavel?.ok)
                    const razaoSemVitrine = !semGrupoUtil ? null : (item.grupos.length === 0
                      ? 'este item não tem grupos de escolha'
                      : (motivo(item.grupos.find((g) => g.selecionavel?.codigo)?.selecionavel?.codigo) || 'nenhum grupo serve'))
                    return (
                      <tr key={chave} className={problema ? 'ttm-linha-revisao' : undefined}>
                        <td>
                          <strong>{item.nome ?? '—'}</strong>
                          {/* Dois itens do mesmo cardápio podem se chamar "TRADICIONAIS 🍔":
                              o id é o que o humano usa para escolher o certo. */}
                          <div className="ttm-meta-txt">#{item.cwItemId}</div>
                        </td>
                        <td>{item.categoria ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{moeda(item.precoBase)}</td>
                        <td>
                          {emVitrine
                            ? <span className="badge badge-green">Vitrine</span>
                            : <span className="badge badge-slate">Normal</span>}
                          {emVitrine && grupoAtual && <div className="ttm-meta-txt">{grupoAtual.nome}</div>}
                          {problema && <div className="ttm-erro">não está valendo: {motivo(item.validacao?.codigo)}</div>}
                        </td>
                        <td>
                          <div className="ttm-apr-form">
                            <select
                              className="form-input"
                              aria-label={`Modo de ${item.nome}`}
                              value={f.modo}
                              onChange={(e) => mudarForm(item.cwItemId, 'modo', e.target.value)}
                            >
                              <option value="NORMAL">Normal (um card do item)</option>
                              <option value="EXPANDIDO">Vitrine (um card por opção)</option>
                            </select>
                            {razaoSemVitrine && (
                              <div className="ttm-erro" style={{ marginTop: 0, maxWidth: 'none' }}>
                                Vitrine não é possível: {razaoSemVitrine}.
                              </div>
                            )}
                            {f.modo === 'EXPANDIDO' && (
                              <select
                                className="form-input"
                                aria-label={`Grupo principal de ${item.nome}`}
                                value={f.grupoId}
                                onChange={(e) => mudarForm(item.cwItemId, 'grupoId', e.target.value)}
                              >
                                <option value="">Escolha o grupo principal…</option>
                                {item.grupos.map((g) => (
                                  // Grupo que o servidor NÃO aceitaria entra desabilitado, com o
                                  // motivo no próprio rótulo: o Junior descobre o porquê sem
                                  // precisar tentar e levar um 422.
                                  <option key={g.id} value={String(g.id)} disabled={!g.selecionavel?.ok}>
                                    {g.nome} — {regraDoGrupo(g)}
                                    {g.selecionavel?.ok ? '' : ` — ${motivo(g.selecionavel?.codigo)}`}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={salvando === chave}
                            onClick={() => salvarLinha(item)}
                          >
                            {salvando === chave ? 'Salvando…' : 'Salvar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Órfãs ─────────────────────────────────────────────────────── */}
          <div className="page-header" style={{ marginTop: 28 }}>
            <div>
              <h2 style={{ margin: 0 }}>Configurações órfãs</h2>
              <div className="page-header-sub">
                Itens que foram configurados aqui e depois <strong>saíram do cardápio</strong> (ou saíram do delivery).
                Não fazem mal nenhum ao totem — ele já ignora —, mas ficam guardadas até alguém remover.
              </div>
            </div>
          </div>
          {orfas.length === 0 ? (
            <div className="empty-state">Nenhuma configuração órfã. Tudo que está salvo aponta para um item que existe.</div>
          ) : (
            <div className="table-card">
              <table className="hb-table hb-table-compact">
                <thead>
                  <tr>
                    <th>Item (id do cardápio)</th>
                    <th>Grupo configurado</th>
                    <th>Situação</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orfas.map((o) => (
                    <tr key={o.id}>
                      <td>{o.cwItemId}</td>
                      <td>{o.cwGrupoPrincipalId ?? '—'}</td>
                      <td><span className="ttm-erro" style={{ marginTop: 0 }}>{motivo(o.validacao?.codigo ?? 'ITEM_AUSENTE')}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={salvando === String(o.cwItemId)}
                          onClick={() => setConfirmOrfa(o)}
                        >
                          {salvando === String(o.cwItemId) ? 'Removendo…' : 'Remover'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Sugestões ─────────────────────────────────────────────────── */}
          <div className="page-header" style={{ marginTop: 28 }}>
            <div>
              <h2 style={{ margin: 0 }}>Sugestões</h2>
              <div className="page-header-sub">
                Itens com cara de capa: preço baixo ou zerado, um único grupo obrigatório de escolha única e várias
                opções dentro. É <strong>palpite</strong>: “Usar” só preenche o formulário do item lá em cima —
                nada é ligado sem você clicar em Salvar.
              </div>
            </div>
          </div>
          {sugestoes.length === 0 ? (
            <div className="empty-state">Nenhuma sugestão no momento.</div>
          ) : (
            <div className="table-card">
              <table className="hb-table hb-table-compact">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Categoria</th>
                    <th>Grupo sugerido</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sugestoes.map((s) => (
                    <tr key={s.cwItemId}>
                      <td><strong>{s.nome ?? '—'}</strong></td>
                      <td>{s.categoria ?? '—'}</td>
                      <td>{s.grupoNome ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => usarSugestao(s)}>Usar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Os dois diálogos APAGAM uma configuração (é o que "NORMAL" significa): variante
          perigosa, e o modal fica aberto com "Aguarde…" enquanto o PUT está no ar — só
          fecha depois do desfecho, que é o que impede um segundo clique no meio. */}
      <ConfirmDialog
        open={!!confirmNormal}
        variant="danger"
        loading={salvando === String(confirmNormal?.cwItemId)}
        title="Voltar este item ao modo normal?"
        message={confirmNormal?.nome ?? ''}
        description="A configuração de vitrine é APAGADA (não existe “desligada”). No totem o item volta a aparecer como um card só, e o cliente escolhe a opção lá dentro. Para voltar à vitrine é só configurar de novo."
        confirmLabel="Voltar ao normal"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          const alvo = confirmNormal
          await salvar(alvo.cwItemId, { modo: 'NORMAL' }, `“${alvo.nome}” voltou ao modo normal.`)
          setConfirmNormal(null)
        }}
        onCancel={() => setConfirmNormal(null)}
      />

      <ConfirmDialog
        open={!!confirmOrfa}
        variant="danger"
        loading={salvando === String(confirmOrfa?.cwItemId)}
        title="Remover esta configuração órfã?"
        message={confirmOrfa ? `Item ${confirmOrfa.cwItemId} do cardápio` : ''}
        description="O item não existe mais no Cardápio Web, então a configuração não faz efeito nenhum. Remover só limpa o registro. Se o item voltar ao cardápio, ele volta no modo normal."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          const alvo = confirmOrfa
          await salvar(alvo.cwItemId, { modo: 'NORMAL' }, 'Configuração órfã removida.')
          setConfirmOrfa(null)
        }}
        onCancel={() => setConfirmOrfa(null)}
      />
    </div>
  )
}
