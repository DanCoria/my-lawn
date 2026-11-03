import type { LawnCase, PlanStep } from "@/types/database";
import type { PlanReminder, PlanWeather } from "./types";

function timeReached(value: string | null, now: Date): boolean {
    return value === null || new Date(value).getTime() <= now.getTime();
}

export function getPrimaryCase(cases: readonly LawnCase[]): LawnCase | null {
    return cases.find((item) =>
        item.is_primary && (item.status === "active" || item.status === "monitoring"),
    ) ?? null;
}

export function getCurrentStep(
    steps: readonly PlanStep[],
    now: Date,
): PlanStep | null {
    return [...steps]
        .sort((left, right) => left.step_order - right.step_order)
        .find((step) => {
            if (step.status === "ready") return timeReached(step.not_before_at, now);
            return step.status === "postponed" && timeReached(step.due_at, now);
        }) ?? null;
}

export function getNextPreview(
    steps: readonly PlanStep[],
    current: PlanStep,
): PlanStep | null {
    return [...steps]
        .sort((left, right) => left.step_order - right.step_order)
        .find((step) =>
            step.step_order > current.step_order
            && step.status !== "done"
            && step.status !== "skipped",
        ) ?? null;
}

function weatherIsSuitable(step: PlanStep, weather: PlanWeather): boolean {
    const rules = step.weather_constraints;
    if (!rules) return true;
    if (rules.avoid_rain === true && weather.isRaining) return false;
    if (typeof rules.max_wind_mph === "number" && weather.windMph > rules.max_wind_mph) return false;
    if (
        typeof rules.min_temperature_f === "number"
        && (weather.temperatureF === undefined || weather.temperatureF < rules.min_temperature_f)
    ) return false;
    if (
        typeof rules.max_temperature_f === "number"
        && (weather.temperatureF === undefined || weather.temperatureF > rules.max_temperature_f)
    ) return false;
    return true;
}

export function deriveInAppReminder(
    step: PlanStep,
    weather: PlanWeather,
    now: Date,
): PlanReminder | null {
    const due = step.status === "ready"
        ? timeReached(step.not_before_at, now) && timeReached(step.due_at, now)
        : step.status === "postponed" && timeReached(step.due_at, now);
    if (!due || !weatherIsSuitable(step, weather)) return null;
    return {
        stepId: step.id,
        kind: step.kind === "check" ? "check_due" : "action_due",
        title: step.title,
        reason: step.kind === "check" ? "A lawn check is due." : "Your next lawn action is due.",
    };
}

export function applyCheckOutcome(
    steps: readonly PlanStep[],
    stepId: string,
    outcome: string,
): PlanStep[] {
    const current = steps.find((step) => step.id === stepId);
    if (!current || current.kind !== "check" || current.status !== "ready") {
        throw new Error("Check step is not ready");
    }
    const option = current.check_options?.find((item) => item.value === outcome);
    if (!option) throw new Error("Invalid check outcome");
    const nextOrder = option.next_order;
    if (nextOrder === current.step_order) {
        return steps.map((step) => step.id === stepId ? { ...step, result: outcome } : step);
    }

    return steps.map((step) => {
        if (step.id === stepId) {
            return { ...step, status: "done", result: outcome };
        }
        if (
            nextOrder !== undefined
            && step.step_order > current.step_order
            && step.step_order < nextOrder
            && step.status === "locked"
        ) {
            return { ...step, status: "skipped" };
        }
        if (nextOrder !== undefined && step.step_order === nextOrder && step.status === "locked") {
            return { ...step, status: "ready" };
        }
        return step;
    });
}
