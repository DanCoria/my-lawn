import { describe, expect, test } from "vitest";

import {
    isAiUsageSummary,
    isDiagnosisV2,
    isFollowUpComparison,
    isGuestDiagnosisPreview,
    isUsableDiagnosis,
} from "./diagnosis-contract";

const validGuestPreview = {
    schema_version: "guest-preview-1",
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The blades look curled and dry rather than diseased.",
    safe_next_step: "Check the soil moisture two inches below the surface.",
} as const;

const validDiagnosisV2 = {
    schema_version: 2,
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The visible curling and even discoloration fit heat stress.",
    evidence: [
        {
            observation: "Leaf blades are folded lengthwise.",
            significance: "Folding is a common moisture-conservation response.",
        },
    ],
    alternatives: [
        {
            cause: "Early fungal pressure",
            reason: "Some discoloration can look similar in one photo.",
            verification: "Look for distinct spots or lesions on individual blades.",
        },
    ],
    safe_next_step: "Check soil moisture before adding water or treatment.",
    safety_notes: ["Avoid applying a treatment until the cause is better supported."],
    treatment_category: "Irrigation adjustment",
    plan_seed: {
        summary: "Confirm moisture, correct watering, then reassess.",
        steps: [
            {
                order: 1,
                kind: "check",
                title: "Check soil moisture",
                instructions: "Inspect soil moisture two inches below the surface.",
                due_in_days: 0,
                check_options: [
                    { value: "dry", label: "Dry", next_order: 2 },
                    { value: "moist", label: "Moist", next_order: 3 },
                    { value: "not_sure", label: "Not sure" },
                ],
            },
        ],
    },
} as const;

describe("diagnosis contract", () => {
    test("accepts a bounded follow-up comparison and rejects unsupported status", () => {
        const comparison = {
            schema_version: "follow-up-1",
            image_quality: { usable: true },
            status: "improving",
            summary: "Coverage is denser in the affected area.",
            evidence: ["More green blades", "Less exposed soil"],
        };
        expect(isFollowUpComparison(comparison)).toBe(true);
        expect(isFollowUpComparison({ ...comparison, status: "perfect" })).toBe(false);
    });

    test("accepts_guest_preview_contract", () => {
        expect(isGuestDiagnosisPreview(validGuestPreview)).toBe(true);
        expect(isUsableDiagnosis(validGuestPreview)).toBe(true);
    });

    test("rejects_guest_preview_with_plan_seed", () => {
        expect(
            isGuestDiagnosisPreview({
                ...validGuestPreview,
                plan_seed: validDiagnosisV2.plan_seed,
            }),
        ).toBe(false);
    });

    test("accepts_complete_v2_diagnosis", () => {
        expect(isDiagnosisV2(validDiagnosisV2)).toBe(true);
        expect(isUsableDiagnosis(validDiagnosisV2)).toBe(true);
    });

    test("rejects_numeric_score_or_product_brand_shape", () => {
        expect(
            isDiagnosisV2({ ...validDiagnosisV2, condition_score: 8 }),
        ).toBe(false);
        expect(
            isDiagnosisV2({
                ...validDiagnosisV2,
                product_suggestions: [{ name: "Brand X Lawn Cure" }],
            }),
        ).toBe(false);
    });

    test("rejects_missing_image_quality", () => {
        const withoutImageQuality: Record<string, unknown> = {
            ...validDiagnosisV2,
        };
        delete withoutImageQuality.image_quality;

        expect(isDiagnosisV2(withoutImageQuality)).toBe(false);
        expect(isUsableDiagnosis(withoutImageQuality)).toBe(false);
    });

    test("rejects_negative_usage_tokens", () => {
        expect(
            isAiUsageSummary({
                model: "gemini-flash",
                input_tokens: 250,
                output_tokens: 80,
                thought_tokens: 0,
                total_tokens: 330,
                metadata_complete: true,
            }),
        ).toBe(true);
        expect(
            isAiUsageSummary({
                model: "gemini-flash",
                input_tokens: 250,
                output_tokens: -1,
                thought_tokens: 0,
                total_tokens: 249,
                metadata_complete: true,
            }),
        ).toBe(false);
    });
});
