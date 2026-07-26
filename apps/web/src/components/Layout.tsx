import { NavLink, useNavigate } from "react-router-dom";
import {
  Users,
  Pill,
  FileText,
  Activity,
  Smartphone,
  LogOut,
  LayoutDashboard,
  Megaphone,
} from "lucide-react";
import SessionStatusIndicator from "./SessionStatusIndicator";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/whatsapp", label: "WhatsApp", icon: Smartphone },
  { to: "/patients", label: "Pasien", icon: Users },
  { to: "/medications", label: "Obat", icon: Pill },
  { to: "/templates", label: "Template Pesan", icon: FileText },
  { to: "/consumption", label: "Konsumsi", icon: Activity },
  { to: "/blasts", label: "Broadcast", icon: Megaphone },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/40 p-4 flex flex-col">
        <h1 className="text-lg font-bold mb-2">KawalGula</h1>
        <SessionStatusIndicator />
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
