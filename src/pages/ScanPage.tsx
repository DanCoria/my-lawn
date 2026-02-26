import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { diagnoseLawn, resizeImageForAI, generateThumbnail, Diagnosis } from "@/lib/gemini";
import { LawnScan } from "@/types/database";
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

function DiagnosisResult({ diagnosis, imageUrl }: { diagnosis: Diagnosis; imageUrl: string }) {
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

function ScanHistoryItem({ scan, onDelete }: { scan: LawnScan; onDelete: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const diagnosis = scan.diagnosis;
    // image_url is now always a data URL thumbnail stored inline
    const imgSrc = scan.image_url || null;

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
                    <p className="font-semibold text-sm text-gray-900">{diagnosis.condition_label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(scan.created_at), "MMM d, yyyy · h:mm a")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ScoreRing score={diagnosis.condition_score} />
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
                        onClick={() => onDelete(scan.id)}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors mt-2"
                    >
                        <Trash2 size={13} /> Delete scan
                    </button>
                </div>
            )}
        </div>
    );
}

export function ScanPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [currentDiagnosis, setCurrentDiagnosis] = useState<Diagnosis | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const { data: scans = [], isLoading: scansLoading } = useQuery({
        queryKey: ["lawn-scans", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("lawn_scans")
                .select("*")
                .eq("user_id", user!.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data ?? []) as LawnScan[];
        },
    });

    const deleteScan = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("lawn_scans").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lawn-scans"] }),
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setCurrentDiagnosis(null);
        setError(null);
    };

    const handleAnalyze = async () => {
        if (!selectedFile || !user) return;
        setIsAnalyzing(true);
        setError(null);
        setCurrentDiagnosis(null);

        try {
            // 1. Resize image for AI (limits payload size to avoid Edge Function errors)
            const base64 = await resizeImageForAI(selectedFile);
            const mimeType = "image/jpeg"; // resizeImageForAI outputs JPEG

            // 2. Generate a small thumbnail to store inline in DB (no Storage bucket needed)
            const thumbnail = await generateThumbnail(selectedFile);

            // 3. Call Gemini Vision
            const diagnosis = await diagnoseLawn(base64, mimeType, TODAY);

            // 4. Save to lawn_scans table with thumbnail as image_url
            const { error: insertError } = await supabase.from("lawn_scans").insert({
                user_id: user.id,
                image_url: thumbnail,
                diagnosis,
            });
            if (insertError) throw new Error(`Save failed: ${insertError.message}`);

            // 5. Show result
            setCurrentDiagnosis(diagnosis);
            setCurrentImageUrl(previewUrl ?? "");
            queryClient.invalidateQueries({ queryKey: ["lawn-scans"] });

            // Clear for next scan
            setSelectedFile(null);
            setPreviewUrl(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
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
                    AI-powered lawn diagnosis from a photo
                </p>
            </div>

            <div className="px-4 py-5 space-y-5 page-content">

                {/* Upload / Camera Zone */}
                <div>
                    <p className="section-title px-1">Take or Upload a Photo</p>
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

                {/* Scan History */}
                <div>
                    <p className="section-title px-1">Scan History</p>
                    {scansLoading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="animate-spin text-lawn-green-600" size={24} />
                        </div>
                    ) : scans.length === 0 ? (
                        <div className="card p-8 text-center">
                            <p className="text-3xl mb-2">📷</p>
                            <p className="text-gray-500 text-sm font-medium">No scans yet</p>
                            <p className="text-gray-400 text-xs mt-1">
                                Take a photo above to get your first AI diagnosis.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {scans.map((scan) => (
                                <ScanHistoryItem
                                    key={scan.id}
                                    scan={scan}
                                    onDelete={(id) => deleteScan.mutate(id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
