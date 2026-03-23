import { Navigate, useParams } from 'react-router-dom'

// CRDDetail redirects to the CRD list page which shows detail in a side panel.
// The :name param is preserved so the panel auto-opens.
export function CRDDetail() {
  const { group, resource, name } = useParams<{
    group: string
    resource: string
    name: string
  }>()

  return <Navigate to={`/custom/${group}/${resource}/${name}`} replace />
}
