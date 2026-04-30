import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Calendar, Home, Users, Package, Wallet, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Hoy", icon: Home, end: true },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/material", label: "Material", icon: Package },
  { to: "/finanzas", label: "Finanzas", icon: Wallet },
];

export default function AppLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-primary">
              <span className="text-sm font-bold text-primary-foreground">AP</span>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Agenda Podológica</p>
              <p className="text-[11px] text-muted-foreground">Gestión personal</p>
            </div>
          </div>
          <NavLink
            to="/configuracion"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground",
              location.pathname === "/configuracion" && "bg-muted text-foreground"
            )}
            aria-label="Configuración"
          >
            <Settings className="h-4 w-4" />
          </NavLink>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-24">
        <div className="mx-auto max-w-5xl px-4 py-4 animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav — mobile first */}
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md">
        <ul className="mx-auto grid max-w-5xl grid-cols-5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-smooth",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-12 items-center justify-center rounded-full transition-smooth",
                        isActive && "bg-primary-soft"
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px]")} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
