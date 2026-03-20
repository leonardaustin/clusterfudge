import { wailsCall } from '../../call'

const H = 'TemplateHandler'

export interface Variable {
  name: string
  type: string
  required: boolean
  default?: unknown
  description: string
  options?: string[]
}

export interface Template {
  name: string
  description: string
  version: number
  variables: Variable[]
  body: string
  builtIn: boolean
  createdAt: string
}

export interface RenderResult {
  yaml: string
  resources: string[]
  errors?: string[]
}

export function ListTemplates(): Promise<Template[]> {
  return wailsCall(H, 'ListTemplates')
}

export function RenderTemplate(name: string, variables: Record<string, unknown>): Promise<RenderResult> {
  return wailsCall(H, 'RenderTemplate', name, variables)
}

export function SaveTemplate(tmpl: Template): Promise<void> {
  return wailsCall(H, 'SaveTemplate', tmpl)
}

export function DeleteTemplate(name: string): Promise<void> {
  return wailsCall(H, 'DeleteTemplate', name)
}
