import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DiagnosisV2, FollowUpComparison } from "@shared/diagnosis-contract";

const auth = vi.hoisted(() => ({
    getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
    supabase: { auth },
}));

import {
    diagnoseLawn,
    DiagnosisApiError,
    getRetakeGuidance,
    type BrowserDiagnosisRequest,
} from "./gemini";

const request: BrowserDiagnosisRequest = {
    mode: "personalized",
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    imageBase64: "encoded-image",
    mimeType: "image/jpeg",
    context: {
        symptom: "thin",
        grass_type: "bermuda",
        date: "2026-11-02",
    },
};

const diagnosis: DiagnosisV2 = {
    schema_version: 2,
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The visible folding suggests heat stress.",
    evidence: [{ observation: "Folded blades", significance: "A moisture-conservation response" }],
    alternatives: [{ cause: "Fungal pressure", reason: "Discoloration can overlap", verification: "Check blades for lesions" }],
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

const comparison: FollowUpComparison = {
    schema_version: "follow-up-1", image_quality: { usable: true }, status: "improving",
    summary: "Coverage is denser.", evidence: ["Less exposed soil"],
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("browser diagnosis API", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
        vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
        auth.getSession.mockResolvedValue({
            data: { session: { access_token: "user-jwt" } },
        });
    });

    test("sends_exact_typed_payload_and_authenticated_headers", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({
            diagnosis,
            allowance: { source: "welcome" },
            usage_event_id: "event-1",
        }));

        await expect(diagnoseLawn(request)).resolves.toMatchObject({ diagnosis });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://project.supabase.co/functions/v1/diagnose-lawn");
        expect(init).toMatchObject({
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer user-jwt",
                apikey: "publishable-key",
            },
        });
        expect(JSON.parse(String(init?.body))).toEqual({
            mode: "personalized",
            request_id: request.requestId,
            image: "encoded-image",
            mime_type: "image/jpeg",
            context: request.context,
        });
    });

    test("retains_the_callers_request_id_across_safe_manual_retries", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({
            diagnosis,
            allowance: { source: "welcome" },
            usage_event_id: "event-1",
        }));

        await diagnoseLawn(request);
        await diagnoseLawn(request);

        expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).request_id))
            .toEqual([request.requestId, request.requestId]);
    });

    test("sends_only_the_bounded_original_and_follow_up_images_for_comparison", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
            diagnosis: comparison, allowance: { source: "monthly" }, usage_event_id: "event-2",
        }));
        await diagnoseLawn({
            ...request,
            mode: "follow_up",
            referenceImageBase64: "original-image",
            referenceMimeType: "image/jpeg",
            context: { original_diagnosis_summary: "Heat stress", elapsed_days: 14 },
        });
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body).toMatchObject({
            mode: "follow_up", image: "encoded-image", reference_image: "original-image",
            reference_mime_type: "image/jpeg",
        });
        expect(Object.keys(body.context)).toEqual(["original_diagnosis_summary", "elapsed_days"]);
    });

    test.each([
        [429, "personal_allowance_exhausted", false, "You’ve used your available lawn scans."],
        [503, "temporarily_unavailable", true, "Lawn analysis is temporarily unavailable."],
    ])("maps_server_errors_to_safe_copy", async (status, code, retryable, copy) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: code }, status));

        const error = await diagnoseLawn(request).catch((caught) => caught);
        expect(error).toBeInstanceOf(DiagnosisApiError);
        expect(error).toMatchObject({ code, status, retryable });
        expect(error.message).toContain(copy);
        expect(error.message).not.toContain("Gemini");
    });

    test("exposes_only_the_validated_allowance_reset_time", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
            error: "personal_allowance_exhausted",
            reset_at: "2026-11-30T15:00:00.000Z",
        }, 429));
        const error = await diagnoseLawn(request).catch((caught) => caught);
        expect(error).toMatchObject({
            code: "personal_allowance_exhausted",
            resetAt: "2026-11-30T15:00:00.000Z",
        });
    });

    test("rejects_invalid_success_json_with_a_safe_error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ diagnosis: { surprise: true } }));

        await expect(diagnoseLawn(request)).rejects.toMatchObject({
            code: "invalid_response",
            status: 502,
            retryable: true,
        });
    });

    test("does_not_implicitly_retry_a_network_failure", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connection reset"));

        await expect(diagnoseLawn(request)).rejects.toMatchObject({
            code: "network_error",
            status: 0,
            retryable: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("returns_retake_guidance_for_an_unusable_photo", () => {
        expect(getRetakeGuidance({
            ...diagnosis,
            image_quality: { usable: false, retake_guidance: "Move closer to the affected area." },
        })).toBe("Move closer to the affected area.");
        expect(getRetakeGuidance(diagnosis)).toBeNull();
    });
});
