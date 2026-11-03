import { Outlet, Link } from "react-router-dom";
import { UserCircle } from "lucide-react";

import { BottomNav, SuppressBottomNavContext } from "./BottomNav";

export function AppShell() {
    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
                <div className="mx-auto flex min-h-14 max-w-2xl items-center justify-between px-5">
                    <Link to="/" className="flex items-center gap-2 font-bold text-gray-900" aria-label="My Lawn home">
                        <span aria-hidden="true">🌱</span>
                        <span>My Lawn</span>
                    </Link>
                    <Link
                        to="/profile"
                        aria-label="Open profile"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawn-green-500"
                    >
                        <UserCircle size={26} aria-hidden="true" />
                    </Link>
                </div>
            </header>
            <SuppressBottomNavContext.Provider value>
                <Outlet />
            </SuppressBottomNavContext.Provider>
            <BottomNav />
        </div>
    );
}
