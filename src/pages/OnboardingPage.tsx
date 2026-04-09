import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLawnProfile } from "@/contexts/LawnProfileContext";
import { GRASS_TYPES, getGrassTypeInfo } from "@/lib/lawnLogic";
import { diagnoseLawn, resizeImageForAI } from "@/lib/gemini";
import type { GrassType, GrassTypeInfo } from "@/types/database";
import {
    Loader2,
    ChevronRight,
    ChevronLeft,
    Camera,
    Sparkles,
    Check,
    Leaf,
    Sun,
    Snowflake,
} from "lucide-react";

type Step = "welcome" | "select" | "confirm";

function GrassCard({
    grass,
    selected,
    onClick,
}: {
    grass: GrassTypeInfo;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            id={`grass-card-${grass.id}`}
            type="button"
            onClick={onClick}
            className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 group
                ${selected
                    ? "border-lawn-green-500 bg-lawn-green-50 shadow-md shadow-lawn-green-100 scale-[1.02]"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
                }
            `}
        >
            {/* Selection indicator */}
            {selected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-lawn-green-600 rounded-full flex items-center justify-center animate-scale-in">
                    <Check size={14} className="text-white" strokeWidth={3} />
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 
                    ${selected ? "bg-lawn-green-100" : "bg-gray-50 group-hover:bg-gray-100"}`}>
                    {grass.emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className={`font-semibold text-sm ${selected ? "text-lawn-green-800" : "text-gray-900"}`}>
                            {grass.name}
                        </p>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                            ${grass.season === "warm"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-sky-50 text-sky-600"
                            }`}
                        >
                            {grass.season === "warm" ? <Sun size={9} /> : <Snowflake size={9} />}
                            {grass.season}
                        </span>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${selected ? "text-lawn-green-600" : "text-gray-400"}`}>
                        {grass.description}
                    </p>
                </div>
            </div>
        </button>
    );
}

export function OnboardingPage() {
    const navigate = useNavigate();
    const { completeOnboarding } = useLawnProfile();

    const [step, setStep] = useState<Step>("welcome");
    const [selectedGrass, setSelectedGrass] = useState<GrassType | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Scan state
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleScanPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        setError(null);
        setScanResult(null);

        try {
            const base64 = await resizeImageForAI(file);
            const mimeType = "image/jpeg";
            const diagnosis = await diagnoseLawn(base64, mimeType, new Date());

            // Extract grass type from diagnosis observations/summary
            const fullText = [
                diagnosis.summary,
                ...(diagnosis.observations ?? []),
            ].join(" ").toLowerCase();

            // Try to match a grass type from the diagnosis text
            let detectedGrass: GrassType | null = null;
            for (const grass of GRASS_TYPES) {
                const searchTerms = [grass.name.toLowerCase(), grass.id.replace("-", " ")];
                if (searchTerms.some((term) => fullText.includes(term))) {
                    detectedGrass = grass.id;
                    break;
                }
            }

            if (detectedGrass) {
                setSelectedGrass(detectedGrass);
                const info = getGrassTypeInfo(detectedGrass);
                setScanResult(`AI detected: ${info.name}! ${info.emoji}`);
            } else {
                setScanResult("Couldn't identify grass type from the scan. Please select manually below.");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Scan failed — please try again or pick manually.");
        } finally {
            setIsScanning(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleComplete = async () => {
        if (!selectedGrass) return;
        setSaving(true);
        setError(null);

        try {
            await completeOnboarding(selectedGrass);
            navigate("/", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setSaving(false);
        }
    };

    const selectedInfo = selectedGrass ? getGrassTypeInfo(selectedGrass) : null;

    return (
        <div className="min-h-screen bg-gradient-to-b from-lawn-green-800 via-lawn-green-900 to-lawn-green-950 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-lawn-green-600 rounded-full opacity-10 blur-3xl -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-lawn-green-500 rounded-full opacity-5 blur-3xl translate-y-1/2" />

            <div className="relative max-w-md mx-auto px-5 py-12 min-h-screen flex flex-col">

                {/* ─── Step: Welcome ─── */}
                {step === "welcome" && (
                    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
                        <div className="text-8xl mb-6 animate-bounce-slow">🌱</div>
                        <h1 className="text-3xl font-bold text-white text-center mb-3">
                            Welcome to My Lawn
                        </h1>
                        <p className="text-lawn-green-300 text-center text-sm leading-relaxed max-w-xs mb-2">
                            Your personal lawn care dashboard, customized to your grass type,
                            climate, and schedule.
                        </p>
                        <p className="text-lawn-green-400 text-center text-xs max-w-xs mb-10">
                            Let's get set up — it only takes 30 seconds.
                        </p>
                        <button
                            id="onboarding-start-btn"
                            onClick={() => setStep("select")}
                            className="btn-primary flex items-center gap-2 text-base px-8 py-4 rounded-2xl shadow-xl shadow-lawn-green-900/50"
                        >
                            Get Started
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}

                {/* ─── Step: Select Grass ─── */}
                {step === "select" && (
                    <div className="flex-1 flex flex-col animate-slide-up">
                        {/* Header */}
                        <div className="text-center mb-6 pt-4">
                            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4">
                                <Leaf size={14} className="text-lawn-green-300" />
                                <span className="text-lawn-green-200 text-xs font-medium">Step 1 of 1</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">
                                What's your grass type?
                            </h2>
                            <p className="text-lawn-green-300 text-sm">
                                We'll tailor your schedule, tips, and AI scans to match.
                            </p>
                        </div>

                        {/* Scan button */}
                        <button
                            id="onboarding-scan-btn"
                            type="button"
                            onClick={() => !isScanning && fileInputRef.current?.click()}
                            disabled={isScanning}
                            className="w-full mb-4 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl border-2 border-dashed border-lawn-green-500/40 bg-lawn-green-800/30 backdrop-blur-sm text-lawn-green-200 text-sm font-semibold hover:bg-lawn-green-800/50 transition-all disabled:opacity-50"
                        >
                            {isScanning ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Scanning your lawn...
                                </>
                            ) : (
                                <>
                                    <Camera size={16} />
                                    Not sure? Scan your lawn
                                    <Sparkles size={14} className="text-lawn-green-400" />
                                </>
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleScanPhoto}
                            className="hidden"
                            id="onboarding-scan-input"
                        />

                        {/* Scan result */}
                        {scanResult && (
                            <div className="mb-4 py-3 px-4 rounded-xl bg-lawn-green-600/20 border border-lawn-green-500/30 backdrop-blur-sm">
                                <p className="text-lawn-green-200 text-sm text-center">{scanResult}</p>
                            </div>
                        )}

                        {/* Grass type list */}
                        <div className="flex-1 overflow-y-auto pb-28 space-y-2.5 -mx-1 px-1">
                            {/* Warm season */}
                            <p className="text-xs font-bold text-lawn-green-400 uppercase tracking-widest px-1 pt-2 flex items-center gap-1.5">
                                <Sun size={11} /> Warm Season
                            </p>
                            {GRASS_TYPES.filter((g) => g.season === "warm").map((grass) => (
                                <GrassCard
                                    key={grass.id}
                                    grass={grass}
                                    selected={selectedGrass === grass.id}
                                    onClick={() => setSelectedGrass(grass.id)}
                                />
                            ))}

                            <div className="h-3" />

                            {/* Cool season */}
                            <p className="text-xs font-bold text-lawn-green-400 uppercase tracking-widest px-1 pt-2 flex items-center gap-1.5">
                                <Snowflake size={11} /> Cool Season
                            </p>
                            {GRASS_TYPES.filter((g) => g.season === "cool").map((grass) => (
                                <GrassCard
                                    key={grass.id}
                                    grass={grass}
                                    selected={selectedGrass === grass.id}
                                    onClick={() => setSelectedGrass(grass.id)}
                                />
                            ))}
                        </div>

                        {/* Bottom action bar */}
                        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-lawn-green-950 via-lawn-green-950/95 to-transparent pt-8 pb-8 px-5">
                            <div className="max-w-md mx-auto flex gap-3">
                                <button
                                    id="onboarding-back-btn"
                                    onClick={() => setStep("welcome")}
                                    className="p-3.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button
                                    id="onboarding-continue-btn"
                                    onClick={() => selectedGrass && setStep("confirm")}
                                    disabled={!selectedGrass}
                                    className={`flex-1 btn-primary flex items-center justify-center gap-2 py-4 rounded-2xl text-base
                                        ${!selectedGrass ? "opacity-40 cursor-not-allowed" : "shadow-xl shadow-lawn-green-900/50"}
                                    `}
                                >
                                    Continue
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Step: Confirm ─── */}
                {step === "confirm" && selectedInfo && (
                    <div className="flex-1 flex flex-col items-center justify-center animate-slide-up">
                        <div className="w-full max-w-sm">
                            {/* Selected grass display */}
                            <div className="bg-white rounded-3xl shadow-2xl p-8 text-center mb-6">
                                <div className="text-6xl mb-4">{selectedInfo.emoji}</div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                    {selectedInfo.name}
                                </h2>
                                <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-4
                                    ${selectedInfo.season === "warm"
                                        ? "bg-amber-50 text-amber-600"
                                        : "bg-sky-50 text-sky-600"
                                    }`}
                                >
                                    {selectedInfo.season === "warm" ? <Sun size={10} /> : <Snowflake size={10} />}
                                    {selectedInfo.season}-season grass
                                </span>
                                <p className="text-sm text-gray-500 leading-relaxed mt-3">
                                    {selectedInfo.description}
                                </p>
                                <div className="h-px bg-gray-100 my-6" />
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Your dashboard, schedule, tips, and AI lawn scans will all be
                                    customized for {selectedInfo.name}. You can change this anytime
                                    from your profile.
                                </p>
                            </div>

                            {error && (
                                <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
                                    <p className="text-red-200 text-sm text-center">{error}</p>
                                </div>
                            )}

                            <button
                                id="onboarding-confirm-btn"
                                onClick={handleComplete}
                                disabled={saving}
                                className="btn-primary w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base shadow-xl shadow-lawn-green-900/50"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    <>
                                        Let's Go! 🚀
                                    </>
                                )}
                            </button>

                            <button
                                id="onboarding-change-btn"
                                onClick={() => setStep("select")}
                                disabled={saving}
                                className="w-full mt-3 py-3 text-lawn-green-300 text-sm font-medium hover:text-white transition-colors"
                            >
                                ← Change selection
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
