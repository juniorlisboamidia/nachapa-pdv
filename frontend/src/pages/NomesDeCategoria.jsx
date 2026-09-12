import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'

// Loja Digital › Totem › Apresentação — bloco "Nomes das categorias".
//
// O nome que vem do Cardápio Web é cadastrado para o cardápio digital, onde o
// emoji ajuda a varrer a lista com o polegar. No totem, numa coluna estreita e
// vertical, o mesmo emoji come caractere de um nome que já é curto — e nome
// longo não cabe de jeito nenhum. Aqui a loja diz como a categoria se chama NO
// TOTEM, e só isso: ordem, itens e disponibilidade continuam vindo do CW.
//
// Duas regras que este bloco respeita, iguais às da vitrine:
//  1. NADA é automático. A sugestão sem emoji preenche o campo e para por aí;
//     enquanto ninguém salvar, o totem mostra o nome do Cardápio Web.
//  2. Campo vazio é o padrão, não um estado guardado. Limpar apaga a linha — e é
//     também o que remove uma configuração de categoria que saiu do cardápio.
export default function NomesDeCategoria({ aoAvisar }) {
  const [linhas, setLinhas] = useState([])
  const [rascunho, setRascunho] = useState({})   // { [cwCategoriaId]: texto }
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // `buscar` não marca estado de forma síncrona — quem chama decide se acende o
  // "carregando". É o que deixa o efeito de montagem só AGENDAR trabalho, em vez
  // de disparar render em cascata.
  function buscar() {
    return api.get('/totem/categorias')
      .then((r) => {
        const cats = Array.isArray(r.data?.categorias) ? r.data.categorias : []
        setLinhas(cats)
        setRascunho(Object.fromEntries(cats.map((c) => [c.cwCategoriaId, c.nomeExibido ?? ''])))
        setErro(null)
      })
      .catch(() => setErro('Não foi possível ler as categorias agora.'))
      .finally(() => { setCarregando(false); setSalvando(false) })
  }

  function carregar() {
    setCarregando(true)
    buscar()
  }

  useEffect(() => { buscar() }, [])

  // O que mudou em relação ao que está salvo. É por esta lista que o Salvar
  // decide o que mandar — nada de reenviar dez linhas para mexer em uma.
  const alteradas = useMemo(() => linhas.filter((c) => {
    const atual = String(rascunho[c.cwCategoriaId] ?? '').trim()
    return atual !== String(c.nomeExibido ?? '')
  }), [linhas, rascunho])

  const comSugestao = linhas.filter((c) => c.temSugestao)

  function aplicarSugestoes() {
    setRascunho((r) => {
      const novo = { ...r }
      for (const c of comSugestao) novo[c.cwCategoriaId] = c.sugestao
      return novo
    })
  }

  async function salvar() {
    if (!alteradas.length || salvando) return
    setSalvando(true)
    try {
      // Uma chamada por categoria alterada, em série: são poucas, e assim uma
      // falha no meio não deixa dúvida sobre o que entrou e o que não entrou.
      for (const c of alteradas) {
        await api.put(`/totem/categorias/${c.cwCategoriaId}`, {
          nomeExibido: String(rascunho[c.cwCategoriaId] ?? '').trim(),
        })
      }
      aoAvisar?.({ message: `${alteradas.length === 1 ? 'Nome salvo' : `${alteradas.length} nomes salvos`}. O totem aplica no próximo carregamento do menu.`, type: 'success' })
      buscar()
    } catch {
      aoAvisar?.({ message: 'Não foi possível salvar os nomes.', type: 'error' })
      setSalvando(false)
    }
  }

  if (carregando) return <div className="loading-state">Carregando categorias…</div>
  if (erro) {
    return (
      <div className="empty-state">
        <div style={{ marginBottom: 12 }}>{erro}</div>
        <button type="button" className="btn btn-secondary" onClick={carregar}>Tentar de novo</button>
      </div>
    )
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>Nomes das categorias no totem</h2>
          <div className="page-header-sub">
            O nome do Cardápio Web serve ao cardápio digital, onde o emoji ajuda a achar a seção. No totem, a
            coluna da esquerda é estreita: aqui você diz como cada categoria se chama <strong>na tela do
            cliente</strong>. Ordem, itens e disponibilidade continuam vindo do Cardápio Web. Categoria sem nome
            preenchido aparece como está lá.
          </div>
        </div>
      </div>

      <div className="ttm-filtros">
        <span className="ttm-meta-txt">
          {linhas.length} {linhas.length === 1 ? 'categoria' : 'categorias'}
          {comSugestao.length > 0 ? ` · ${comSugestao.length} com emoji no nome` : ''}
        </span>
        {comSugestao.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarSugestoes}>
            Preencher sem emoji
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!alteradas.length || salvando}
          onClick={salvar}
        >
          {salvando ? 'Salvando…' : alteradas.length ? `Salvar ${alteradas.length}` : 'Salvar'}
        </button>
      </div>

      <table className="hb-table">
        <thead>
          <tr>
            <th>No Cardápio Web</th>
            <th>No totem</th>
            <th className="ttm-nowrap" style={{ textAlign: 'right' }}>Itens</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const valor = rascunho[c.cwCategoriaId] ?? ''
            const mudou = valor.trim() !== String(c.nomeExibido ?? '')
            return (
              <tr key={c.cwCategoriaId}>
                <td>
                  <strong>{c.nomeCw || '—'}</strong>
                  <div className="ttm-meta-txt">#{c.cwCategoriaId}</div>
                </td>
                <td>
                  <div className="ttm-apr-form">
                    <input
                      className="form-input"
                      value={valor}
                      maxLength={60}
                      placeholder={c.nomeCw}
                      onChange={(e) => setRascunho((r) => ({ ...r, [c.cwCategoriaId]: e.target.value }))}
                    />
                    <div className="ttm-meta-txt">
                      {mudou ? 'alterado, falta salvar' : (c.nomeExibido ? 'nome próprio no totem' : 'usando o nome do Cardápio Web')}
                      {c.temSugestao && valor.trim() !== c.sugestao && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="chkp-link"
                            onClick={() => setRascunho((r) => ({ ...r, [c.cwCategoriaId]: c.sugestao }))}
                          >
                            usar “{c.sugestao}”
                          </button>
                        </>
                      )}
                      {valor && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="chkp-link"
                            onClick={() => setRascunho((r) => ({ ...r, [c.cwCategoriaId]: '' }))}
                          >
                            limpar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </td>
                <td className="ttm-nowrap" style={{ textAlign: 'right' }}>{c.itens}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
