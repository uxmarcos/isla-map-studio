import { useEffect } from 'react'
import { useRoute } from './router'
import { Nav } from './ui/Nav'
import { ClientList } from './pages/ClientList'
import { ClientEditor } from './pages/ClientEditor'
import { Settings } from './pages/Settings'
import { Import } from './pages/Import'
import { Clients } from './pages/Clients'
import { Labels } from './pages/Labels'
import { Denied, Login, missingSetup, Setup, SyncError } from './pages/Login'
import { Toaster } from './ui/toast'
import { REQUIRE_LOGIN, useAuthReady, useSession } from './supabase'
import { connect, disconnect, useSync } from './store'

export default function App() {
  const route = useRoute()
  const session = useSession()
  const authReady = useAuthReady()
  const sync = useSync()
  const email = session?.user.email ?? null

  useEffect(() => {
    if (!REQUIRE_LOGIN || email) connect()
    else disconnect()
  }, [email])

  const missing = missingSetup()
  let page
  if (missing.length) page = <Setup missing={missing} />
  else if (REQUIRE_LOGIN && !authReady) page = null
  else if (REQUIRE_LOGIN && !session) page = <Login />
  else if (sync.state === 'denied') page = <Denied email={email ?? ''} />
  else if (sync.state === 'error') page = <SyncError message={sync.message} retry={connect} />
  else if (sync.state === 'loading') page = <main className="min-h-screen" />
  else
    page = (
      <>
        <Nav route={route} />
        {route.name === 'client' ? (
          <ClientEditor id={route.id} />
        ) : route.name === 'new' ? (
          <ClientEditor id={null} from={route.from} />
        ) : route.name === 'settings' ? (
          <Settings />
        ) : route.name === 'import' ? (
          <Import />
        ) : route.name === 'clients' ? (
          <Clients />
        ) : route.name === 'labels' ? (
          <Labels />
        ) : (
          <ClientList />
        )}
        <footer className="hairline-t">
          <div className="container-page flex items-center justify-between py-8 text-[13px] text-grey-2">
            <span>Isla · Map Studio</span>
            <span>Uso interno</span>
          </div>
        </footer>
      </>
    )

  return (
    <>
      {page}
      <Toaster />
      <div className="grain" aria-hidden />
    </>
  )
}
