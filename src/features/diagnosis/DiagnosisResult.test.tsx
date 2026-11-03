// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DiagnosisResult } from "./DiagnosisResult";

const diagnosis = {
    schema_version: 2,
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The visible folding suggests heat stress.",
    evidence: [{ observation: "Folded blades", significance: "Conserves moisture" }],
    alternatives: [{ cause: "Fungal pressure", reason: "Color can overlap", verification: "Check for lesions" }],
    safe_next_step: "Check soil moisture two inches down.",
    safety_notes: ["Verify the cause before treatment."],
    plan_seed: {
        summary: "Confirm moisture and reassess.",
        steps: [{
            order: 1,
            kind: "check",
            title: "Check soil moisture",
            instructions: "Inspect soil two inches down.",
            due_in_days: 0,
            check_options: [{ value: "dry", label: "Dry" }],
        }],
    },
};

afterEach(cleanup);

describe("DiagnosisResult", () => {
    test("guest_mode_shows_only_the_limited_preview", () => {
        render(<DiagnosisResult diagnosis={diagnosis} mode="guest" />);
        expect(screen.getByText("Heat stress")).toBeTruthy();
        expect(screen.getByText(/Medium confidence/i)).toBeTruthy();
        expect(screen.getByText("The visible folding suggests heat stress.")).toBeTruthy();
        expect(screen.getByText("Check soil moisture two inches down.")).toBeTruthy();
        expect(screen.queryByText("Folded blades")).toBeNull();
        expect(screen.queryByText("Fungal pressure")).toBeNull();
        expect(screen.queryByRole("button", { name: /start this plan/i })).toBeNull();
    });

    test("personalized_mode_adds_evidence_alternatives_safety_and_plan_cta", () => {
        const onStartPlan = vi.fn();
        render(<DiagnosisResult diagnosis={diagnosis} mode="personalized" onStartPlan={onStartPlan} />);
        expect(screen.getByText("Folded blades")).toBeTruthy();
        expect(screen.getByText("Fungal pressure")).toBeTruthy();
        expect(screen.getByText("Verify the cause before treatment.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /start this plan/i }));
        expect(onStartPlan).toHaveBeenCalledTimes(1);
    });

    test("personalized_mode_does_not_render_a_no_op_plan_cta", () => {
        render(<DiagnosisResult diagnosis={diagnosis} mode="personalized" />);
        expect(screen.queryByRole("button", { name: /start this plan/i })).toBeNull();
    });

    test("multiple_history_results_use_unique_accessible_heading_ids", () => {
        const { container } = render(<>
            <DiagnosisResult diagnosis={diagnosis} mode="history" />
            <DiagnosisResult diagnosis={diagnosis} mode="history" />
        </>);
        const ids = Array.from(container.querySelectorAll("[id]")).map((node) => node.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test.each(["guest", "personalized", "history"] as const)(
        "%s_mode_never_renders_scores_or_branded_purchase_ctas",
        (mode) => {
            const { container } = render(<DiagnosisResult diagnosis={{
                condition_score: 9,
                condition_label: "Healthy",
                summary: "Legacy result",
                recommendations: [{
                    action: "Buy Brand X now",
                    product_suggestion: "Brand X",
                    urgency: "high",
                }],
            }} mode={mode} />);
            expect(container.textContent).not.toMatch(/\/10|Brand X|Buy now/i);
        },
    );
});
