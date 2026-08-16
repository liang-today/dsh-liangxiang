/**
 * Renderer-free element expansion for PRESENTATIONAL components (no hooks):
 * function components are invoked recursively, producing a plain tree of
 * intrinsic elements + text that tests can query. Container components with
 * hooks must not be passed through this helper.
 */
import { Fragment, isValidElement, type ReactElement } from 'react'

export interface RenderedElement {
  kind: 'element'
  type: string
  props: Record<string, unknown>
  children: RenderedNode[]
}

export interface RenderedText {
  kind: 'text'
  text: string
}

export type RenderedNode = RenderedElement | RenderedText

function expand(node: unknown, out: RenderedNode[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') {
    out.push({ kind: 'text', text: String(node) })
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) expand(child, out)
    return
  }
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>
    if (typeof node.type === 'function') {
      // Presentational component: invoke and expand its output.
      expand((node.type as (p: unknown) => unknown)(props), out)
      return
    }
    if ((node.type as unknown) === Fragment) {
      expand(props.children, out)
      return
    }
    const children: RenderedNode[] = []
    expand(props.children, children)
    out.push({ kind: 'element', type: String(node.type), props, children })
  }
}

/** Expand a presentational element into a queryable intrinsic tree. */
export function renderDeep(element: ReactElement): RenderedNode[] {
  const out: RenderedNode[] = []
  expand(element, out)
  return out
}

/** Depth-first search over the rendered tree. */
export function findAll(
  nodes: RenderedNode[],
  predicate: (node: RenderedElement) => boolean,
): RenderedElement[] {
  const found: RenderedElement[] = []
  const walk = (list: RenderedNode[]): void => {
    for (const node of list) {
      if (node.kind === 'element') {
        if (predicate(node)) found.push(node)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return found
}

/** All elements carrying a given attribute (optionally with a given value). */
export function findByAttr(nodes: RenderedNode[], attr: string, value?: unknown): RenderedElement[] {
  return findAll(nodes, (node) =>
    attr in node.props && (value === undefined || node.props[attr] === value))
}

/** Concatenated text content of a subtree. */
export function textContent(nodes: RenderedNode[]): string {
  let text = ''
  for (const node of nodes) {
    if (node.kind === 'text') text += node.text
    else text += textContent(node.children)
  }
  return text
}
