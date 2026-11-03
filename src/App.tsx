import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { LawnProfileProvider } from "@/contexts/LawnProfileContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ActivityLogPage } from "@/pages/ActivityLogPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ScanPage } from "@/pages/ScanPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { GuestScanPage } from "@/features/guest/GuestScanPage";
import { ConvertAccountPage } from "@/features/guest/ConvertAccountPage";
import { AuthConversionCallbackPage } from "@/features/guest/AuthConversionCallbackPage";

const guestPreviewEnabled = import.meta.env.VITE_GUEST_PREVIEW_ENABLED === "true";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
        },
    },
});

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <LawnProfileProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/diagnose" element={guestPreviewEnabled ? <GuestScanPage /> : <Navigate to="/login" replace />} />
                            <Route path="/diagnose/convert" element={guestPreviewEnabled ? <ConvertAccountPage /> : <Navigate to="/login" replace />} />
                            <Route path="/auth/convert" element={guestPreviewEnabled ? <AuthConversionCallbackPage /> : <Navigate to="/login" replace />} />
                            <Route
                                path="/onboarding"
                                element={
                                    <ProtectedRoute skipOnboardingCheck>
                                        <OnboardingPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/"
                                element={
                                    <ProtectedRoute>
                                        <DashboardPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/log"
                                element={
                                    <ProtectedRoute>
                                        <ActivityLogPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/scan"
                                element={
                                    <ProtectedRoute>
                                        <ScanPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/schedule"
                                element={
                                    <ProtectedRoute>
                                        <SchedulePage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/profile"
                                element={
                                    <ProtectedRoute>
                                        <ProfilePage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </BrowserRouter>
                </LawnProfileProvider>
            </AuthProvider>
        </QueryClientProvider>
    );
}
