import { describe, expect, test } from "vitest";

import { toDisplayDiagnosis } from "./legacyAdapter";

const v2 = {
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

describe("toDisplayDiagnosis", () => {
    test("adapts_a_complete_v2_diagnosis", () => {
        expect(toDisplayDiagnosis(v2)).toMatchObject({
            likelyCause: "Heat stress",
            confidence: "medium",
            evidence: [{ observation: "Folded blades", significance: "Conserves moisture" }],
            alternatives: [{ cause: "Fungal pressure" }],
            safeNextStep: "Check soil moisture two inches down.",
            isLegacy: false,
            imageUsable: true,
            canStartPlan: true,
        });
    });

    test.each([
        [7],
        [null],
    ])("adapts_current_score_json_without_rendering_the_score", (conditionScore) => {
        const display = toDisplayDiagnosis({
            condition_score: conditionScore,
            condition_label: "Stressed",
            summary: "Older scan summary.",
            observations: ["Thin coverage"],
            issues: [],
            recommendations: [],
        });
        expect(display).toMatchObject({
            likelyCause: "Stressed",
            summary: "Older scan summary.",
            isLegacy: true,
            canStartPlan: false,
        });
        expect(JSON.stringify(display)).not.toContain(String(conditionScore));
    });

    test("tolerates_missing_legacy_arrays", () => {
        expect(() => toDisplayDiagnosis({
            condition_label: "Patchy",
            summary: "Some areas are thin.",
        })).not.toThrow();
        expect(toDisplayDiagnosis({ condition_label: "Patchy" }).evidence).toEqual([]);
    });

    test("unknown_json_returns_a_neutral_fallback", () => {
        expect(toDisplayDiagnosis({ surprise: true })).toEqual(expect.objectContaining({
            likelyCause: "Previous lawn scan",
            summary: "This older scan does not contain enough detail to show a current diagnosis.",
            isLegacy: true,
            imageUsable: true,
            canStartPlan: false,
        }));
        expect(() => toDisplayDiagnosis(null)).not.toThrow();
    });

    test("legacy_product_suggestions_never_become_guidance_or_plan_ctas", () => {
        const display = toDisplayDiagnosis({
            condition_label: "Weeds",
            summary: "Broadleaf weeds are visible.",
            recommendations: [{
                action: "Apply Brand X Weed Killer",
                urgency: "high",
                product_suggestion: "Brand X Max",
            }],
        });
        expect(JSON.stringify(display)).not.toMatch(/Brand X|Weed Killer/i);
        expect(display.canStartPlan).toBe(false);
    });

    test("score_and_commercial_language_inside_legacy_free_text_is_neutralized", () => {
        const display = toDisplayDiagnosis({
            condition_label: "Brand X result",
            summary: "Lawn health: 7/10. Buy Brand X today.",
            observations: ["Coverage is 6/10", "Apply Brand X Max", "Thin coverage"],
        });
        expect(display.likelyCause).toBe("Previous lawn scan");
        expect(display.summary).toBe("This older scan does not contain enough detail to show a current diagnosis.");
        expect(display.evidence).toEqual([expect.objectContaining({ observation: "Thin coverage" })]);
        expect(JSON.stringify(display)).not.toMatch(/\/10|Brand X|Buy/i);
    });
});
