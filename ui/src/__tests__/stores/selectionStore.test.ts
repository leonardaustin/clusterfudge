import { describe, it, expect, beforeEach } from 'vitest'
import { useSelectionStore, type SelectedResource } from '@/stores/selectionStore'

const initialState = useSelectionStore.getState()

function resetStore() {
  useSelectionStore.setState(initialState, true)
}

describe('selectionStore', () => {
  beforeEach(resetStore)

  it('has correct initial state', () => {
    expect(useSelectionStore.getState().selectedResource).toBeNull()
  })

  it('setSelectedResource', () => {
    const resource: SelectedResource = {
      kind: 'Pod',
      name: 'nginx-abc',
      namespace: 'default',
      path: '/pods/nginx-abc',
    }
    useSelectionStore.getState().setSelectedResource(resource)
    expect(useSelectionStore.getState().selectedResource).toEqual(resource)
  })

  it('clearSelection', () => {
    useSelectionStore.getState().setSelectedResource({
      kind: 'Pod',
      name: 'nginx-abc',
      namespace: 'default',
      path: '/pods/nginx-abc',
    })
    useSelectionStore.getState().clearSelection()
    expect(useSelectionStore.getState().selectedResource).toBeNull()
  })
})
