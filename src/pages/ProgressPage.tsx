import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, ImageOff, Leaf, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { toDisplayDiagnosis } from "@/features/diagnosis/legacyAdapter";
import { comparisonPresentation, type ComparisonStatus } from "@/features/progress/compare";
import { supabase } from "@/lib/supabase";
import type { LawnCase, LawnScan, PlanStep } from "@/types/database";
import { isDiagnosisV2, isFollowUpComparison } from "@shared/diagnosis-contract";
import { ActivityLogPage } from "./ActivityLogPage";

const SIGNED_SCAN_URL_EXPIRES_IN_SECONDS = 60 * 60;

type ProgressPhoto = { imageUrl: string | null; date: string };

export interface ProgressComparisonView {
    id: string;
    caseTitle: string;
    status: ComparisonStatus;
    summary: string;
    before: ProgressPhoto;
    after: ProgressPhoto;
}

export interface LegacyProgressScan {
    id: string;
    title: string;
    summary: string;
    date: string;
    imageUrl: string | null;
}

type SignedProgressScan = LawnScan & { signed_image_url?: string | null };

function dateLabel(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function scanImage(scan: Partial<SignedProgressScan>): string | null {
    if (scan.storage_path) return scan.signed_image_url ?? null;
    return typeof scan.image_url === "string" && scan.image_url.length > 0 ? scan.image_url : null;
}

export function legacyProgressScan(scan: Partial<LawnScan> & { id: string; diagnosis?: unknown; created_at?: string }): LegacyProgressScan {
    const display = toDisplayDiagnosis(scan.diagnosis);
    return {
        id: scan.id,
        title: display.likelyCause,
        summary: display.summary,
        date: scan.created_at ?? new Date(0).toISOString(),
        imageUrl: typeof scan.image_url === "string" && scan.image_url.length > 0 ? scan.image_url : null,
    };
}

function PhotoPanel({ label, photo }: { label: "Before" | "After"; photo: ProgressPhoto }) {
    return (
        <figure className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
            {photo.imageUrl ? (
                <img src={photo.imageUrl} alt={`${label} lawn condition`} className="h-32 w-full object-cover" />
            ) : (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
                    <ImageOff size={22} aria-hidden="true" />
                    <span className="text-xs font-medium">Photo unavailable</span>
                </div>
            )}
            <figcaption className="border-t border-gray-100 bg-white px-3 py-2">
                <p className="text-xs font-bold text-gray-800">{label}</p>
                <p className="text-[11px] text-gray-500">{dateLabel(photo.date)}</p>
            </figcaption>
        </figure>
    );
}

export function ProgressView({
    comparisons,
    completedSteps,
    legacyScans,
    resolvedCases,
    nextDecision,
    activityContent,
}: {
    comparisons: ProgressComparisonView[];
    completedSteps: PlanStep[];
    legacyScans: LegacyProgressScan[];
    resolvedCases: LawnCase[];
    nextDecision: string | null;
    activityContent: ReactNode;
}) {
    const calm = !nextDecision;
    return (
        <main className="mx-auto max-w-2xl px-5 py-6">
            <div>
                <p className="text-sm font-semibold text-lawn-green-700">Evidence over scores</p>
                <h1 className="mt-1 text-2xl font-bold text-gray-950">Progress</h1>
                <p className="mt-1 text-sm text-gray-600">See what changed, what you completed, and what to watch next.</p>
            </div>

            {calm ? (
                <section className="card mt-5 p-6 text-center">
                    <CheckCircle2 className="mx-auto text-lawn-green-600" size={30} aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-gray-950">Nothing needs attention right now</h2>
                    <p className="mt-2 text-sm text-gray-600">No treatment is needed. Keep enjoying the lawn and return if something changes.</p>
                </section>
            ) : (
                <section className="card mt-5 flex items-start gap-3 p-5">
                    <Eye className="mt-0.5 shrink-0 text-lawn-green-600" size={22} aria-hidden="true" />
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What to watch next</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{nextDecision}</p>
                    </div>
                </section>
            )}

            {comparisons.length > 0 && (
                <section className="mt-8" aria-labelledby="comparisons-title">
                    <h2 id="comparisons-title" className="text-lg font-bold text-gray-950">Before and after</h2>
                    <div className="mt-3 space-y-4">
                        {comparisons.map((item) => {
                            const presentation = comparisonPresentation(item.status);
                            return (
                                <article key={item.id} className="card p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500">{item.caseTitle}</p>
                                            <h3 className="mt-1 text-lg font-bold text-gray-950">{presentation.label}</h3>
                                        </div>
                                        <span className="rounded-full bg-lawn-green-50 px-3 py-1 text-xs font-semibold text-lawn-green-700">Confirmed</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-700">{item.summary}</p>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <PhotoPanel label="Before" photo={item.before} />
                                        <PhotoPanel label="After" photo={item.after} />
                                    </div>
                                    <p className="mt-3 text-xs text-gray-500">{presentation.guidance}</p>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {completedSteps.length > 0 && (
                <section className="mt-8" aria-labelledby="completed-steps-title">
                    <h2 id="completed-steps-title" className="text-lg font-bold text-gray-950">Completed rescue steps</h2>
                    <div className="card mt-3 overflow-hidden">
                        {completedSteps.map((step, index) => (
                            <div key={step.id} className={`flex items-start gap-3 p-4 ${index < completedSteps.length - 1 ? "border-b border-gray-100" : ""}`}>
                                <CheckCircle2 className="mt-0.5 shrink-0 text-lawn-green-600" size={18} aria-hidden="true" />
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                                    {step.completed_at && <p className="mt-0.5 text-xs text-gray-500">{dateLabel(step.completed_at)}</p>}
                                    {step.result && step.result !== "completed" && <p className="mt-1 text-xs text-gray-600">Result: {step.result}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {resolvedCases.length > 0 && (
                <section className="mt-8" aria-labelledby="resolved-plans-title">
                    <h2 id="resolved-plans-title" className="text-lg font-bold text-gray-950">Resolved plans</h2>
                    <div className="mt-3 space-y-2">
                        {resolvedCases.map((item) => (
                            <div key={item.id} className="card flex items-center gap-3 p-4">
                                <Leaf className="shrink-0 text-lawn-green-600" size={20} aria-hidden="true" />
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                    <p className="mt-0.5 text-xs text-gray-500">Resolved {dateLabel(item.resolved_at ?? item.updated_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {legacyScans.length > 0 && (
                <section className="mt-8" aria-labelledby="legacy-scans-title">
                    <h2 id="legacy-scans-title" className="text-lg font-bold text-gray-950">Earlier scans</h2>
                    <p className="mt-1 text-xs text-gray-500">Older records are preserved for reference and do not create a rescue plan automatically.</p>
                    <div className="mt-3 space-y-2">
                        {legacyScans.map((scan) => (
                            <div key={scan.id} className="card flex items-start gap-3 p-4">
                                {scan.imageUrl ? <img src={scan.imageUrl} alt="Earlier lawn scan" className="h-14 w-14 rounded-xl object-cover" /> : <RotateCcw className="mt-1 shrink-0 text-gray-400" aria-hidden="true" />}
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{scan.title}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{scan.summary}</p>
                                    <p className="mt-1 text-[11px] text-gray-400">{dateLabel(scan.date)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section id="activity" className="mt-10 border-t border-gray-200 pt-7" aria-labelledby="activity-title">
                <h2 id="activity-title" className="text-lg font-bold text-gray-950">Manual activity history</h2>
                <p className="mt-1 text-sm text-gray-500">Log routine care here. Completed rescue steps stay in their own timeline above.</p>
                <div className="mt-4">{activityContent}</div>
            </section>
        </main>
    );
}

function buildComparisons(cases: readonly LawnCase[], scans: readonly SignedProgressScan[]): ProgressComparisonView[] {
    const caseTitles = new Map(cases.map((item) => [item.id, item.title]));
    return scans
        .filter((scan) => scan.purpose === "follow_up" && scan.case_id && scan.comparison_status)
        .map((after) => {
            const before = scans.find((scan) => scan.case_id === after.case_id && scan.purpose === "initial");
            return {
                id: after.id,
                caseTitle: caseTitles.get(after.case_id!) ?? "Lawn problem",
                status: after.comparison_status as ComparisonStatus,
                summary: after.comparison_summary ?? after.comparison_proposal_summary ?? "The follow-up comparison was confirmed.",
                before: { imageUrl: before ? scanImage(before) : null, date: before?.created_at ?? after.created_at },
                after: { imageUrl: scanImage(after), date: after.created_at },
            };
        });
}

function nextMonitoringDecision(cases: readonly LawnCase[], steps: readonly PlanStep[], scans: readonly LawnScan[]): string | null {
    const primary = cases.find((item) => item.is_primary && (item.status === "active" || item.status === "monitoring"));
    if (!primary) return null;
    const nextStep = steps
        .filter((step) => step.case_id === primary.id && (step.status === "ready" || step.status === "postponed"))
        .sort((left, right) => left.step_order - right.step_order)[0];
    if (nextStep) return `Next for ${primary.title}: ${nextStep.title}.`;
    const latest = scans.find((scan) => scan.case_id === primary.id && scan.comparison_status);
    if (latest?.comparison_status) return comparisonPresentation(latest.comparison_status).guidance;
    return `Keep monitoring ${primary.title}. Take another photo if the area changes.`;
}

export function ProgressPage() {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const casesQuery = useQuery({
        queryKey: ["lawn-cases", userId],
        queryFn: async () => {
            const { data, error } = await supabase.from("lawn_cases").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
            if (error) throw error;
            return (data ?? []) as LawnCase[];
        },
        enabled: Boolean(userId),
    });
    const stepsQuery = useQuery({
        queryKey: ["plan-steps", userId, "all"],
        queryFn: async () => {
            const { data, error } = await supabase.from("plan_steps").select("*").eq("user_id", userId).order("completed_at", { ascending: false });
            if (error) throw error;
            return (data ?? []) as PlanStep[];
        },
        enabled: Boolean(userId),
    });
    const scansQuery = useQuery({
        queryKey: ["lawn-scans", userId],
        queryFn: async () => {
            const { data, error } = await supabase.from("lawn_scans").select("*").eq("user_id", userId).order("created_at", { ascending: false });
            if (error) throw error;
            return Promise.all(((data ?? []) as LawnScan[]).map(async (scan): Promise<SignedProgressScan> => {
                if (!scan.storage_path) return scan;
                const { data: signed, error: signedError } = await supabase.storage.from("lawn-scans").createSignedUrl(scan.storage_path, SIGNED_SCAN_URL_EXPIRES_IN_SECONDS);
                return signedError ? scan : { ...scan, signed_image_url: signed.signedUrl };
            }));
        },
        enabled: Boolean(userId),
    });

    if (casesQuery.isLoading || stepsQuery.isLoading || scansQuery.isLoading) {
        return <main className="mx-auto max-w-2xl px-5 py-10 text-center text-sm text-gray-600">Building your progress timeline…</main>;
    }
    const cases = casesQuery.data ?? [];
    const steps = stepsQuery.data ?? [];
    const scans = scansQuery.data ?? [];
    const legacyScans = scans
        .filter((scan) => !isDiagnosisV2(scan.diagnosis) && !isFollowUpComparison(scan.diagnosis))
        .map(legacyProgressScan);

    return <ProgressView
        comparisons={buildComparisons(cases, scans)}
        completedSteps={steps.filter((step) => step.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))}
        legacyScans={legacyScans}
        resolvedCases={cases.filter((item) => item.status === "resolved")}
        nextDecision={nextMonitoringDecision(cases, steps, scans)}
        activityContent={<ActivityLogPage embedded />}
    />;
}
