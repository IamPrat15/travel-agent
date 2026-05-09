import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Plane, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import EmployeeView from "./pages/EmployeeView";
import FinanceView from "./pages/FinanceView";

export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Plane className="h-5 w-5 text-primary" />
            <span>Travel Request Agent</span>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/" active={pathname === "/"} icon={<Plane className="h-4 w-4" />}>
              Submit request
            </NavLink>
            <NavLink to="/finance" active={pathname.startsWith("/finance")} icon={<Wallet className="h-4 w-4" />}>
              Finance queue
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<EmployeeView />} />
          <Route path="/finance" element={<FinanceView />} />
        </Routes>
      </main>
    </div>
  );
}

function NavLink({
  to, active, icon, children,
}: { to: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
