import { useState, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useGrassType } from "@/contexts/LawnProfileContext";
import { BottomNav } from "@/components/BottomNav";
import { diagnoseLawn, getRetakeGuidance, resizeImageForAI, Diagnosis } from "@/lib/gemini";
import type { DiagnosisMode } from "@/lib/gemini";
import { isDiagnosisV2, type DiagnosisV2 } from "@shared/diagnosis-contract";
import { getGrassTypeInfo } from "@/lib/lawnLogic";
import { createObservationFromDiagnosis } from "@/features/plans/createPlan";
import { usePrimaryCase } from "@/features/plans/api";
import type { AiUsageEvent, AllowanceSummary, LawnCase, LawnScan, ScanEntitlement, ScanPurpose } from "@/types/database";
import {
    Camera,
    Upload,
    Loader2,
    ChevronDown,
    ChevronUp,
    Trash2,
    AlertTriangle,
    CheckCircle,
    Info,
    Sparkles,
} from "lucide-react";
import { format } from "date-fns";

const TODAY = new Date();
const SIGNED_SCAN_URL_EXPIRES_IN_SECONDS = 60 * 60;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface ScanIntent {
    mode: Extract<DiagnosisMode, "personalized" | "follow_up">;
    purpose: Extract<ScanPurpose, "initial" | "follow_up">;
    caseId: string | null;
    caseTitle?: string;
}

export function getScanIntent(primaryCase: LawnCase | null): ScanIntent {
    if (!primaryCase) return { mode: "personalized", purpose: "initial", caseId: null };
    return {
        mode: "follow_up",
        purpose: "follow_up",
        caseId: primaryCase.id,
        caseTitle: primaryCase.title,
    };
}

export function deriveAllowanceSummary(
    entitlement: ScanEntitlement | null,
    events: readonly AiUsageEvent[],
    now = new Date(),
): AllowanceSummary {
    const inFlight = events.some((event) => event.status === "reserved" || event.status === "started");
    if (!entitlement) {
        return { source: "welcome", remaining: 3, reset_at: null, in_flight: inFlight };
    }
    const start = new Date(entitlement.welcome_started_at).getTime();
    const elapsed = Math.max(0, now.getTime() - start);
    if (elapsed < THIRTY_DAYS_MS) {
        const used = events.filter((event) => event.allowance_source === "welcome" && event.status === "completed").length;
        return {
            source: "welcome",
            remaining: Math.max(0, entitlement.welcome_limit - used),
            reset_at: new Date(start + THIRTY_DAYS_MS).toISOString(),
            in_flight: inFlight,
        };
    }
    const periodIndex = Math.floor(elapsed / THIRTY_DAYS_MS);
    const periodStart = start + periodIndex * THIRTY_DAYS_MS;
    const used = events.filter((event) =>
        event.allowance_source === "monthly"
        && event.status === "completed"
        && new Date(event.created_at).getTime() >= periodStart,
    ).length;
    return {
        source: "monthly",
        remaining: Math.max(0, 1 - used),
        reset_at: new Date(periodStart + THIRTY_DAYS_MS).toISOString(),
        in_flight: inFlight,
    };
}

export function stableScanRequestId(
    current: string | null,
    create: () => string = () => crypto.randomUUID(),
): string {
    return current ?? create();
}

export function scanImageSource(scan: DisplayableLawnScan): string | null {
    return scan.signed_image_url || scan.image_url || null;
}

export function scanDiagnosisLabel(scan: LawnScan): string {
    return isDiagnosisV2(scan.diagnosis)
        ? scan.diagnosis.likely_cause
        : scan.diagnosis.condition_label || "Previous lawn scan";
}

function resetLabel(value: string | null): string | null {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function ScanExperience({
    allowance,
    intent,
    recentScans,
    onChoosePhoto,
}: {
    allowance: AllowanceSummary | null;
    intent: ScanIntent;
    recentScans: ReactNode;
    onChoosePhoto: () => void;
}) {
    const exhausted = allowance?.remaining === 0;
    const disabled = exhausted || allowance?.in_flight === true;
    const reset = resetLabel(allowance?.reset_at ?? null);
    return (
        <>
            <section className="card p-5" aria-labelledby="scan-allowance-title">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p id="scan-allowance-title" className="text-xs font-bold uppercase tracking-wide text-gray-500">Scan allowance</p>
                        <p className="mt-1 text-xl font-bold text-gray-950">
                            {allowance ? `${allowance.remaining} ${allowance.remaining === 1 ? "scan" : "scans"} available` : "Checking availability…"}
                        </p>
                    </div>
                    {allowance && <span className="rounded-full bg-lawn-green-50 px-3 py-1 text-xs font-semibold text-lawn-green-700">{allowance.source === "welcome" ? "Welcome scans" : "Monthly scan"}</span>}
                </div>
                {exhausted && reset && <p className="mt-3 text-sm text-gray-700">Your next scan is available {reset}. Your results and plan stay available below.</p>}
                {allowance?.in_flight && <p className="mt-3 text-sm font-medium text-amber-700">A scan is already being analyzed. It is safe to leave this page and return shortly.</p>}
                <p className="mt-3 text-xs text-gray-500">Failed or unusable analyses do not use your personal scan allowance.</p>
            </section>

            <section className="card p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-lawn-green-700">
                    {intent.purpose === "follow_up" ? "Progress scan" : "Problem scan"}
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-950">
                    {intent.purpose === "follow_up" && intent.caseTitle
                        ? `Compare progress on ${intent.caseTitle}`
                        : "Diagnose a lawn problem"}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                    {intent.purpose === "follow_up"
                        ? "This photo will be linked to your current case so the coach can compare what changed."
                        : "Your result will be saved as an observation. You decide whether to make it your active plan."}
                </p>
                <button type="button" className="btn-primary mt-4 flex min-h-12 w-full items-center justify-center" disabled={disabled || allowance === null} onClick={onChoosePhoto}>
                    <Camera size={18} aria-hidden="true" /> Choose a photo
                </button>
            </section>

            <section aria-labelledby="recent-scans-title">
                <h2 id="recent-scans-title" className="section-title px-1">Recent scans</h2>
                {recentScans}
            </section>
        </>
    );
}

type DisplayableLawnScan = LawnScan & {
    signed_image_url?: string | null;
};

const SEVERITY_CONFIG = {
    low: { label: "Low", class: "bg-blue-100 text-blue-700" },
    medium: { label: "Medium", class: "bg-yellow-100 text-yellow-700" },
    high: { label: "High", class: "bg-red-100 text-red-700" },
};

const URGENCY_ICON = {
    low: <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />,
    medium: <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />,
    high: <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />,
};

function ScoreRing({ score }: { score: number }) {
    const color =
        score >= 8 ? "text-lawn-green-600" :
            score >= 5 ? "text-yellow-500" : "text-red-500";
    const bgColor =
        score >= 8 ? "bg-lawn-green-50" :
            score >= 5 ? "bg-yellow-50" : "bg-red-50";

    return (
        <div className={`w-16 h-16 rounded-full ${bgColor} flex flex-col items-center justify-center flex-shrink-0`}>
            <span className={`text-2xl font-bold ${color}`}>{score}</span>
            <span className="text-[9px] text-gray-400 font-medium">/10</span>
        </div>
    );
}

type DisplayDiagnosis = Diagnosis | DiagnosisV2;

function DiagnosisResult({ diagnosis, imageUrl }: { diagnosis: DisplayDiagnosis; imageUrl: string }) {
    if (isDiagnosisV2(diagnosis)) {
        return (
            <div className="space-y-4 animate-slide-up">
                <div className="card p-4 flex items-center gap-4">
                    {imageUrl && (
                        <img src={imageUrl} alt="Scanned lawn" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Likely cause</p>
                        <p className="font-bold text-gray-900 text-lg leading-tight">{diagnosis.likely_cause}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{diagnosis.summary}</p>
                        <p className="text-xs text-lawn-green-700 mt-2 font-medium">Confidence: {diagnosis.confidence}</p>
                    </div>
                </div>
                <div className="card p-4">
                    <p className="section-title">What supports this</p>
                    <ul className="space-y-2">
                        {diagnosis.evidence.map((item, index) => (
                            <li key={index} className="text-sm text-gray-700">
                                <span className="font-semibold">{item.observation}</span>
                                <span className="text-gray-500"> — {item.significance}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="card p-4 bg-lawn-green-50 border-lawn-green-100">
                    <p className="section-title">Safest next step</p>
                    <p className="text-sm text-gray-800">{diagnosis.safe_next_step}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-slide-up">
            {/* Header */}
            <div className="card p-4 flex items-center gap-4">
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt="Scanned lawn"
                        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                    />
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Diagnosis</p>
                    <p className="font-bold text-gray-900 text-lg leading-tight">{diagnosis.condition_label}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{diagnosis.summary}</p>
                </div>
                <ScoreRing score={diagnosis.condition_score} />
            </div>

            {/* Observations */}
            {diagnosis.observations?.length > 0 && (
                <div className="card p-4">
                    <p className="section-title">What I See</p>
                    <ul className="space-y-1.5">
                        {diagnosis.observations.map((obs, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <CheckCircle size={14} className="text-lawn-green-500 flex-shrink-0 mt-0.5" />
                                {obs}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Issues */}
            {diagnosis.issues?.length > 0 && (
                <div className="card p-4">
                    <p className="section-title">Issues Detected</p>
                    <div className="space-y-3">
                        {diagnosis.issues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0 ${SEVERITY_CONFIG[issue.severity].class}`}>
                                    {SEVERITY_CONFIG[issue.severity].label}
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">{issue.type}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommendations */}
            {diagnosis.recommendations?.length > 0 && (
                <div className="card p-4">
                    <p className="section-title">Recommendations</p>
                    <div className="space-y-3">
                        {diagnosis.recommendations.map((rec, i) => (
                            <div key={i} className="flex items-start gap-2">
                                {URGENCY_ICON[rec.urgency]}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800">{rec.action}</p>
                                    {rec.product_suggestion && (
                                        <p className="text-xs text-lawn-green-700 font-medium mt-0.5">
                                            💊 {rec.product_suggestion}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function ScanHistoryItem({ scan, onDelete }: { scan: DisplayableLawnScan; onDelete: (scan: DisplayableLawnScan) => void }) {
    const [expanded, setExpanded] = useState(false);
    const diagnosis = scan.diagnosis;
    // signed_image_url is used for private storage objects; image_url supports legacy public/base64 scans.
    const imgSrc = scanImageSource(scan);

    return (
        <div className="card overflow-hidden">
            <button
                className="w-full flex items-center gap-3 p-4 text-left"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                    {imgSrc ? (
                        <img src={imgSrc} alt="Lawn scan" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Camera size={18} className="text-gray-400" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">
                        {scanDiagnosisLabel(scan)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(scan.created_at), "MMM d, yyyy · h:mm a")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!isDiagnosisV2(diagnosis) && <ScoreRing score={diagnosis.condition_score} />}
                    {expanded ? (
                        <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                        <ChevronDown size={16} className="text-gray-400" />
                    )}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                    {imgSrc && (
                        <img
                            src={imgSrc}
                            alt="Lawn scan"
                            className="w-full h-40 object-cover rounded-xl"
                        />
                    )}
                    <DiagnosisResult diagnosis={diagnosis} imageUrl="" />
                    <button
                        onClick={() => onDelete(scan)}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors mt-2"
                    >
                        <Trash2 size={13} /> Delete scan
                    </button>
                </div>
            )}
        </div>
    );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

export function ScanPage() {
    const { user } = useAuth();
    const grassType = useGrassType();
    const grassInfo = getGrassTypeInfo(grassType);
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [currentDiagnosis, setCurrentDiagnosis] = useState<DisplayDiagnosis | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const requestIdRef = useRef<string | null>(null);
    const primaryCaseQuery = usePrimaryCase(user?.id ?? "");
    const intent = getScanIntent(primaryCaseQuery.data ?? null);

    const { data: allowance = null } = useQuery({
        queryKey: ["scan-allowance", user?.id],
        queryFn: async () => {
            const [entitlementResult, usageResult] = await Promise.all([
                supabase.from("scan_entitlements").select("*").eq("user_id", user!.id).maybeSingle(),
                supabase.from("ai_usage_events").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }),
            ]);
            if (entitlementResult.error) throw entitlementResult.error;
            if (usageResult.error) throw usageResult.error;
            return deriveAllowanceSummary(
                entitlementResult.data as ScanEntitlement | null,
                (usageResult.data ?? []) as AiUsageEvent[],
            );
        },
        enabled: !!user,
        refetchInterval: (query) => query.state.data?.in_flight ? 5000 : false,
    });

    const { data: scans = [], isLoading: scansLoading } = useQuery({
        queryKey: ["lawn-scans", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("lawn_scans")
                .select("*")
                .eq("user_id", user!.id)
                .order("created_at", { ascending: false });
            if (error) throw error;

            const scans = (data ?? []) as LawnScan[];
            return await Promise.all(
                scans.map(async (scan): Promise<DisplayableLawnScan> => {
                    if (!scan.storage_path) return scan;

                    const { data: signedData, error: signedError } = await supabase.storage
                        .from("lawn-scans")
                        .createSignedUrl(scan.storage_path, SIGNED_SCAN_URL_EXPIRES_IN_SECONDS);

                    if (signedError) {
                        console.error("Failed to create signed scan image URL:", signedError);
                        return scan;
                    }

                    return { ...scan, signed_image_url: signedData.signedUrl };
                })
            );
        },
        enabled: !!user,
    });

    const deleteScan = useMutation({
        mutationFn: async (scan: DisplayableLawnScan) => {
            if (scan.storage_path) {
                const { error: removeError } = await supabase.storage
                    .from("lawn-scans")
                    .remove([scan.storage_path]);

                if (removeError) throw removeError;
            }

            const { error } = await supabase.from("lawn_scans").delete().eq("id", scan.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lawn-scans"] }),
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        requestIdRef.current = crypto.randomUUID();
        setPreviewUrl(URL.createObjectURL(file));
        setCurrentDiagnosis(null);
        setError(null);
    };

    const handleAnalyze = async () => {
        if (!selectedFile || !user) return;
        setIsAnalyzing(true);
        setError(null);
        setCurrentDiagnosis(null);

        let uploadedPath: string | null = null;
        let savedScan = false;

        try {
            // 1. Resize image for AI (limits payload size to avoid Edge Function errors)
            const base64 = await resizeImageForAI(selectedFile);
            const mimeType = "image/jpeg"; // resizeImageForAI outputs JPEG

            // 2. Call Gemini Vision before uploading so failed analysis does not orphan storage files
            const requestId = stableScanRequestId(requestIdRef.current);
            requestIdRef.current = requestId;
            const result = await diagnoseLawn({
                mode: intent.mode,
                requestId,
                imageBase64: base64,
                mimeType,
                context: {
                    symptom: "not_sure",
                    grass_type: grassType,
                    date: format(TODAY, "yyyy-MM-dd"),
                    original_diagnosis_summary: primaryCaseQuery.data?.diagnosis.summary,
                },
            });
            if (!isDiagnosisV2(result.diagnosis)) {
                throw new Error("The lawn analysis returned an unexpected result.");
            }
            const diagnosis = result.diagnosis;
            const retakeGuidance = getRetakeGuidance(diagnosis);
            if (retakeGuidance) {
                setError(retakeGuidance);
                setSelectedFile(null);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                requestIdRef.current = null;
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }

            // 3. Convert base64 to Blob for private storage persistence
            const blob = base64ToBlob(base64, mimeType);

            if (intent.purpose === "initial") {
                await createObservationFromDiagnosis(user.id, diagnosis, blob, { grassType });
                savedScan = true;
                setCurrentDiagnosis(diagnosis);
                setCurrentImageUrl(previewUrl ?? "");
                queryClient.invalidateQueries({ queryKey: ["lawn-scans"] });
                queryClient.invalidateQueries({ queryKey: ["lawn-cases"] });
                queryClient.invalidateQueries({ queryKey: ["scan-allowance"] });
                setSelectedFile(null);
                setPreviewUrl(null);
                requestIdRef.current = null;
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }

            // 4. Upload to private Supabase Storage
            const uuid = typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2) + Date.now().toString(36);
            const filePath = `${user.id}/${uuid}.jpg`;
            uploadedPath = filePath;

            const { error: uploadError } = await supabase.storage
                .from("lawn-scans")
                .upload(filePath, blob, {
                    contentType: mimeType,
                    upsert: true,
                });
            if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

            // 5. Create a short-lived signed URL for immediate display
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from("lawn-scans")
                .createSignedUrl(filePath, SIGNED_SCAN_URL_EXPIRES_IN_SECONDS);
            if (signedUrlError) throw new Error(`Image preview failed: ${signedUrlError.message}`);

            // 6. Save to lawn_scans table with storage path; image_url remains populated for legacy compatibility
            const { error: insertError } = await supabase.from("lawn_scans").insert({
                user_id: user.id,
                image_url: filePath,
                storage_path: filePath,
                diagnosis,
                case_id: intent.caseId,
                purpose: intent.purpose,
                diagnosis_schema_version: 2,
            });
            if (insertError) throw new Error(`Save failed: ${insertError.message}`);
            savedScan = true;

            // 7. Show result
            setCurrentDiagnosis(diagnosis);
            setCurrentImageUrl(signedUrlData.signedUrl);
            queryClient.invalidateQueries({ queryKey: ["lawn-scans"] });
            queryClient.invalidateQueries({ queryKey: ["scan-allowance"] });

            // Clear for next scan
            setSelectedFile(null);
            setPreviewUrl(null);
            requestIdRef.current = null;
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            if (uploadedPath && !savedScan) {
                const { error: cleanupError } = await supabase.storage.from("lawn-scans").remove([uploadedPath]);
                if (cleanupError) {
                    console.error("Failed to clean up orphaned scan image:", cleanupError);
                }
            }
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setIsAnalyzing(false);
        }
    };


    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-lawn-green-700 px-5 pt-12 pb-5">
                <h1 className="text-white text-2xl font-bold flex items-center gap-2">
                    <Sparkles size={22} /> Scan Lawn
                </h1>
                <p className="text-lawn-green-200 text-sm mt-0.5">
                    AI-powered {grassInfo.name} lawn diagnosis
                </p>
            </div>

            <div className="px-4 py-5 space-y-5 page-content">

                <ScanExperience
                    allowance={primaryCaseQuery.isLoading || !allowance
                        ? null
                        : isAnalyzing
                          ? { ...allowance, in_flight: true }
                          : allowance}
                    intent={intent}
                    onChoosePhoto={() => fileInputRef.current?.click()}
                    recentScans={scansLoading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="animate-spin text-lawn-green-600" size={24} />
                        </div>
                    ) : scans.length === 0 ? (
                        <div className="card p-8 text-center">
                            <p className="text-3xl mb-2">📷</p>
                            <p className="text-gray-500 text-sm font-medium">No scans yet</p>
                            <p className="text-gray-400 text-xs mt-1">Your first diagnosis will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {scans.map((scan) => (
                                <ScanHistoryItem key={scan.id} scan={scan} onDelete={(item) => deleteScan.mutate(item)} />
                            ))}
                        </div>
                    )}
                />

                {/* Upload / Camera Zone */}
                <div className={selectedFile ? "" : "sr-only"}>
                    <p className="section-title px-1">Selected photo</p>
                    <div
                        className="card overflow-hidden cursor-pointer"
                        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                    >
                        {previewUrl ? (
                            <div className="relative">
                                <img
                                    src={previewUrl}
                                    alt="Selected lawn"
                                    className="w-full h-56 object-cover"
                                />
                                <div className="absolute bottom-3 right-3">
                                    <span className="bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                                        Tap to change
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="h-48 flex flex-col items-center justify-center gap-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl mx-3 my-3">
                                <div className="w-14 h-14 rounded-2xl bg-lawn-green-50 flex items-center justify-center">
                                    <Camera size={28} className="text-lawn-green-600" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-gray-700 text-sm">Take or upload a photo</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Opens camera on mobile · JPG, PNG up to 20MB
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-lawn-green-700 bg-lawn-green-50 px-3 py-1.5 rounded-full border border-lawn-green-200">
                                        <Camera size={12} /> Camera
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white px-3 py-1.5 rounded-full border border-gray-200">
                                        <Upload size={12} /> Gallery
                                    </span>
                                </div>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            className="hidden"
                            id="lawn-photo-input"
                        />
                    </div>

                    {selectedFile && !isAnalyzing && (
                        <button
                            id="analyze-btn"
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
                        >
                            <Sparkles size={16} />
                            Analyze My Lawn
                        </button>
                    )}
                </div>

                {/* Analyzing State */}
                {isAnalyzing && (
                    <div className="card p-8 flex flex-col items-center gap-4 bg-lawn-green-50 border-lawn-green-100">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-lawn-green-100 flex items-center justify-center">
                                <Loader2 size={32} className="text-lawn-green-600 animate-spin" />
                            </div>
                            <div className="absolute inset-0 rounded-full bg-lawn-green-300 animate-ping opacity-20" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-lawn-green-800">Analyzing your lawn...</p>
                            <p className="text-xs text-lawn-green-600 mt-1">
                                AI is examining your photo. This takes about 5–10 seconds.
                            </p>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="card p-4 bg-red-50 border-red-100 flex items-start gap-3">
                        <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-red-700">Analysis failed</p>
                            <p className="text-xs text-red-600 mt-0.5">{error}</p>
                        </div>
                    </div>
                )}

                {/* Latest Result */}
                {currentDiagnosis && (
                    <div>
                        <p className="section-title px-1">Latest Result</p>
                        <DiagnosisResult diagnosis={currentDiagnosis} imageUrl={currentImageUrl} />
                    </div>
                )}

            </div>

            <BottomNav />
        </div>
    );
}
