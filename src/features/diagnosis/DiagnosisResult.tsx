import { useId } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";

import { toDisplayDiagnosis } from "./legacyAdapter";

export interface DiagnosisResultProps {
    diagnosis: unknown;
    mode: "guest" | "personalized" | "history";
    onStartPlan?: () => void;
}

const confidenceStyle = {
    low: "bg-amber-50 text-amber-800 border-amber-200",
    medium: "bg-blue-50 text-blue-800 border-blue-200",
    high: "bg-lawn-green-50 text-lawn-green-800 border-lawn-green-200",
} as const;

export function DiagnosisResult({
    diagnosis,
    mode,
    onStartPlan,
}: DiagnosisResultProps) {
    const display = toDisplayDiagnosis(diagnosis);
    const idPrefix = useId();
    const retakeHeadingId = `${idPrefix}-retake`;
    const diagnosisHeadingId = `${idPrefix}-diagnosis`;
    const evidenceHeadingId = `${idPrefix}-evidence`;
    const alternativesHeadingId = `${idPrefix}-alternatives`;
    const nextStepHeadingId = `${idPrefix}-next-step`;
    const safetyHeadingId = `${idPrefix}-safety`;

    if (!display.imageUsable) {
        return (
            <section className="card p-5" aria-labelledby={retakeHeadingId}>
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 text-amber-600" size={20} aria-hidden="true" />
                    <div>
                        <h2 id={retakeHeadingId} className="font-bold text-gray-900">Retake this photo</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            {display.retakeGuidance ?? "Use good light and fill the frame with the affected lawn area."}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    const showDetails = mode !== "guest";
    return (
        <section className="space-y-4" aria-labelledby={diagnosisHeadingId}>
            <div className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {display.isLegacy ? "Historical scan" : "Likely cause"}
                    </p>
                    {display.confidence && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${confidenceStyle[display.confidence]}`}>
                            {display.confidence[0].toUpperCase() + display.confidence.slice(1)} confidence
                        </span>
                    )}
                </div>
                <h2 id={diagnosisHeadingId} className="mt-2 text-xl font-bold text-gray-900">
                    {display.likelyCause}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{display.summary}</p>
            </div>

            {showDetails && display.evidence.length > 0 && (
                <section className="card p-5" aria-labelledby={evidenceHeadingId}>
                    <h3 id={evidenceHeadingId} className="font-bold text-gray-900">What supports this</h3>
                    <ul className="mt-3 space-y-3">
                        {display.evidence.map((item, index) => (
                            <li key={`${item.observation}-${index}`} className="flex items-start gap-2 text-sm">
                                <CheckCircle2 className="mt-0.5 shrink-0 text-lawn-green-600" size={16} aria-hidden="true" />
                                <div>
                                    <p className="font-semibold text-gray-800">{item.observation}</p>
                                    <p className="text-gray-500">{item.significance}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {showDetails && display.alternatives.length > 0 && (
                <section className="card p-5" aria-labelledby={alternativesHeadingId}>
                    <h3 id={alternativesHeadingId} className="font-bold text-gray-900">What else it could be</h3>
                    <div className="mt-3 space-y-3">
                        {display.alternatives.map((item, index) => (
                            <div key={`${item.cause}-${index}`} className="flex items-start gap-2 text-sm">
                                <HelpCircle className="mt-0.5 shrink-0 text-blue-600" size={16} aria-hidden="true" />
                                <div>
                                    <p className="font-semibold text-gray-800">{item.cause}</p>
                                    <p className="text-gray-500">{item.reason}</p>
                                    <p className="mt-1 text-gray-700"><span className="font-medium">Check:</span> {item.verification}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="card border-lawn-green-100 bg-lawn-green-50 p-5" aria-labelledby={nextStepHeadingId}>
                <h3 id={nextStepHeadingId} className="font-bold text-gray-900">Safest next step</h3>
                <p className="mt-2 text-sm text-gray-700">{display.safeNextStep}</p>
            </section>

            {showDetails && display.safetyNotes.length > 0 && (
                <section className="card p-5" aria-labelledby={safetyHeadingId}>
                    <h3 id={safetyHeadingId} className="flex items-center gap-2 font-bold text-gray-900">
                        <ShieldCheck size={17} className="text-lawn-green-600" aria-hidden="true" />
                        Before you act
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        {display.safetyNotes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                </section>
            )}

            {mode === "personalized" && display.canStartPlan && onStartPlan && (
                <button type="button" onClick={onStartPlan} className="btn-primary w-full">
                    Start this plan
                </button>
            )}
        </section>
    );
}
