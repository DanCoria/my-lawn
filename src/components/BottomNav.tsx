import { createContext, useContext } from "react";
import { NavLink } from "react-router-dom";
import { House, ListChecks, ScanLine, TrendingUp } from "lucide-react";

const navItems = [
    { to: "/", icon: House, label: "Today", id: "nav-today" },
    { to: "/plan", icon: ListChecks, label: "Plan", id: "nav-plan" },
    { to: "/scan", icon: ScanLine, label: "Scan", id: "nav-scan" },
    { to: "/progress", icon: TrendingUp, label: "Progress", id: "nav-progress" },
];

export const SuppressBottomNavContext = createContext(false);

export function BottomNav() {
    const suppressed = useContext(SuppressBottomNavContext);
    if (suppressed) return null;

    return (
        <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-lg">
            <div className="flex items-stretch">
                {navItems.map(({ to, icon: Icon, label, id }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === "/"}
                        id={id}
                        className={({ isActive }) =>
                            `flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors duration-150 ${isActive
                                ? "text-lawn-green-700"
                                : "text-gray-400 hover:text-gray-600"
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <div className={`p-1 rounded-xl transition-all duration-150 ${isActive ? "bg-lawn-green-50" : ""
                                    }`}>
                                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                                </div>
                                <span className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}>
                                    {label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
