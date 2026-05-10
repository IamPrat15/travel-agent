import { Link, Route, Routes, useLocation } from "react-router-dom";
import EmployeeView from "./pages/EmployeeView";
import FinanceView from "./pages/FinanceView";
import { Brandmark, GlassSurface } from "./components/first";
import { cn } from "@/lib/utils";

/**
 * App shell — FIRST AI conventions.
 *
 * Topbar follows the system: glass-thin background, F brandmark left,
 * product name in sans secondary, simple link nav. No gradients on shell,
 * no decorative chrome. Recognition gradient is reserved for milestones,
 * which a workflow tool like this never has.
 */
export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: "var(--z-sticky)" as any,
          padding: "var(--space-12) var(--space-20)",
        }}
      >
        <GlassSurface
          weight="thin"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-16)",
            padding: "var(--space-8) var(--space-16)",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
            <Brandmark size={28} />
            <span
              className="hidden sm:inline"
              style={{
                fontFamily: "var(--font-family-sans)",
                fontSize: "var(--font-size-body-2)",
                color: "var(--color-text-secondary)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              Travel Request Agent
            </span>
          </div>

          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" active={pathname === "/"}>
              Submit
            </NavLink>
            <NavLink to="/finance" active={pathname.startsWith("/finance")}>
              Finance Queue
            </NavLink>
          </nav>
        </GlassSurface>
      </header>

      <main
        className="flex-1 mx-auto w-full"
        style={{
          maxWidth: 1280,
          paddingInline: "var(--space-24)",
          paddingBlock: "var(--space-32)",
        }}
      >
        <Routes>
          <Route path="/" element={<EmployeeView />} />
          <Route path="/finance" element={<FinanceView />} />
        </Routes>
      </main>
    </div>
  );
}

function NavLink({
  to, active, children,
}: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn("topnav-link")}
      data-active={active ? "true" : undefined}
      style={{
        padding: "var(--space-8) var(--space-12)",
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-family-sans)",
        fontSize: "var(--font-size-body-2)",
        fontWeight: "var(--font-weight-semibold)",
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: active ? "var(--color-surface-elevated)" : "transparent",
        textDecoration: "none",
        transition: "background var(--duration-fast) var(--curve-easy-ease)",
      }}
    >
      {children}
    </Link>
  );
}
