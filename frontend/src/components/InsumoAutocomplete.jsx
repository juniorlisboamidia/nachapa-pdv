import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

function defaultOptionLabel(insumo) {
  return `${insumo.nome} — ${brlFormatter.format(Number(insumo.custoUnitario))}/${insumo.unidade}`
}

// Campo pesquisável de insumos (sem biblioteca externa).
// value = id do insumo selecionado ('' quando vazio); onChange recebe o id como string.
export default function InsumoAutocomplete({
  insumos,
  value,
  onChange,
  placeholder = 'Digite para buscar...',
  disabled = false,
  filterFn,
  getOptionLabel
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const typingRef = useRef(false)

  // Decide se o menu abre para baixo (padrão) ou para cima, conforme o espaço
  // disponível na viewport — evita que a lista fique cortada perto do rodapé.
  const recalcDirection = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const menuMax = 248 // max-height (240) + folga
    const espacoAbaixo = window.innerHeight - rect.bottom
    const espacoAcima = rect.top
    setOpenUp(espacoAbaixo < menuMax && espacoAcima > espacoAbaixo)
  }, [])

  // Recalcula a direção ao abrir e ao rolar/redimensionar enquanto está aberto
  useEffect(() => {
    if (!open) return undefined
    recalcDirection()
    const onMove = () => recalcDirection()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, recalcDirection])

  const label = getOptionLabel ?? defaultOptionLabel
  const selected = useMemo(
    () => insumos.find((i) => String(i.id) === String(value)) ?? null,
    [insumos, value]
  )

  // Sincroniza o texto exibido quando a seleção muda por fora (reset do formulário etc.)
  useEffect(() => {
    if (typingRef.current) {
      typingRef.current = false
      return
    }
    setQuery(selected ? selected.nome : '')
  }, [selected])

  // Fecha ao clicar fora
  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const filtered = useMemo(() => {
    const base = filterFn ? insumos.filter(filterFn) : insumos
    const q = query.trim().toLowerCase()
    // Com seleção feita e texto intacto, mostra a lista completa ao reabrir
    if (!q || (selected && query === selected.nome)) return base
    return base.filter(
      (i) =>
        i.nome.toLowerCase().includes(q) ||
        (i.fornecedor && i.fornecedor.toLowerCase().includes(q)) ||
        String(i.tipo ?? '').toLowerCase().includes(q)
    )
  }, [insumos, filterFn, query, selected])

  function handleInput(text) {
    typingRef.current = true
    setQuery(text)
    setOpen(true)
    setActiveIndex(-1)
    // Digitar invalida a seleção atual (campo limpo = seleção limpa)
    if (value !== '' && value !== null && value !== undefined) onChange('')
  }

  function selectOption(insumo) {
    typingRef.current = false
    onChange(String(insumo.id))
    setQuery(insumo.nome)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open) {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault()
        selectOption(filtered[activeIndex])
      } else if (filtered.length === 1) {
        e.preventDefault()
        selectOption(filtered[0])
      }
    }
  }

  return (
    <div className="autocomplete" ref={rootRef}>
      <input
        className="form-input autocomplete-input"
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled && (
        <div className={'autocomplete-menu' + (openUp ? ' autocomplete-menu-up' : '')}>
          {filtered.length === 0 ? (
            <div className="autocomplete-empty">Nenhum insumo encontrado.</div>
          ) : (
            filtered.map((i, idx) => (
              <button
                type="button"
                key={i.id}
                className={
                  'autocomplete-option' + (idx === activeIndex ? ' autocomplete-option-active' : '')
                }
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => selectOption(i)}
              >
                {label(i)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
