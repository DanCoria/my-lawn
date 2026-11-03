import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { LawnProfileProvider } from "@/contexts/LawnProfileContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { TodayPage } from "@/pages/TodayPage";
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
                                element={
                                    <ProtectedRoute>
                                        <AppShell />
                                    </ProtectedRoute>
                                }
                            >
                                <Route index element={<TodayPage />} />
                                <Route path="plan" element={<SchedulePage />} />
                                <Route path="scan" element={<ScanPage />} />
                                <Route path="progress" element={<ActivityLogPage />} />
                                <Route path="profile" element={<ProfilePage />} />
                            </Route>
                            <Route path="/log" element={<Navigate to="/progress" replace />} />
                            <Route path="/schedule" element={<Navigate to="/plan" replace />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </BrowserRouter>
                </LawnProfileProvider>
            </AuthProvider>
        </QueryClientProvider>
    );
}
