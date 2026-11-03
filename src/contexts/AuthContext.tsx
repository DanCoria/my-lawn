import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextType {
    user: User | null;
    session: Session | null;
    sessionKind: "none" | "anonymous" | "permanent";
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string) => Promise<{ error: string | null }>;
    ensureAnonymousSession: (captchaToken: string) => Promise<User>;
    linkAnonymousEmail: (email: string) => Promise<void>;
    signIntoExistingAccount: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const sessionKind: AuthContextType["sessionKind"] = !user
        ? "none"
        : user.is_anonymous === true
          ? "anonymous"
          : "permanent";

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signUp = async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
    };

    const ensureAnonymousSession = async (captchaToken: string) => {
        if (user) return user;
        if (!captchaToken.trim()) {
            throw new Error("Complete the security check before continuing.");
        }

        const { data, error } = await supabase.auth.signInAnonymously({
            options: { captchaToken },
        });
        if (error) throw error;
        if (!data.user) {
            throw new Error("Unable to start a secure guest session.");
        }
        return data.user;
    };

    const linkAnonymousEmail = async (email: string) => {
        if (sessionKind !== "anonymous") {
            throw new Error("Email linking requires an active guest session.");
        }
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
    };

    const signIntoExistingAccount = async (
        email: string,
        password: string,
    ) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                sessionKind,
                loading,
                signIn,
                signUp,
                ensureAnonymousSession,
                linkAnonymousEmail,
                signIntoExistingAccount,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
