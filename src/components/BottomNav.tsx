import { NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, CalendarDays, Sparkles } from "lucide-react";

const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", id: "nav-dashboard" },
    { to: "/log", icon: ClipboardList, label: "Activity Log", id: "nav-log" },
    { to: "/scan", icon: Sparkles, label: "Scan", id: "nav-scan" },
    { to: "/schedule", icon: CalendarDays, label: "Schedule", id: "nav-schedule" },
];

export function BottomNav() {
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                                </div>
                                <span className={`text-xs font-medium ${isActive ? "font-semibold" : ""}`}>
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
