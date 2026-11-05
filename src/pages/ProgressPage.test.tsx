// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { LawnCase, LawnScan, PlanStep } from "@/types/database";
import { ProgressView, legacyProgressScan, type ProgressComparisonView } from "./ProgressPage";

afterEach(cleanup);

function comparison(status: ProgressComparisonView["status"], index: number): ProgressComparisonView {
    return {
        id: `comparison-${index}`,
        caseTitle: "Heat stress",
        status,
        summary: `${status} evidence summary`,
        before: { imageUrl: index === 5 ? null : `signed-before-${index}.jpg`, date: "2026-10-01T12:00:00Z" },
        after: { imageUrl: index === 5 ? null : `signed-after-${index}.jpg`, date: "2026-10-15T12:00:00Z" },
    };
}

const completedStep = {
    id: "step-1", case_id: "case-1", user_id: "user-1", step_order: 1,
    stage: "recovery", kind: "action", title: "Check soil moisture", rationale: null,
    instructions: "Feel two inches down.", estimated_effort_minutes: 5, delay_days: 0,
    follow_up_days: 2, not_before_at: null, due_at: null, weather_constraints: null,
    check_options: null, status: "done", result: "completed", completed_at: "2026-10-02T12:00:00Z",
    postponed_at: null, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-02T12:00:00Z",
} satisfies PlanStep;

const resolvedCase = {
    id: "case-1", user_id: "user-1", status: "resolved", is_primary: false,
    title: "Heat stress", area_label: "Front lawn", likely_cause: "Heat stress", confidence: "high",
    diagnosis: {} as LawnCase["diagnosis"], plan_seed: {} as LawnCase["plan_seed"],
    resolved_at: "2026-10-15T12:00:00Z", created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-15T12:00:00Z",
} satisfies LawnCase;

function renderProgress(overrides: Partial<React.ComponentProps<typeof ProgressView>> = {}) {
    return render(<ProgressView
        comparisons={[]}
        completedSteps={[]}
        legacyScans={[]}
        resolvedCases={[]}
        nextDecision={null}
        activityContent={<p>Manual mow — backyard notes</p>}
        {...overrides}
    />);
}

describe("ProgressView", () => {
    test("shows before and after evidence with dates and every confirmed observable state", () => {
        renderProgress({ comparisons: [
            comparison("improving", 1), comparison("unchanged", 2), comparison("worsening", 3),
            comparison("resolved", 4), comparison("unable_to_determine", 5),
        ] });
        expect(screen.getAllByText("Before")).toHaveLength(5);
        expect(screen.getAllByText("After")).toHaveLength(5);
        expect(screen.getAllByText(/^october 1, 2026$/i)).toHaveLength(5);
        expect(screen.getAllByText(/^october 15, 2026$/i)).toHaveLength(5);
        for (const label of ["Improving", "About the same", "Getting worse", "Resolved", "Needs a clearer photo"]) {
            expect(screen.getByText(label)).toBeTruthy();
        }
        expect(screen.getAllByText(/photo unavailable/i)).toHaveLength(2);
        expect(screen.queryByText(/\/10/)).toBeNull();
    });

    test("shows completed plan steps separately from manual activity rows", () => {
        renderProgress({ completedSteps: [completedStep] });
        expect(screen.getByText("Check soil moisture")).toBeTruthy();
        expect(screen.getByText("Manual mow — backyard notes")).toBeTruthy();
        expect(screen.getAllByText("Check soil moisture")).toHaveLength(1);
    });

    test("shows safe legacy and partial records without crashing", () => {
        const legacy = legacyProgressScan({
            id: "legacy-1", diagnosis: { condition_label: "Thin turf", summary: "Sparse coverage" },
            created_at: "2025-05-01T12:00:00Z", image_url: "legacy.jpg",
        } as LawnScan);
        const partial = legacyProgressScan({ id: "legacy-2", diagnosis: {}, created_at: "2025-05-02T12:00:00Z" } as LawnScan);
        renderProgress({ legacyScans: [legacy, partial] });
        expect(screen.getByText("Thin turf")).toBeTruthy();
        expect(screen.getByText("Previous lawn scan")).toBeTruthy();
        expect(screen.getByText(/does not contain enough detail/i)).toBeTruthy();
    });

    test("shows the resolved archive and the current next monitoring decision", () => {
        renderProgress({ resolvedCases: [resolvedCase], nextDecision: "Take another photo if browning returns." });
        expect(screen.getByRole("heading", { name: /resolved plans/i })).toBeTruthy();
        expect(screen.getByText("Heat stress")).toBeTruthy();
        expect(screen.getByText(/take another photo if browning returns/i)).toBeTruthy();
    });

    test("treats no treatment needed as a successful calm state", () => {
        renderProgress();
        expect(screen.getByText("Nothing needs attention right now")).toBeTruthy();
    });
});
