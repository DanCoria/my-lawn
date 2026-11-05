// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { LawnCase, PlanStep } from "@/types/database";
import { PlanView } from "./PlanPage";

afterEach(cleanup);

const activeCase = {
    id: "case-1", user_id: "user-1", status: "active", is_primary: true,
    title: "Heat stress", area_label: "Front lawn", likely_cause: "Heat stress",
    confidence: "high", diagnosis: {} as LawnCase["diagnosis"], plan_seed: {} as LawnCase["plan_seed"],
    resolved_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
} satisfies LawnCase;

function step(overrides: Partial<PlanStep>): PlanStep {
    return {
        id: "step-1", case_id: "case-1", user_id: "user-1", step_order: 1,
        stage: "recovery", kind: "action", title: "Check soil moisture",
        rationale: "This separates dry soil from disease.", instructions: "Check three places two inches deep.",
        estimated_effort_minutes: 5, delay_days: 0, follow_up_days: 2,
        not_before_at: null, due_at: null, weather_constraints: null, check_options: null,
        status: "ready", result: null, completed_at: null, postponed_at: null,
        created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
        ...overrides,
    };
}

function renderPlan(overrides: Partial<React.ComponentProps<typeof PlanView>> = {}) {
    const props: React.ComponentProps<typeof PlanView> = {
        primaryCase: activeCase,
        steps: [
            step({}),
            step({ id: "step-2", step_order: 2, title: "Look for new growth", status: "locked" }),
            step({ id: "step-3", step_order: 3, title: "Take a comparison photo", status: "locked" }),
        ],
        otherCases: [], seasonalContent: <p>Seasonal calendar</p>,
        onComplete: vi.fn(), onPostpone: vi.fn(), onSwitch: vi.fn(),
        ...overrides,
    };
    render(<PlanView {...props} />);
    return props;
}

describe("PlanView", () => {
    test("shows the current step fully, the next preview, and keeps later steps locked", () => {
        renderPlan();
        expect(screen.getByText("Check soil moisture")).toBeTruthy();
        expect(screen.getByText(/check three places/i)).toBeTruthy();
        expect(screen.getByText("Look for new growth")).toBeTruthy();
        expect(screen.getByText(/1 later step locked/i)).toBeTruthy();
        expect(screen.queryByText("Take a comparison photo")).toBeNull();
        expect(screen.queryByText(/full checklist/i)).toBeNull();
    });

    test("completes, postpones, and offers check outcomes", () => {
        const check = step({
            kind: "check", title: "Has the area improved?",
            check_options: [
                { value: "better", label: "Yes, it looks better", next_order: 3 },
                { value: "same", label: "No change", next_order: 2 },
            ],
        });
        const props = renderPlan({ steps: [check] });
        fireEvent.click(screen.getByRole("button", { name: "Yes, it looks better" }));
        expect(props.onComplete).toHaveBeenCalledWith(check, "better");
        fireEvent.click(screen.getByRole("button", { name: /remind me later/i }));
        expect(props.onPostpone).toHaveBeenCalledWith(check);
    });

    test("preserves paused plans and requires explicit confirmation before switching", () => {
        const paused = { ...activeCase, id: "case-2", title: "Thin patch", status: "paused", is_primary: false } as LawnCase;
        const props = renderPlan({ otherCases: [paused] });
        fireEvent.click(screen.getByRole("button", { name: /switch to thin patch/i }));
        expect(props.onSwitch).not.toHaveBeenCalled();
        expect(screen.getByText(/pause heat stress/i)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /yes, switch plans/i }));
        expect(props.onSwitch).toHaveBeenCalledWith(paused);
    });

    test("keeps seasonal guidance in a secondary section", () => {
        renderPlan();
        expect(screen.getByRole("heading", { name: /seasonal guidance/i })).toBeTruthy();
        expect(screen.getByText("Seasonal calendar")).toBeTruthy();
    });
});
