import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadGuestDraft, type GuestDraft } from "./guestDraft";

export function ConvertAccountPage({ manualLinkingEnabled = import.meta.env.VITE_MANUAL_IDENTITY_LINKING_ENABLED === "true" }: { manualLinkingEnabled?: boolean }) {
    const { linkAnonymousEmail, signIntoExistingAccount } = useAuth();
    const [params] = useSearchParams();
    const [draft, setDraft] = useState<GuestDraft | null | undefined>(undefined);
    const [mode, setMode] = useState<"link" | "signin">(params.get("mode") === "signin" ? "signin" : "link");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { loadGuestDraft().then(setDraft).catch(() => setDraft(null)); }, []);

    if (draft === undefined) return <main className="p-8 text-center">Loading your preview…</main>;
    if (!draft) return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">Your preview was not saved</h1><p className="mt-3 text-gray-600">It may have expired after 24 hours or been cleared from this browser. Take a new photo to continue.</p><Link className="btn-primary mt-6 block text-center" to="/diagnose">Take a new preview</Link></main>;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setError(null); setMessage(null);
        try {
            if (mode === "link") {
                if (!manualLinkingEnabled) throw new Error("New profile linking is not available yet. Sign in if you already have an account.");
                await linkAnonymousEmail(email);
                setMessage("Check your email for the verification link. Your preview will remain in this browser.");
            } else {
                await signIntoExistingAccount(email, password);
                setMessage("Signed in. Continue to profile setup to personalize your diagnosis.");
            }
        } catch (caught) {
            const text = caught instanceof Error ? caught.message : "Account conversion could not be completed.";
            if (mode === "link" && /already|registered|exists/i.test(text)) {
                setMode("signin");
                setError("That email already has an account. Sign in to continue; your preview will stay in this browser.");
            } else setError(text);
        }
    };

    return <main className="min-h-screen bg-gray-50 px-5 py-12"><div className="card mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">Save this diagnosis</h1><p className="mt-2 text-sm text-gray-600">Create a profile for the full personalized diagnosis, one primary plan, and follow-up checks.</p><form className="mt-6 space-y-4" onSubmit={submit}><div><label htmlFor="convert-email" className="text-sm font-medium">Email</label><input id="convert-email" className="input-field mt-1" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>{mode === "signin" && <div><label htmlFor="convert-password" className="text-sm font-medium">Password</label><input id="convert-password" className="input-field mt-1" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>}<button className="btn-primary w-full" type="submit">{mode === "link" ? "Email me a verification link" : "Sign in and continue"}</button></form>{!manualLinkingEnabled && mode === "link" && <p className="mt-3 text-sm text-amber-700">New profile linking remains closed until production identity-linking checks pass.</p>}{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{message && <div className="mt-4 text-sm text-lawn-green-800"><p>{message}</p>{mode === "signin" && <Link className="mt-3 inline-block font-semibold underline" to="/auth/convert">Continue to profile setup</Link>}</div>}<button type="button" className="mt-5 w-full text-sm font-semibold text-lawn-green-700" onClick={() => { setMode(mode === "link" ? "signin" : "link"); setError(null); setMessage(null); }}>{mode === "link" ? "Already have an account? Sign in" : "Use a new email instead"}</button></div></main>;
}
