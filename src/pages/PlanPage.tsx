import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Check, ChevronRight, CirclePause, LockKeyhole, Route } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
    useCompletePlanStep,
    useLawnCases,
    usePlanSteps,
    usePostponePlanStep,
    useSwitchPrimaryCase,
} from "@/features/plans/api";
import { getCurrentStep, getNextPreview, getPrimaryCase } from "@/features/plans/state";
import type { LawnCase, PlanStep } from "@/types/database";
import { SchedulePage } from "./SchedulePage";

interface PlanViewProps {
    primaryCase: LawnCase | null;
    steps: PlanStep[];
    otherCases: LawnCase[];
    seasonalContent: ReactNode;
    onComplete: (step: PlanStep, result: string) => void;
    onPostpone: (step: PlanStep) => void;
    onSwitch: (lawnCase: LawnCase) => void;
    busy?: boolean;
}

export function PlanView({
    primaryCase,
    steps,
    otherCases,
    seasonalContent,
    onComplete,
    onPostpone,
    onSwitch,
    busy = false,
}: PlanViewProps) {
    const [switchTarget, setSwitchTarget] = useState<LawnCase | null>(null);
    const current = getCurrentStep(steps, new Date());
    const next = current ? getNextPreview(steps, current) : null;
    const laterLocked = next
        ? steps.filter((step) => step.step_order > next.step_order && step.status === "locked").length
        : 0;

    return (
        <main className="mx-auto max-w-2xl px-5 py-6">
            <div>
                <p className="text-sm font-semibold text-lawn-green-700">Your rescue plan</p>
                <h1 className="mt-1 text-2xl font-bold text-gray-950">
                    {primaryCase?.title ?? "No active lawn problem"}
                </h1>
                {primaryCase?.area_label && <p className="mt-1 text-sm text-gray-500">{primaryCase.area_label}</p>}
            </div>

            {!primaryCase ? (
                <section className="card mt-5 p-6 text-center">
                    <Route className="mx-auto text-lawn-green-600" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-gray-900">Scan a problem area to build your plan</h2>
                    <p className="mt-2 text-sm text-gray-600">Your coach will focus on one problem and reveal one useful step at a time.</p>
                </section>
            ) : current ? (
                <section className="card mt-5 overflow-hidden" aria-labelledby="current-plan-step">
                    <div className="border-b border-gray-100 bg-lawn-green-50 p-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-lawn-green-700">Current step</p>
                        <h2 id="current-plan-step" className="mt-1 text-xl font-bold text-gray-950">{current.title}</h2>
                        {current.estimated_effort_minutes && <p className="mt-1 text-xs text-gray-500">About {current.estimated_effort_minutes} minutes</p>}
                    </div>
                    <div className="space-y-4 p-5">
                        {current.rationale && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Why this matters</p>
                                <p className="mt-1 text-sm text-gray-700">{current.rationale}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What to do</p>
                            <p className="mt-1 text-sm leading-relaxed text-gray-700">{current.instructions}</p>
                        </div>
                        {current.kind === "check" && current.check_options?.length ? (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What do you see?</p>
                                {current.check_options.map((option) => (
                                    <button key={option.value} type="button" disabled={busy} className="btn-primary flex min-h-12 w-full items-center justify-center" onClick={() => onComplete(current, option.value)}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <button type="button" disabled={busy} className="btn-primary flex min-h-12 w-full items-center justify-center" onClick={() => onComplete(current, "completed")}>
                                <Check size={18} aria-hidden="true" /> I did this
                            </button>
                        )}
                        <button type="button" disabled={busy} className="btn-secondary flex min-h-11 w-full items-center justify-center" onClick={() => onPostpone(current)}>
                            <CalendarClock size={18} aria-hidden="true" /> Remind me later
                        </button>
                    </div>
                </section>
            ) : (
                <section className="card mt-5 p-6 text-center">
                    <Check className="mx-auto text-lawn-green-600" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-gray-900">No step is due right now</h2>
                    <p className="mt-2 text-sm text-gray-600">Your plan is monitoring this area. The next step will appear when it is time.</p>
                </section>
            )}

            {next && (
                <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Up next</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="font-semibold text-gray-800">{next.title}</p>
                        <ChevronRight className="shrink-0 text-gray-400" size={18} aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Unlocks after the current step.</p>
                </section>
            )}
            {laterLocked > 0 && (
                <p className="mt-3 flex items-center gap-2 px-1 text-xs text-gray-500">
                    <LockKeyhole size={14} aria-hidden="true" /> {laterLocked} later {laterLocked === 1 ? "step" : "steps"} locked until needed
                </p>
            )}

            {otherCases.length > 0 && (
                <section className="mt-8" aria-labelledby="saved-problems-title">
                    <h2 id="saved-problems-title" className="text-sm font-bold text-gray-900">Saved lawn problems</h2>
                    <p className="mt-1 text-xs text-gray-500">Only one rescue plan stays active at a time.</p>
                    <div className="mt-3 space-y-2">
                        {otherCases.map((item) => (
                            <div key={item.id} className="card flex items-center justify-between gap-3 p-4">
                                <div>
                                    <p className="font-semibold text-gray-900">{item.title}</p>
                                    <p className="mt-0.5 flex items-center gap-1 text-xs capitalize text-gray-500"><CirclePause size={13} aria-hidden="true" /> {item.status}</p>
                                </div>
                                <button type="button" className="min-h-11 text-sm font-semibold text-lawn-green-700" onClick={() => setSwitchTarget(item)}>Switch to {item.title}</button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {switchTarget && (
                <section role="dialog" aria-modal="true" className="card mt-4 border-amber-200 bg-amber-50 p-5">
                    <h2 className="font-bold text-gray-950">Pause {primaryCase?.title ?? "the current plan"}?</h2>
                    <p className="mt-2 text-sm text-gray-700">Switching will preserve its progress and make {switchTarget.title} your one active plan.</p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button type="button" className="btn-primary min-h-11" disabled={busy} onClick={() => { onSwitch(switchTarget); setSwitchTarget(null); }}>Yes, switch plans</button>
                        <button type="button" className="btn-secondary min-h-11" onClick={() => setSwitchTarget(null)}>Keep current plan</button>
                    </div>
                </section>
            )}

            <section id="seasonal" className="mt-10 border-t border-gray-200 pt-7" aria-labelledby="seasonal-guidance-title">
                <h2 id="seasonal-guidance-title" className="text-lg font-bold text-gray-950">Seasonal guidance</h2>
                <p className="mt-1 text-sm text-gray-500">Reference timing for routine care. Your rescue plan above remains the priority.</p>
                <div className="mt-4">{seasonalContent}</div>
            </section>
        </main>
    );
}

export function PlanPage() {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const casesQuery = useLawnCases(userId);
    const primaryCase = useMemo(() => getPrimaryCase(casesQuery.data ?? []), [casesQuery.data]);
    const stepsQuery = usePlanSteps(userId, primaryCase?.id ?? "");
    const complete = useCompletePlanStep(userId);
    const postpone = usePostponePlanStep(userId);
    const switchPlan = useSwitchPrimaryCase(userId);
    const busy = complete.isPending || postpone.isPending || switchPlan.isPending;
    const otherCases = (casesQuery.data ?? []).filter((item) =>
        item.id !== primaryCase?.id && ["observation", "active", "monitoring", "paused"].includes(item.status),
    );

    useEffect(() => {
        if (window.location.hash === "#seasonal") {
            document.getElementById("seasonal")?.scrollIntoView({ block: "start" });
        }
    }, []);

    return (
        <PlanView
            primaryCase={primaryCase}
            steps={stepsQuery.data ?? []}
            otherCases={otherCases}
            seasonalContent={<SchedulePage embedded />}
            busy={busy}
            onComplete={(step, result) => complete.mutate({ stepId: step.id, result })}
            onPostpone={(step) => {
                const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                postpone.mutate({ stepId: step.id, dueAt });
            }}
            onSwitch={(item) => switchPlan.mutate(item.id)}
        />
    );
}
