import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function LoginPage() {
    const { signIn, signUp } = useAuth();
    const navigate = useNavigate();

    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        setLoading(true);

        if (mode === "signin") {
            const { error } = await signIn(email, password);
            if (error) {
                setError(error);
                setLoading(false);
            } else {
                navigate("/");
            }
        } else {
            const { error } = await signUp(email, password);
            if (error) {
                setError(error);
                setLoading(false);
            } else {
                setSuccessMsg("Account created! Check your email to confirm, then sign in.");
                setMode("signin");
                setLoading(false);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-lawn-green-800 to-lawn-green-950 flex flex-col items-center justify-center px-5">
            {/* Logo */}
            <div className="mb-8 flex flex-col items-center gap-2 animate-fade-in">
                <div className="text-7xl drop-shadow-xl">🌱</div>
                <h1 className="text-3xl font-bold text-white tracking-tight">My Lawn</h1>
                <p className="text-lawn-green-300 text-sm text-center max-w-xs">
                    Your personal Bermuda grass management dashboard
                </p>
            </div>

            {/* Card */}
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 animate-slide-up">
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {mode === "signin" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                    {mode === "signin"
                        ? "Sign in to manage your lawn"
                        : "Start tracking your lawn today"}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Email
                        </label>
                        <input
                            id="email-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="input-field"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Password
                        </label>
                        <input
                            id="password-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                            required
                            minLength={6}
                            className="input-field"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    {successMsg && (
                        <div className="bg-lawn-green-50 border border-lawn-green-200 rounded-xl px-4 py-3">
                            <p className="text-lawn-green-700 text-sm">{successMsg}</p>
                        </div>
                    )}

                    <button
                        id="auth-submit-btn"
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        id="auth-toggle-btn"
                        type="button"
                        onClick={() => {
                            setMode(mode === "signin" ? "signup" : "signin");
                            setError(null);
                            setSuccessMsg(null);
                        }}
                        className="text-lawn-green-700 text-sm font-medium hover:underline"
                    >
                        {mode === "signin"
                            ? "Don't have an account? Sign up"
                            : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
