import { useEffect, useState } from 'react'

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
  return [dark, setDark]
}
