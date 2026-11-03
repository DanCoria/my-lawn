import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import type { DiagnosisSymptom } from "@/lib/gemini";
import { resizeImageForAI } from "@/lib/gemini";
import { useAuth } from "@/contexts/AuthContext";
import { DiagnosisResult } from "@/features/diagnosis/DiagnosisResult";
import { runGuestPreview } from "@/features/diagnosis/api";
import { saveGuestDraft } from "./guestDraft";
import type { GuestDiagnosisPreview } from "@shared/diagnosis-contract";

type TurnstileRenderer = (onVerify: (token: string) => void) => React.ReactNode;

interface TurnstileApi {
    render(container: HTMLElement, options: { sitekey: string; callback(token: string): void; "expired-callback"(): void }): string;
    remove(widgetId: string): void;
}

declare global {
    interface Window { turnstile?: TurnstileApi }
}

function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    useEffect(() => {
        if (!siteKey || !containerRef.current) return;
        let widgetId: string | undefined;
        const render = () => {
            if (!window.turnstile || !containerRef.current || widgetId) return;
            widgetId = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: onVerify,
                "expired-callback": () => onVerify(""),
            });
        };
        const existing = document.querySelector<HTMLScriptElement>('script[data-my-lawn-turnstile]');
        if (existing) {
            existing.addEventListener("load", render);
            render();
        } else {
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            script.dataset.myLawnTurnstile = "true";
            script.addEventListener("load", render);
            document.head.appendChild(script);
        }
        return () => {
            existing?.removeEventListener("load", render);
            if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
        };
    }, [onVerify, siteKey]);

    if (!siteKey) return <p className="text-sm text-amber-700">Guest scanning is awaiting its security-check configuration.</p>;
    return <div ref={containerRef} aria-label="Security check" />;
}

const symptoms: Array<{ value: DiagnosisSymptom; label: string }> = [
    { value: "brown", label: "Brown patches" },
    { value: "weeds", label: "Weeds" },
    { value: "bare", label: "Bare spots" },
    { value: "thin", label: "Thin grass" },
    { value: "not_sure", label: "Not sure" },
];

export interface GuestScanPageProps {
    renderTurnstile?: TurnstileRenderer;
    createRequestId?: () => string;
}

export function GuestScanPage({ renderTurnstile, createRequestId = () => crypto.randomUUID() }: GuestScanPageProps) {
    const { ensureAnonymousSession } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [symptom, setSymptom] = useState<DiagnosisSymptom | null>(null);
    const [captchaToken, setCaptchaToken] = useState("");
    const [diagnosis, setDiagnosis] = useState<GuestDiagnosisPreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef<string | null>(null);

    const selectFile = (selected: File | undefined) => {
        if (!selected) return;
        if (selected.type !== "image/jpeg" && selected.type !== "image/png") {
            setError("Choose a JPG or PNG lawn photo.");
            return;
        }
        setFile(selected);
        setDiagnosis(null);
        setError(null);
        requestIdRef.current = createRequestId();
    };

    const analyze = async () => {
        if (!file || !symptom || !captchaToken || loading) return;
        setLoading(true);
        setError(null);
        try {
            await ensureAnonymousSession(captchaToken);
            const imageBase64 = await resizeImageForAI(file);
            const requestId = requestIdRef.current ?? createRequestId();
            requestIdRef.current = requestId;
            const result = await runGuestPreview({ imageBase64, mimeType: "image/jpeg", symptom, requestId });
            setDiagnosis(result.diagnosis);
            if (result.diagnosis.image_quality.usable) {
                await saveGuestDraft({
                    version: 1,
                    image: file,
                    previewUrlData: `data:image/jpeg;base64,${imageBase64}`,
                    symptom,
                    previewDiagnosis: result.diagnosis,
                    requestId,
                    createdAt: Date.now(),
                });
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The lawn scan could not be completed. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 px-5 py-10">
            <div className="mx-auto max-w-lg space-y-6">
                <header>
                    <p className="text-sm font-semibold text-lawn-green-700">One free preview</p>
                    <h1 className="mt-1 text-3xl font-bold text-gray-900">What’s going on with your lawn?</h1>
                    <p className="mt-2 text-gray-600">Take one clear photo in daylight, close enough to show the affected grass and some healthy grass nearby.</p>
                </header>
                <section className="card space-y-5 p-5">
                    <label className="block font-semibold text-gray-900" htmlFor="guest-lawn-photo">Lawn photo</label>
                    <input id="guest-lawn-photo" aria-label="Lawn photo" type="file" accept="image/jpeg,image/png" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />
                    {file && <p className="text-sm text-gray-600"><Camera className="mr-1 inline" size={15} />{file.name}</p>}
                    <fieldset>
                        <legend className="font-semibold text-gray-900">What do you notice most?</legend>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {symptoms.map((item) => <label key={item.value} className="rounded-xl border bg-white p-3 text-sm"><input className="mr-2" type="radio" name="symptom" value={item.value} checked={symptom === item.value} onChange={() => setSymptom(item.value)} />{item.label}</label>)}
                        </div>
                    </fieldset>
                    <div className="rounded-xl bg-gray-50 p-3"><ShieldCheck className="mr-2 inline text-lawn-green-700" size={17} />{renderTurnstile ? renderTurnstile(setCaptchaToken) : <TurnstileWidget onVerify={setCaptchaToken} />}</div>
                    <button type="button" className="btn-primary flex w-full items-center justify-center gap-2" disabled={!file || !symptom || !captchaToken || loading} onClick={analyze}>{loading && <Loader2 className="animate-spin" size={16} />}Analyze my lawn</button>
                    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                </section>
                {diagnosis && <DiagnosisResult diagnosis={diagnosis} mode="guest" />}
                {diagnosis?.image_quality.usable && <div className="card space-y-3 p-5"><h2 className="font-bold text-gray-900">Want the full plan and follow-up guidance?</h2><Link className="btn-primary block w-full text-center" to="/diagnose/convert">Create profile</Link><Link className="block text-center text-sm font-semibold text-lawn-green-700" to="/diagnose/convert?mode=signin">Sign in</Link></div>}
            </div>
        </main>
    );
}
