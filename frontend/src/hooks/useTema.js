import { useCallback, useEffect, useState } from 'react'

// Tema claro/escuro compartilhado: classe `theme-dark` no body + localStorage `hb-theme`
// (mesma convenção que a sidebar usava). Aplica na montagem e a cada troca.
export function useTema() {
  const [dark, setDark] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('hb-theme') === 'dark'
  )
  useEffect(() => {
    document.body.classList.toggle('theme-dark', dark)
    localStorage.setItem('hb-theme', dark ? 'dark' : 'light')
  }, [dark])

  // Alterna com a "revelação circular" (View Transitions API, à la skiper26): um
  // círculo do novo tema cresce a partir do ponto do clique. `event` é o clique no
  // botão (origem do círculo). Sem suporte à API ou com reduced-motion, troca direto.
  const alternar = useCallback((event) => {
    const novo = !dark
    const aplicar = () => {
      // Muda o DOM de forma síncrona (para o snapshot do View Transition) e o estado.
      document.body.classList.toggle('theme-dark', novo)
      setDark(novo)
    }
    const semTransicao =
      typeof document === 'undefined' ||
      typeof document.startViewTransition !== 'function' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (semTransicao) { aplicar(); return }

    // Origem do círculo = ponto do clique; raio final = canto mais distante da tela.
    const x = event?.clientX ?? window.innerWidth - 48
    const y = event?.clientY ?? 40
    const raioFinal = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    const transicao = document.startViewTransition(aplicar)
    transicao.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raioFinal}px at ${x}px ${y}px)`] },
        { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      )
    })
  }, [dark])

  return [dark, setDark, alternar]
}
