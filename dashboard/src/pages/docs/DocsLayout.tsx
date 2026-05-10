import { NavLink, Outlet } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const navLinks = [
  { to: '/docs', label: 'Vision General', end: true },
  { to: '/docs/arquitectura', label: 'Arquitectura', end: false },
  { to: '/docs/resiliencia', label: 'Resiliencia', end: false },
  { to: '/docs/seguridad', label: 'Seguridad', end: false },
  { to: '/docs/despliegue', label: 'Despliegue', end: false },
] as const;

export default function DocsLayout() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-muted/10">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="px-4 py-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Documentacion
            </h2>
            <p className="text-sm text-muted-foreground">
              API Middleware Service
            </p>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-2">
            <nav className="space-y-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
