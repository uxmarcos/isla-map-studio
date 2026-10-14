import { Button, Mark } from './kit'
import { REQUIRE_LOGIN, signOut, useSession } from '../supabase'
import { navigate, type Route } from '../router'

export function Nav({ route }: { route: Route }) {
  const email = useSession()?.user.email
  const link = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      className={`hidden rounded-full px-3 py-1.5 text-[13px] transition-colors duration-500 ease-heavy sm:inline-block ${active ? 'text-porcelain' : 'text-grey-1 hover:text-porcelain'}`}
    >
      {label}
    </a>
  )
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[var(--nav-h)]">
      <div className="container-page flex h-full items-center justify-between gap-3">
        <div className="glass flex h-12 items-center gap-2 rounded-2xl pl-4 pr-2">
          <a href="#/" className="flex items-center gap-2.5 pr-2">
            <Mark className="h-[22px] w-auto text-porcelain" />
            <span className="whitespace-nowrap font-display text-[20px] leading-none tracking-[-0.01em]">
              Map <em>Studio</em>
            </span>
          </a>
          <span className="hidden h-5 w-px bg-line sm:block" />
          {link('#/', 'Mapas', route.name === 'list' || route.name === 'client' || route.name === 'new')}
          {link('#/clients', 'Clientes', route.name === 'clients')}
          {link('#/labels', 'Etiquetas', route.name === 'labels')}
          {link('#/settings', 'Configurações', route.name === 'settings')}
        </div>
        {/* Hidden while creating a map: you are already making one. */}
        {(route.name !== 'new' || REQUIRE_LOGIN) && (
          <div className="flex h-12 items-center gap-2">
            <a href="#/clients" className="px-2 text-[13px] text-grey-1 hover:text-porcelain sm:hidden">
              Clientes
            </a>
            <a href="#/labels" className="px-2 text-[13px] text-grey-1 hover:text-porcelain sm:hidden">
              Etiquetas
            </a>
            <a href="#/settings" className="px-2 text-[13px] text-grey-1 hover:text-porcelain sm:hidden">
              Ajustes
            </a>
            {REQUIRE_LOGIN && (
            <button
              onClick={() => signOut()}
              title={email ? `Sair (${email})` : 'Sair'}
              className="hidden cursor-pointer px-3 text-[13px] text-grey-1 transition-colors duration-500 hover:text-porcelain md:block"
            >
              Sair
            </button>
            )}
            {/* On phones these two live in the page (under the intro on Mapas), not in the bar. */}
            {route.name !== 'new' && (
              <div className="hidden items-center gap-2 sm:flex">
                <Button size="sm" variant="ghost" className="bg-ink/70 backdrop-blur-md" onClick={() => navigate('#/import')}>
                  Criar mapas em lote
                </Button>
                <Button size="sm" arrow onClick={() => navigate('#/new')}>
                  Novo mapa
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
