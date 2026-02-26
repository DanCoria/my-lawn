import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-lawn-green-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="text-4xl animate-bounce">🌱</div>
                    <p className="text-lawn-green-700 font-medium text-sm">Loading your lawn...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
