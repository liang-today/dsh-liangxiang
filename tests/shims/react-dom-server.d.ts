// Test-only typing shim: the project ships no @types/react-dom, and the browser
// tests only need the one static-render helper.
declare module 'react-dom/server' {
  import type { ReactElement } from 'react'
  export function renderToStaticMarkup(element: ReactElement): string
}
