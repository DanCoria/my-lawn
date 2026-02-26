import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ActivityLogPage } from "@/pages/ActivityLogPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ScanPage } from "@/pages/ScanPage";

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
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
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
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </QueryClientProvider>
    );
}
