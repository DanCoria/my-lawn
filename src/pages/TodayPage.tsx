import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, Check, ChevronDown, ChevronUp, Clock3, CloudSun, Eye, Leaf, Search } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useGrassType, useLawnProfile } from "@/contexts/LawnProfileContext";
import {
    useCompletePlanStep,
    usePlanSteps,
    usePostponePlanStep,
    usePrimaryCase,
} from "@/features/plans/api";
import { getCurrentStep, getNextPreview } from "@/features/plans/state";
import { supabase } from "@/lib/supabase";
import {
    getNextStep,
    getScheduleTaskCompletionInfo,
    getScheduleTasks,
} from "@/lib/lawnLogic";
import { fetchWeather, type WeatherData } from "@/lib/weather";
import type { Activity, LawnCase, PlanStep } from "@/types/database";

export type TodayScreenState =
    | { kind: "active_action"; caseTitle: string; step: PlanStep; nextStep: PlanStep | null; weatherReason: string }
    | { kind: "waiting_or_monitoring"; caseTitle: string; followUpAt: string | null }
    | { kind: "maintenance_action"; title: string; description: string; timing: string }
    | { kind: "risk_inspection_prompt"; title: string; prompt: string }
    | { kind: "nothing_due" };

interface TodayViewProps {
    state: TodayScreenState;
    onComplete: (step: PlanStep) => void;
    onPostpone: (step: PlanStep) => void;
    busy?: boolean;
}

function localDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
    });
}

export function TodayView({ state, onComplete, onPostpone, busy = false }: TodayViewProps) {
    const [showInstructions, setShowInstructions] = useState(false);

    if (state.kind === "active_action") {
        return (
            <main className="mx-auto max-w-2xl px-5 py-6">
                <div className="mb-5">
                    <p className="text-sm font-semibold text-lawn-green-700">Today’s focus</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950">{state.caseTitle}</h1>
                </div>
                <section className="card overflow-hidden" aria-labelledby="today-action-title">
                    <div className="border-b border-gray-100 bg-lawn-green-50 p-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-lawn-green-700">
                            <Clock3 size={15} aria-hidden="true" />
                            {state.step.estimated_effort_minutes
                                ? `About ${state.step.estimated_effort_minutes} min`
                                : "A quick lawn check"}
                        </div>
                        <h2 id="today-action-title" className="mt-2 text-xl font-bold text-gray-950">{state.step.title}</h2>
                    </div>
                    <div className="space-y-4 p-5">
                        {state.step.rationale && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Why this matters</p>
                                <p className="mt-1 text-sm leading-relaxed text-gray-700">{state.step.rationale}</p>
                            </div>
                        )}
                        <div className="flex items-start gap-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
                            <CloudSun className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                            <p>{state.weatherReason}</p>
                        </div>
                        <button
                            type="button"
                            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-200 px-4 text-left text-sm font-semibold text-gray-800"
                            onClick={() => setShowInstructions((shown) => !shown)}
                        >
                            Show me how
                            {showInstructions ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                        </button>
                        {showInstructions && (
                            <div className="rounded-xl border border-lawn-green-100 bg-white p-4 text-sm leading-relaxed text-gray-700">
                                {state.step.instructions}
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button type="button" className="btn-primary min-h-12" disabled={busy} onClick={() => onComplete(state.step)}>
                                <Check size={18} aria-hidden="true" /> I did this
                            </button>
                            <button type="button" className="btn-secondary min-h-12" disabled={busy} onClick={() => onPostpone(state.step)}>
                                <CalendarClock size={18} aria-hidden="true" /> Remind me later
                            </button>
                        </div>
                    </div>
                </section>
                {state.nextStep && (
                    <p className="mt-4 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">Up next:</span> {state.nextStep.title}
                    </p>
                )}
            </main>
        );
    }

    if (state.kind === "waiting_or_monitoring") {
        return (
            <main className="mx-auto max-w-2xl px-5 py-10">
                <section className="card p-6 text-center">
                    <Eye className="mx-auto text-lawn-green-600" size={30} aria-hidden="true" />
                    <h1 className="mt-3 text-xl font-bold text-gray-950">Monitoring {state.caseTitle}</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        {state.followUpAt
                            ? `Your next check is ${localDate(state.followUpAt)}. No action is needed before then.`
                            : "No action is due. Keep an eye on the area and return if it changes."}
                    </p>
                    <Link to="/plan" className="mt-5 inline-flex min-h-11 items-center font-semibold text-lawn-green-700">View plan</Link>
                </section>
            </main>
        );
    }

    if (state.kind === "maintenance_action") {
        return (
            <main className="mx-auto max-w-2xl px-5 py-8">
                <p className="text-sm font-semibold text-lawn-green-700">Seasonal maintenance</p>
                <section className="card mt-3 p-5">
                    <div className="flex items-start gap-3">
                        <Leaf className="mt-0.5 shrink-0 text-lawn-green-600" size={22} aria-hidden="true" />
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{state.timing}</p>
                            <h1 className="mt-1 text-xl font-bold text-gray-950">{state.title}</h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-600">{state.description}</p>
                        </div>
                    </div>
                    <Link to="/plan" className="btn-primary mt-5 flex min-h-12 items-center justify-center">View seasonal plan</Link>
                </section>
            </main>
        );
    }

    if (state.kind === "risk_inspection_prompt") {
        return (
            <main className="mx-auto max-w-2xl px-5 py-8">
                <section className="card p-6">
                    <Search className="text-amber-600" size={26} aria-hidden="true" />
                    <h1 className="mt-3 text-xl font-bold text-gray-950">{state.title}</h1>
                    <p className="mt-2 text-sm text-gray-600">{state.prompt}</p>
                    <p className="mt-3 text-xs text-gray-500">This is only an inspection prompt. It will not create a lawn problem unless you confirm it.</p>
                    <Link to="/scan" className="btn-primary mt-5 flex min-h-12 items-center justify-center">Yes — scan this area</Link>
                </section>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-5 py-10">
            <section className="card p-7 text-center">
                <Check className="mx-auto text-lawn-green-600" size={30} aria-hidden="true" />
                <h1 className="mt-3 text-xl font-bold text-gray-950">Nothing needs attention right now</h1>
                <p className="mt-2 text-sm text-gray-600">Your lawn coach will surface one useful action when the timing is right.</p>
            </section>
        </main>
    );
}

function followUpDate(steps: readonly PlanStep[]): string | null {
    return steps
        .flatMap((step) => [step.not_before_at, step.due_at])
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null;
}

function weatherReason(step: PlanStep, weather: WeatherData | undefined): string {
    if (!weather) return "Weather details are unavailable, so check local conditions before starting.";
    const rules = step.weather_constraints;
    if (rules?.avoid_rain === true && weather.isRaining) return "Rain is falling now. Wait until the grass and soil settle before doing this step.";
    if (typeof rules?.max_wind_mph === "number" && weather.currentWindSpeed > rules.max_wind_mph) return "Wind is above this step’s safe range. Wait for calmer conditions.";
    if (typeof rules?.min_temperature_f === "number" && weather.currentTemp < rules.min_temperature_f) return "It is colder than this step calls for. Wait for a warmer window.";
    if (typeof rules?.max_temperature_f === "number" && weather.currentTemp > rules.max_temperature_f) return "It is hotter than this step calls for. Wait for a cooler window.";
    return `${weather.conditions} conditions look suitable for this step.`;
}

function derivePlanState(primaryCase: LawnCase, steps: readonly PlanStep[], weather: WeatherData | undefined, now: Date): TodayScreenState {
    const current = getCurrentStep(steps, now);
    if (current) {
        return {
            kind: "active_action",
            caseTitle: primaryCase.title,
            step: current,
            nextStep: getNextPreview(steps, current),
            weatherReason: weatherReason(current, weather),
        };
    }
    return {
        kind: "waiting_or_monitoring",
        caseTitle: primaryCase.title,
        followUpAt: followUpDate(steps),
    };
}

export function TodayPage() {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const grassType = useGrassType();
    const { profile, loading: profileLoading } = useLawnProfile();
    const primaryQuery = usePrimaryCase(userId);
    const primaryCase = primaryQuery.data ?? null;
    const stepsQuery = usePlanSteps(userId, primaryCase?.id ?? "");
    const complete = useCompletePlanStep(userId);
    const postpone = usePostponePlanStep(userId);
    const now = new Date();

    const weatherQuery = useQuery({
        queryKey: ["weather", profile?.latitude, profile?.longitude],
        queryFn: () => fetchWeather(profile?.latitude, profile?.longitude),
        enabled: !profileLoading,
        staleTime: 30 * 60 * 1_000,
    });
    const completionQuery = useQuery({
        queryKey: ["task-completions", userId, grassType],
        queryFn: async () => {
            const { data, error } = await supabase.from("task_completions").select("task_key").eq("user_id", userId).eq("grass_type", grassType);
            if (error) throw error;
            return (data ?? []).map((row) => row.task_key as string);
        },
        enabled: Boolean(userId),
    });
    const activitiesQuery = useQuery({
        queryKey: ["activities", userId],
        queryFn: async () => {
            const { data, error } = await supabase.from("activities").select("*").eq("user_id", userId).order("date", { ascending: false });
            if (error) throw error;
            return (data ?? []) as Activity[];
        },
        enabled: Boolean(userId),
    });

    if (primaryQuery.isLoading || (primaryCase && stepsQuery.isLoading)) {
        return <main className="mx-auto max-w-2xl px-5 py-10 text-center text-sm text-gray-600">Finding today’s best next step…</main>;
    }

    let state: TodayScreenState;
    if (primaryCase) {
        state = derivePlanState(primaryCase, stepsQuery.data ?? [], weatherQuery.data, now);
    } else {
        const tasks = getScheduleTasks(grassType, now.getFullYear());
        const completionInfo = getScheduleTaskCompletionInfo(tasks, completionQuery.data ?? [], activitiesQuery.data ?? []);
        const maintenance = getNextStep(now, grassType, Object.keys(completionInfo));
        if (maintenance.task && maintenance.isUrgent) {
            state = {
                kind: "maintenance_action",
                title: maintenance.task.label,
                description: maintenance.task.description,
                timing: maintenance.daysUntil > 0 ? `In ${maintenance.daysUntil} days` : "This week",
            };
        } else if (weatherQuery.data && weatherQuery.data.currentTemp >= 95) {
            state = {
                kind: "risk_inspection_prompt",
                title: "Check for heat stress",
                prompt: "Do you see new browning or folded blades in areas exposed to afternoon sun?",
            };
        } else {
            state = { kind: "nothing_due" };
        }
    }

    return (
        <TodayView
            state={state}
            busy={complete.isPending || postpone.isPending}
            onComplete={(step) => complete.mutate({ stepId: step.id, result: step.kind === "check" ? "confirmed" : "done" })}
            onPostpone={(step) => postpone.mutate({ stepId: step.id, dueAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() })}
        />
    );
}
