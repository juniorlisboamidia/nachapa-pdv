// Execução de checklist (responder item a item + concluir) — extraído de
// BonificacaoEu.jsx (Área do Colaborador) para ser reusado pela execução PÚBLICA por
// PIN (ChecklistPublico, link/QR do balcão). Recebe `cliente` (instância axios já com
// o Bearer certo) em vez de importar um client fixo: a Área do Colaborador usa
// `colabApi` (sessão de ~30 dias no localStorage do aparelho do colaborador) e o link
// público usa um client à parte, criado em memória com o token de 6h do /entrar — os
// dois nunca podem se misturar num mesmo aparelho (ver services/api.js).
import { useState, useEffect } from 'react'
import { comprimirFoto } from '../../lib/comprimirFoto'

// Execução em andamento: responde item a item (auto-salva por item) e conclui no fim.
// `labelConcluir` é o texto do botão na tela de sucesso — "Voltar" na Área do
// Colaborador (volta pra lista de checklists), "Executar outro" no link público
// (volta pra seleção de nome).
export function ExecutarChecklist({ exec, setAviso, onSair, cliente, labelConcluir = 'Voltar' }) {
  const [respostas, setRespostas] = useState(exec.respostas || {})
  // Metadata das fotos já anexadas — { [chave]: { id, dataUrl? } }. dataUrl só existe
  // localmente logo após tirar a foto (prévia imediata, sem novo fetch); do backend
  // vem só { id } e a miniatura é buscada sob demanda ao abrir o item.
  const [fotos, setFotos] = useState(exec.fotos || {})
  const [concluida, setConcluida] = useState(exec.status === 'CONCLUIDA')
  const [concluindo, setConcluindo] = useState(false)

  async function salvar(chave, valor, observacao) {
    setRespostas((s) => ({ ...s, [chave]: { ...s[chave], valor, observacao } }))
    try {
      // O servidor recalcula "conforme" — o cliente não decide se passou.
      const r = await cliente.put(`/public/colaborador/execucoes/${exec.id}/resposta`, { itemChave: chave, valor, observacao })
      setRespostas((s) => ({ ...s, [chave]: { ...s[chave], conforme: r.data.conforme } }))
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível salvar a resposta.') }
  }

  function fotoSalva(chave, meta) {
    setFotos((s) => ({ ...s, [chave]: meta }))
  }

  // Item FOTO crítico sem foto ainda anexada — bloqueia o Concluir (o 400 do servidor
  // é a rede de segurança, mas aqui evitamos a viagem ao servidor pra um erro esperado).
  const faltaFotoCritica = exec.itens.some((it) => it.tipo === 'FOTO' && it.critico && !fotos[it.chave])

  async function concluir() {
    if (faltaFotoCritica) { setAviso('Falta anexar uma foto obrigatória.'); return }
    setConcluindo(true)
    try {
      await cliente.post(`/public/colaborador/execucoes/${exec.id}/concluir`)
      setConcluida(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível concluir o checklist.') }
    finally { setConcluindo(false) }
  }

  if (concluida) {
    return (
      <div className="be-state" style={{ minHeight: '50vh' }}>
        <div>
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>Checklist concluído!</p>
          <button type="button" className="be-btn" style={{ marginTop: 14, maxWidth: 220 }} onClick={onSair}>{labelConcluir}</button>
        </div>
      </div>
    )
  }

  return (
    <section>
      <button type="button" className="be-login-voltar" style={{ marginTop: 0, marginBottom: 12 }} onClick={onSair}>‹ Voltar</button>
      {exec.tempoEstimadoMin > 0 && <div className="be-cl-tempo">⏱️ ~{exec.tempoEstimadoMin} min</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {exec.itens.map((it) => (
          <ItemChecklist key={it.chave} item={it} resposta={respostas[it.chave] || {}} onSalvar={salvar} foto={fotos[it.chave] || null} onFoto={fotoSalva} execId={exec.id} setAviso={setAviso} cliente={cliente} />
        ))}
      </div>
      {faltaFotoCritica && <p className="be-cl-warn" style={{ marginTop: 10 }}>⚠ Falta anexar uma foto obrigatória antes de concluir.</p>}
      <button type="button" className="be-btn" style={{ marginTop: 14 }} onClick={concluir} disabled={concluindo || faltaFotoCritica}>
        {concluindo ? 'Concluindo…' : 'Concluir checklist'}
      </button>
    </section>
  )
}

// Um item do snapshot ({ chave, tipo, titulo, descricao, critico, config }), renderizado
// conforme o tipo.
function ItemChecklist({ item, resposta: r, onSalvar, foto, onFoto, execId, setAviso, cliente }) {
  const [texto, setTexto] = useState(r.valor ?? '')
  const [numero, setNumero] = useState(r.valor ?? '')
  return (
    <div className="be-cl-item">
      <div className="be-cl-item-tt">{item.titulo}{item.critico && <span className="be-cl-crit"> *</span>}</div>
      {item.descricao && <div className="be-cl-item-ds">{item.descricao}</div>}
      {item.config?.dica && <div className="be-cl-dica">💡 {item.config.dica}</div>}

      {item.tipo === 'CHECK' && (
        <button type="button" className={'be-cl-check' + (r.valor === true ? ' on' : '')} onClick={() => onSalvar(item.chave, !(r.valor === true), r.observacao)}>
          {r.valor === true ? '✔ Feito' : 'Marcar como feito'}
        </button>
      )}

      {item.tipo === 'AVALIACAO' && (
        <div className="be-cl-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={'be-cl-star' + (n <= (r.valor || 0) ? ' on' : '')} onClick={() => onSalvar(item.chave, n, r.observacao)}>
              {n <= (r.valor || 0) ? '★' : '☆'}
            </button>
          ))}
        </div>
      )}

      {item.tipo === 'TEXTO' && (
        <textarea className="be-input" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => onSalvar(item.chave, texto, r.observacao)} />
      )}

      {item.tipo === 'NUMERICO' && (
        <div className="be-cl-num">
          <input className="be-input" type="number" value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={() => onSalvar(item.chave, numero === '' ? null : Number(numero), r.observacao)} />
          {item.config?.unidade && <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{item.config.unidade}</span>}
        </div>
      )}

      {item.tipo === 'SELECAO' && (
        <div className="be-cl-opts">
          {(item.config?.opcoes || []).map((o) => (
            <button key={o.rotulo} type="button" className={'be-cl-opt' + (r.valor === o.rotulo ? ' on' : '')} onClick={() => onSalvar(item.chave, o.rotulo, r.observacao)}>
              {o.rotulo}
            </button>
          ))}
        </div>
      )}

      {item.tipo === 'FOTO' && (
        <ItemFoto item={item} foto={foto} onFoto={onFoto} execId={execId} setAviso={setAviso} cliente={cliente} />
      )}

      {r.conforme === false && <div className="be-cl-warn">⚠ Fora do padrão{item.critico ? ' · item crítico' : ''}</div>}
      {r.conforme === false && item.config?.instrucaoAlerta && (
        <div className="be-cl-alerta"><b>O que fazer:</b> {item.config.instrucaoAlerta}</div>
      )}
    </div>
  )
}

// Captura/anexa a foto de um item FOTO. Sem foto: input de câmera + botão "Tirar
// foto". Com foto: miniatura (dataUrl local se acabou de tirar, senão busca sob
// demanda ao montar) + "✓ foto anexada" + botão "Refazer".
function ItemFoto({ item, foto, onFoto, execId, setAviso, cliente }) {
  const [enviando, setEnviando] = useState(false)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [previaUrl, setPreviaUrl] = useState(foto?.dataUrl || null)
  const inputId = `be-foto-${item.chave}`

  // Já veio com foto do backend (metadata { id } sem bytes) e ainda não temos prévia
  // local — busca os bytes sob demanda uma vez.
  useEffect(() => {
    if (foto?.id && !foto?.dataUrl && !previaUrl) {
      setCarregandoPrevia(true)
      cliente.get(`/public/colaborador/fotos/${foto.id}`)
        .then((r) => setPreviaUrl(r.data?.dataUrl || null))
        .catch(() => {}) // miniatura é só conveniência — "✓ foto anexada" já basta
        .finally(() => setCarregandoPrevia(false))
    }
  }, [foto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolher(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo (ex.: refazer)
    if (!file) return
    setEnviando(true)
    try {
      const { dataUrl, largura, altura } = await comprimirFoto(file)
      const r = await cliente.put(`/public/colaborador/execucoes/${execId}/foto`, { itemChave: item.chave, dataUrl, largura, altura })
      setPreviaUrl(dataUrl) // prévia imediata com o dataUrl comprimido, sem novo fetch
      onFoto(item.chave, { id: r.data.fotoId, dataUrl })
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível salvar a foto.') }
    finally { setEnviando(false) }
  }

  return (
    <div>
      <input id={inputId} type="file" accept="image/*" capture="environment" hidden onChange={aoEscolher} disabled={enviando} />
      {foto ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {previaUrl ? (
            <img src={previaUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 18 }}>
              {carregandoPrevia ? '…' : '📷'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--money)' }}>✓ foto anexada</div>
            <label htmlFor={inputId} className="be-cl-check" style={{ marginTop: 6, padding: '6px 12px', fontSize: 12 }}>
              {enviando ? 'Enviando…' : 'Refazer'}
            </label>
          </div>
        </div>
      ) : (
        <>
          <label htmlFor={inputId} className="be-cl-check">
            📷 {enviando ? 'Enviando…' : 'Tirar foto'}
          </label>
          {item.critico && <div className="be-cl-warn">⚠ Foto obrigatória</div>}
        </>
      )}
    </div>
  )
}
