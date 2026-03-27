import type { Node, Edge } from '@xyflow/react'
import { Position } from '@xyflow/react'
import Dagre from '@dagrejs/dagre'

export const NODE_WIDTH = 180
export const NODE_HEIGHT = 40

export interface LayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  nodesep?: number
  ranksep?: number
  rankdir?: 'LR' | 'TB' | 'RL' | 'BT'
}

// ─── Find connected components via union-find ────────────────────────────────

function findComponents(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] }[] {
  const parent = new Map<string, string>()
  for (const n of nodes) parent.set(n.id, n.id)

  function find(id: string): string {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression
    let cur = id
    while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next }
    return root
  }

  function union(a: string, b: string) { parent.set(find(a), find(b)) }

  for (const e of edges) union(e.source, e.target)

  const groups = new Map<string, { nodes: Node[]; edges: Edge[] }>()
  for (const n of nodes) {
    const root = find(n.id)
    if (!groups.has(root)) groups.set(root, { nodes: [], edges: [] })
    groups.get(root)!.nodes.push(n)
  }
  for (const e of edges) {
    const root = find(e.source)
    groups.get(root)!.edges.push(e)
  }

  return Array.from(groups.values())
}

// ─── Layout a single connected component with dagre ──────────────────────────

function layoutComponent(
  nodes: Node[],
  edges: Edge[],
  nodeWidth: number,
  nodeHeight: number,
  nodesep: number,
  ranksep: number,
  rankdir: string,
): { nodes: Node[]; width: number; height: number } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir, nodesep, ranksep })

  for (const node of nodes) g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  for (const edge of edges) g.setEdge(edge.source, edge.target)

  Dagre.layout(g)

  const sourcePos = rankdir === 'LR' ? Position.Right : Position.Bottom
  const targetPos = rankdir === 'LR' ? Position.Left : Position.Top

  let maxX = 0
  let maxY = 0
  const laid = nodes.map((node) => {
    const pos = g.node(node.id)
    const x = pos.x - nodeWidth / 2
    const y = pos.y - nodeHeight / 2
    if (x + nodeWidth > maxX) maxX = x + nodeWidth
    if (y + nodeHeight > maxY) maxY = y + nodeHeight
    return {
      ...node,
      position: { x, y },
      sourcePosition: sourcePos,
      targetPosition: targetPos,
    }
  })

  return { nodes: laid, width: maxX, height: maxY }
}

// ─── Main layout: tile disconnected components in a grid ─────────────────────

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const nodeCount = nodes.length
  const isLarge = nodeCount > 40
  const {
    nodeWidth = NODE_WIDTH,
    nodeHeight = NODE_HEIGHT,
    nodesep = isLarge ? 10 : 30,
    ranksep = isLarge ? 100 : 180,
    rankdir = 'LR',
  } = options

  const components = findComponents(nodes, edges)

  // Single component — just layout directly
  if (components.length <= 1) {
    const result = layoutComponent(nodes, edges, nodeWidth, nodeHeight, nodesep, ranksep, rankdir)
    return { nodes: result.nodes, edges }
  }

  // Multiple disconnected components — layout each, then tile in a grid
  const gap = 40
  const laid: { nodes: Node[]; width: number; height: number }[] = components.map((c) =>
    layoutComponent(c.nodes, c.edges, nodeWidth, nodeHeight, nodesep, ranksep, rankdir)
  )

  // Sort by height descending for better packing
  laid.sort((a, b) => b.height - a.height)

  // Estimate a good number of columns based on aspect ratio
  const cols = Math.max(1, Math.round(Math.sqrt(laid.length * 1.5)))

  // Tile: place components in rows, tracking column widths and row heights
  const allNodes: Node[] = []
  let curX = 0
  let curY = 0
  let rowHeight = 0
  let col = 0

  for (const component of laid) {
    if (col >= cols && col > 0) {
      // New row
      curX = 0
      curY += rowHeight + gap
      rowHeight = 0
      col = 0
    }

    // Offset all nodes in this component
    for (const node of component.nodes) {
      allNodes.push({
        ...node,
        position: { x: node.position.x + curX, y: node.position.y + curY },
      })
    }

    curX += component.width + gap
    if (component.height > rowHeight) rowHeight = component.height
    col++
  }

  return { nodes: allNodes, edges }
}
