// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlanStep } from "@/types/database";
import { TodayView, type TodayScreenState } from "./TodayPage";

afterEach(cleanup);

const action: PlanStep = {
    id: "step-1", case_id: "case-1", user_id: "user-1", step_order: 1,
    stage: "recovery", kind: "action", title: "Check soil moisture",
    rationale: "This separates drought stress from disease.", instructions: "Feel the soil two inches down in three spots.",
    estimated_effort_minutes: 5, delay_days: 0, follow_up_days: 2,
    not_before_at: null, due_at: "2026-11-03T12:00:00.000Z", weather_constraints: { avoid_rain: true },
    check_options: null, status: "ready", result: null, completed_at: null, postponed_at: null,
    created_at: "2026-11-03T12:00:00.000Z", updated_at: "2026-11-03T12:00:00.000Z",
};

function renderState(state: TodayScreenState) {
    const onComplete = vi.fn();
    const onPostpone = vi.fn();
    const view = render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TodayView state={state} onComplete={onComplete} onPostpone={onPostpone} />
        </MemoryRouter>,
    );
    return { ...view, onComplete, onPostpone };
}

describe("TodayView", () => {
    test("shows one active action with progressive instructions and controls", () => {
        const nextStep = { ...action, id: "step-2", step_order: 2, title: "Compare stressed areas", status: "locked" as const };
        const { onComplete, onPostpone } = renderState({
            kind: "active_action", caseTitle: "Heat stress", step: action, nextStep,
            weatherReason: "Dry and calm conditions make this a good time to check.",
        });

        expect(screen.getByText("Check soil moisture")).toBeTruthy();
        expect(screen.getByText(/about 5 min/i)).toBeTruthy();
        expect(screen.getByText(/separates drought stress/i)).toBeTruthy();
        expect(screen.getByText(/dry and calm/i)).toBeTruthy();
        expect(screen.queryByText(/feel the soil two inches/i)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /show me how/i }));
        expect(screen.getByText(/feel the soil two inches/i)).toBeTruthy();
        expect(screen.getByText("Compare stressed areas")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /i did this/i }));
        fireEvent.click(screen.getByRole("button", { name: /remind me later/i }));
        expect(onComplete).toHaveBeenCalledWith(action);
        expect(onPostpone).toHaveBeenCalledWith(action);
        expect(screen.queryByText(/full checklist/i)).toBeNull();
    });

    test("shows postponed or monitoring state with the next follow-up date", () => {
        renderState({ kind: "waiting_or_monitoring", caseTitle: "Heat stress", followUpAt: "2026-11-06T15:00:00.000Z" });
        expect(screen.getByText(/monitoring heat stress/i)).toBeTruthy();
        expect(screen.getByText(/november 6/i)).toBeTruthy();
    });

    test("shows only one seasonal maintenance action", () => {
        renderState({ kind: "maintenance_action", title: "Winterizer application", description: "Strengthen roots before winter.", timing: "This week" });
        expect(screen.getByText("Winterizer application")).toBeTruthy();
        expect(screen.getByText("This week")).toBeTruthy();
        expect(screen.queryByText(/full checklist/i)).toBeNull();
    });

    test("asks for confirmation before a weather or seasonal risk becomes a problem", () => {
        renderState({ kind: "risk_inspection_prompt", title: "Check for heat stress", prompt: "Do you see new browning or folded blades?" });
        expect(screen.getByText(/do you see new browning/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: /yes.*scan this area/i }).getAttribute("href")).toBe("/scan");
    });

    test("renders a calm no-action state", () => {
        renderState({ kind: "nothing_due" });
        expect(screen.getByText("Nothing needs attention right now")).toBeTruthy();
    });
});
