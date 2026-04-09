import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLawnProfile } from "@/contexts/LawnProfileContext";
import { ReactNode } from "react";

interface ProtectedRouteProps {
    children: ReactNode;
    skipOnboardingCheck?: boolean;
}

export function ProtectedRoute({ children, skipOnboardingCheck = false }: ProtectedRouteProps) {
    const { user, loading: authLoading } = useAuth();
    const { needsOnboarding, loading: profileLoading } = useLawnProfile();

    if (authLoading || profileLoading) {
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

    // Redirect to onboarding if profile not set up (unless we're already on the onboarding page)
    if (!skipOnboardingCheck && needsOnboarding) {
        return <Navigate to="/onboarding" replace />;
    }

    return <>{children}</>;
}
