import { describe, it, expect, beforeEach } from 'vitest'
import { useFavoritesStore, type FavoriteItem, type RecentItem } from '@/stores/favoritesStore'

const initialState = useFavoritesStore.getState()

function resetStore() {
  useFavoritesStore.setState(initialState, true)
}

const makeFavorite = (path: string): FavoriteItem => ({
  label: path,
  path,
  icon: 'Box',
  addedAt: Date.now(),
})

const makeRecent = (path: string, ts = Date.now()): RecentItem => ({
  label: path,
  path,
  icon: 'Box',
  timestamp: ts,
})

describe('favoritesStore', () => {
  beforeEach(resetStore)

  it('addFavorite adds a new item', () => {
    useFavoritesStore.getState().addFavorite(makeFavorite('/pods'))
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
    expect(useFavoritesStore.getState().favorites[0].path).toBe('/pods')
  })

  it('addFavorite deduplicates by path', () => {
    const fav = makeFavorite('/pods')
    useFavoritesStore.getState().addFavorite(fav)
    useFavoritesStore.getState().addFavorite(fav)
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
  })

  it('removeFavorite', () => {
    useFavoritesStore.getState().addFavorite(makeFavorite('/pods'))
    useFavoritesStore.getState().addFavorite(makeFavorite('/services'))
    useFavoritesStore.getState().removeFavorite('/pods')
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
    expect(useFavoritesStore.getState().favorites[0].path).toBe('/services')
  })

  it('reorderFavorites', () => {
    useFavoritesStore.getState().addFavorite(makeFavorite('/pods'))
    useFavoritesStore.getState().addFavorite(makeFavorite('/services'))
    useFavoritesStore.getState().addFavorite(makeFavorite('/deployments'))

    useFavoritesStore.getState().reorderFavorites(0, 2)

    const paths = useFavoritesStore.getState().favorites.map(f => f.path)
    expect(paths).toEqual(['/services', '/deployments', '/pods'])
  })

  it('isFavorite', () => {
    useFavoritesStore.getState().addFavorite(makeFavorite('/pods'))
    expect(useFavoritesStore.getState().isFavorite('/pods')).toBe(true)
    expect(useFavoritesStore.getState().isFavorite('/services')).toBe(false)
  })

  it('addRecentItem with max 10 and dedup', () => {
    // Add 12 items
    for (let i = 0; i < 12; i++) {
      useFavoritesStore.getState().addRecentItem(makeRecent(`/item-${i}`, i))
    }
    expect(useFavoritesStore.getState().recentItems).toHaveLength(10)
    // Most recent should be first
    expect(useFavoritesStore.getState().recentItems[0].path).toBe('/item-11')

    // Dedup: re-add an existing item, it should move to front
    useFavoritesStore.getState().addRecentItem(makeRecent('/item-5', 999))
    expect(useFavoritesStore.getState().recentItems).toHaveLength(10)
    expect(useFavoritesStore.getState().recentItems[0].path).toBe('/item-5')
  })

  it('clearRecent', () => {
    useFavoritesStore.getState().addRecentItem(makeRecent('/pods'))
    useFavoritesStore.getState().clearRecent()
    expect(useFavoritesStore.getState().recentItems).toEqual([])
  })

  it('setClusterColor', () => {
    useFavoritesStore.getState().setClusterColor('prod', '#FF0000')
    expect(useFavoritesStore.getState().clusterColors['prod']).toBe('#FF0000')
  })

  describe('recentNamespaces', () => {
    it('addRecentNamespace adds a namespace', () => {
      useFavoritesStore.getState().addRecentNamespace('default')
      expect(useFavoritesStore.getState().recentNamespaces).toEqual(['default'])
    })

    it('addRecentNamespace deduplicates and moves to front', () => {
      useFavoritesStore.getState().addRecentNamespace('ns-a')
      useFavoritesStore.getState().addRecentNamespace('ns-b')
      useFavoritesStore.getState().addRecentNamespace('ns-a')
      expect(useFavoritesStore.getState().recentNamespaces).toEqual(['ns-a', 'ns-b'])
    })

    it('addRecentNamespace caps at 5', () => {
      for (let i = 0; i < 7; i++) {
        useFavoritesStore.getState().addRecentNamespace(`ns-${i}`)
      }
      expect(useFavoritesStore.getState().recentNamespaces).toHaveLength(5)
      expect(useFavoritesStore.getState().recentNamespaces[0]).toBe('ns-6')
    })
  })
})
