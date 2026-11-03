import { describe, expect, test } from "vitest";
import type { LawnCase, PlanStep } from "@/types/database";
import {
    applyCheckOutcome,
    deriveInAppReminder,
    getCurrentStep,
    getNextPreview,
    getPrimaryCase,
} from "./state";

const now = new Date("2026-11-03T15:00:00.000Z");

function makeCase(overrides: Partial<LawnCase> = {}): LawnCase {
    return {
        id: "case-1", user_id: "user-1", status: "active", is_primary: true,
        title: "Brown patch", area_label: null, likely_cause: "Drought stress",
        confidence: "medium", diagnosis: {} as LawnCase["diagnosis"],
        plan_seed: {} as LawnCase["plan_seed"], resolved_at: null,
        created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z",
        ...overrides,
    };
}

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
    return {
        id: "step-1", case_id: "case-1", user_id: "user-1", step_order: 1,
        stage: "recovery", kind: "action", title: "Check the soil", rationale: null,
        instructions: "Feel two inches down.", estimated_effort_minutes: 5,
        delay_days: 0, follow_up_days: null, not_before_at: null,
        due_at: "2026-11-03T14:00:00.000Z", weather_constraints: null,
        check_options: null, status: "ready", result: null, completed_at: null,
        postponed_at: null, created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z", ...overrides,
    };
}

describe("plan state selection", () => {
    test("selects exactly one primary active or monitoring case", () => {
        const cases = [makeCase({ id: "observation", status: "observation", is_primary: false }), makeCase(), makeCase({ id: "paused", status: "paused", is_primary: false })];
        expect(getPrimaryCase(cases)?.id).toBe("case-1");
        expect(getPrimaryCase([makeCase({ status: "paused" })])).toBeNull();
        expect(getPrimaryCase([makeCase({ status: "resolved" })])).toBeNull();
        expect(getPrimaryCase([])).toBeNull();
    });

    test("returns the first due ready action and keeps future steps locked", () => {
        const steps = [makeStep({ id: "future", step_order: 2, status: "locked", due_at: null }), makeStep()];
        expect(getCurrentStep(steps, now)?.id).toBe("step-1");
        expect(getNextPreview(steps, steps[1])?.id).toBe("future");
    });

    test("returns a postponed step only when its due time arrives", () => {
        const postponed = makeStep({ status: "postponed", due_at: "2026-11-04T15:00:00.000Z" });
        expect(getCurrentStep([postponed], now)).toBeNull();
        expect(getCurrentStep([postponed], new Date("2026-11-04T15:00:00.000Z"))?.id).toBe("step-1");
    });

    test("moves to the next ready action after completion", () => {
        const completed = makeStep({ status: "done", completed_at: "2026-11-03T14:30:00.000Z" });
        const next = makeStep({ id: "step-2", step_order: 2, status: "ready" });
        expect(getCurrentStep([completed, next], now)?.id).toBe("step-2");
    });
});

describe("plan check branching", () => {
    const check = makeStep({
        id: "check", step_order: 2, kind: "check", title: "Is the soil dry?",
        check_options: [
            { value: "dry", label: "Dry", next_order: 3 },
            { value: "moist", label: "Moist", next_order: 4 },
            { value: "not_sure", label: "Not sure", next_order: 2 },
        ],
    });
    const dry = makeStep({ id: "dry", step_order: 3, status: "locked" });
    const moist = makeStep({ id: "moist", step_order: 4, status: "locked" });

    test("dry unlocks the dry branch", () => {
        const result = applyCheckOutcome([check, dry, moist], "check", "dry");
        expect(result.find((step) => step.id === "check")?.status).toBe("done");
        expect(result.find((step) => step.id === "dry")?.status).toBe("ready");
    });

    test("moist skips the dry action and unlocks monitoring", () => {
        const result = applyCheckOutcome([check, dry, moist], "check", "moist");
        expect(result.find((step) => step.id === "dry")?.status).toBe("skipped");
        expect(result.find((step) => step.id === "moist")?.status).toBe("ready");
    });

    test("not sure keeps the check ready", () => {
        const result = applyCheckOutcome([check, dry, moist], "check", "not_sure");
        expect(result.find((step) => step.id === "check")?.status).toBe("ready");
        expect(result.find((step) => step.id === "check")?.result).toBe("not_sure");
    });

    test("rejects an outcome not offered by the check", () => {
        expect(() => applyCheckOutcome([check, dry, moist], "check", "soaked")).toThrow("Invalid check outcome");
    });
});

describe("in-app reminders", () => {
    test("suppresses a weather-sensitive action until conditions are suitable", () => {
        const step = makeStep({ weather_constraints: { avoid_rain: true, max_wind_mph: 15 } });
        expect(deriveInAppReminder(step, { isRaining: true, windMph: 5 }, now)).toBeNull();
        expect(deriveInAppReminder(step, { isRaining: false, windMph: 8 }, now)).toEqual(expect.objectContaining({ stepId: "step-1", kind: "action_due" }));
    });

    test("does not remind before not-before timing", () => {
        const step = makeStep({ not_before_at: "2026-11-04T15:00:00.000Z" });
        expect(deriveInAppReminder(step, { isRaining: false, windMph: 2 }, now)).toBeNull();
    });
});
