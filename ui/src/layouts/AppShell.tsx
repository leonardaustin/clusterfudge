import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { TitleBar } from '@/components/topbar/TitleBar'
import { Topbar } from '@/components/topbar/Topbar'
import { BottomTray } from '@/components/bottom-tray/BottomTray'
import { StatusBar } from '@/components/bottom-tray/StatusBar'
import { ConnectionBanners } from '@/components/banners/ConnectionBanners'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { AppShellShortcuts } from '@/components/shortcuts/AppShellShortcuts'
import { ToastContainer } from '@/components/notifications/ToastContainer'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useClusterHealth } from '@/hooks/useClusterHealth'
import { useLayoutPersist } from '@/hooks/useLayoutPersist'

export function AppShell() {
  useClusterHealth()
  useLayoutPersist()

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-accent focus:text-white">
        Skip to main content
      </a>
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Topbar />
          <ConnectionBanners />
          <main id="main-content" className="flex-1 overflow-hidden flex flex-col">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
          <BottomTray />
          <StatusBar />
        </div>
      </div>
      <CommandPalette />
      <AppShellShortcuts />
      <ToastContainer />
    </div>
  )
}

export default AppShell
