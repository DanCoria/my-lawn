import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadGuestDraft } from "./guestDraft";

export function AuthConversionCallbackPage() {
    const { sessionKind, loading } = useAuth();
    const [hasDraft, setHasDraft] = useState<boolean | null>(null);
    useEffect(() => { loadGuestDraft().then((draft) => setHasDraft(Boolean(draft))).catch(() => setHasDraft(false)); }, []);
    if (loading || hasDraft === null) return <main className="p-8 text-center">Confirming your account…</main>;
    if (!hasDraft) return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">Your preview was not saved</h1><p className="mt-3">Return to the scanner to start again.</p><Link to="/diagnose" className="btn-primary mt-5 block text-center">Take a new preview</Link></main>;
    if (sessionKind !== "permanent") return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">Verify your email</h1><p className="mt-3">Use the link in your email on this browser, then return here.</p></main>;
    return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">Your preview is ready</h1><p className="mt-3">Add the minimum lawn details needed to personalize the full diagnosis.</p><Link to="/onboarding?from=guest" className="btn-primary mt-5 block text-center">Continue to profile setup</Link></main>;
}
