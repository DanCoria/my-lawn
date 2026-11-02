import { describe, expect, test } from "vitest";

import {
    createGeminiDiagnosisClient,
    type GeminiTransport,
    type GeminiTransportRequest,
    type GeminiTransportResponse,
} from "./gemini-client";

const guestDiagnosis = {
    schema_version: "guest-preview-1",
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The blades appear folded and uniformly dry.",
    safe_next_step: "Check soil moisture two inches below the surface.",
} as const;

const personalizedDiagnosis = {
    schema_version: 2,
    image_quality: { usable: true },
    likely_cause: "Heat stress",
    confidence: "medium",
    summary: "The visible folding and even discoloration support heat stress.",
    evidence: [
        {
            observation: "Blades are folded lengthwise.",
            significance: "Folding reduces moisture loss during heat stress.",
        },
    ],
    alternatives: [
        {
            cause: "Early fungal pressure",
            reason: "Some discoloration can look similar in one image.",
            verification: "Inspect individual blades for spots or lesions.",
        },
    ],
    safe_next_step: "Check soil moisture before changing irrigation.",
    safety_notes: ["Do not apply a treatment until the cause is verified."],
    treatment_category: "Irrigation adjustment",
    plan_seed: {
        summary: "Confirm moisture, adjust watering, and reassess.",
        steps: [
            {
                order: 1,
                kind: "check",
                title: "Check soil moisture",
                instructions: "Inspect soil two inches below the surface.",
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

function createFakeTransport(responses: GeminiTransportResponse[]): {
    transport: GeminiTransport;
    calls: GeminiTransportRequest[];
} {
    const calls: GeminiTransportRequest[] = [];
    let responseIndex = 0;

    return {
        calls,
        transport: async (request) => {
            calls.push(request);
            const response = responses[responseIndex];
            responseIndex += 1;
            if (!response) throw new Error("No fake Gemini response configured");
            return response;
        },
    };
}

function successResponse(
    diagnosis: unknown,
    usageMetadata: GeminiTransportResponse["usageMetadata"] = {
        promptTokenCount: 250,
        candidatesTokenCount: 90,
        thoughtsTokenCount: 0,
        totalTokenCount: 340,
    },
): GeminiTransportResponse {
    return { text: JSON.stringify(diagnosis), usageMetadata };
}

function createClient(transport: GeminiTransport) {
    return createGeminiDiagnosisClient(
        {
            guestModel: "gemini-2.5-flash-lite",
            diagnosisModel: "gemini-2.5-flash",
        },
        transport,
    );
}

describe("Gemini diagnosis client", () => {
    test("guest_uses_lite_and_700_tokens", async () => {
        const fake = createFakeTransport([successResponse(guestDiagnosis)]);

        const result = await createClient(fake.transport).analyze({
            route: "guest_preview",
            imageBase64: "base64-image",
            mimeType: "image/jpeg",
            context: { symptom: "brown" },
        });

        expect(result.route).toBe("guest_preview");
        expect(fake.calls[0]).toMatchObject({
            model: "gemini-2.5-flash-lite",
            imageBase64: "base64-image",
            mimeType: "image/jpeg",
            generationConfig: {
                maxOutputTokens: 700,
                responseMimeType: "application/json",
            },
        });
    });

    test("personalized_uses_flash_and_1500_tokens", async () => {
        const fake = createFakeTransport([
            successResponse(personalizedDiagnosis),
        ]);

        const result = await createClient(fake.transport).analyze({
            route: "personalized",
            imageBase64: "base64-image",
            mimeType: "image/png",
            context: { grassType: "bermuda", symptom: "thin" },
        });

        expect(result.route).toBe("personalized");
        expect(fake.calls[0]).toMatchObject({
            model: "gemini-2.5-flash",
            generationConfig: {
                maxOutputTokens: 1500,
                responseMimeType: "application/json",
            },
        });
    });

    test("thinking_is_zero", async () => {
        const fake = createFakeTransport([
            successResponse(guestDiagnosis),
            successResponse(personalizedDiagnosis),
        ]);
        const client = createClient(fake.transport);

        await client.analyze({
            route: "guest_preview",
            imageBase64: "guest-image",
            mimeType: "image/jpeg",
            context: {},
        });
        await client.analyze({
            route: "follow_up",
            imageBase64: "follow-up-image",
            mimeType: "image/jpeg",
            context: {},
        });

        expect(fake.calls.map((call) => call.generationConfig.thinkingConfig))
            .toEqual([{ thinkingBudget: 0 }, { thinkingBudget: 0 }]);
    });

    test("invalid_json_is_provider_failure", async () => {
        const fake = createFakeTransport([{
            text: "not-json",
            usageMetadata: {
                promptTokenCount: 12,
                candidatesTokenCount: 3,
                totalTokenCount: 15,
            },
        }]);

        await expect(
            createClient(fake.transport).analyze({
                route: "guest_preview",
                imageBase64: "image",
                mimeType: "image/jpeg",
                context: {},
            }),
        ).rejects.toMatchObject({
            name: "GeminiProviderError",
            code: "invalid_json",
            outcomeUnknown: false,
            usage: {
                model: "gemini-2.5-flash-lite",
                input_tokens: 12,
                output_tokens: 3,
                thought_tokens: 0,
                total_tokens: 15,
                metadata_complete: true,
            },
        });
    });

    test("transport_error_is_ambiguous_and_has_explicit_missing_usage", async () => {
        const client = createClient(async () => { throw new TypeError("connection reset"); });

        await expect(client.analyze({
            route: "guest_preview",
            imageBase64: "image",
            mimeType: "image/jpeg",
            context: {},
        })).rejects.toMatchObject({
            code: "transport_error",
            outcomeUnknown: true,
            usage: {
                model: "gemini-2.5-flash-lite",
                metadata_complete: false,
            },
        });
    });

    test("invalid_guest_contract_is_provider_failure", async () => {
        const fake = createFakeTransport([
            successResponse({ ...guestDiagnosis, safe_next_step: "" }),
        ]);

        await expect(
            createClient(fake.transport).analyze({
                route: "guest_preview",
                imageBase64: "image",
                mimeType: "image/jpeg",
                context: {},
            }),
        ).rejects.toMatchObject({
            code: "invalid_contract",
        });
    });

    test("invalid_v2_contract_is_provider_failure", async () => {
        const fake = createFakeTransport([successResponse(guestDiagnosis)]);

        await expect(
            createClient(fake.transport).analyze({
                route: "personalized",
                imageBase64: "image",
                mimeType: "image/jpeg",
                context: {},
            }),
        ).rejects.toMatchObject({
            code: "invalid_contract",
        });
    });

    test("guest_response_cannot_include_plan_seed", async () => {
        const fake = createFakeTransport([
            successResponse({
                ...guestDiagnosis,
                plan_seed: personalizedDiagnosis.plan_seed,
            }),
        ]);

        await expect(
            createClient(fake.transport).analyze({
                route: "guest_preview",
                imageBase64: "image",
                mimeType: "image/jpeg",
                context: {},
            }),
        ).rejects.toMatchObject({
            code: "invalid_contract",
        });
    });

    test("extracts_input_output_and_thought_usage", async () => {
        const fake = createFakeTransport([
            successResponse(guestDiagnosis, {
                promptTokenCount: 321,
                candidatesTokenCount: 123,
                thoughtsTokenCount: 11,
                totalTokenCount: 455,
            }),
        ]);

        const result = await createClient(fake.transport).analyze({
            route: "guest_preview",
            imageBase64: "image",
            mimeType: "image/jpeg",
            context: {},
        });

        expect(result.usage).toEqual({
            model: "gemini-2.5-flash-lite",
            input_tokens: 321,
            output_tokens: 123,
            thought_tokens: 11,
            total_tokens: 455,
            metadata_complete: true,
        });
    });

    test("flags_missing_usage_metadata", async () => {
        const fake = createFakeTransport([
            { text: JSON.stringify(guestDiagnosis) },
        ]);

        const result = await createClient(fake.transport).analyze({
            route: "guest_preview",
            imageBase64: "image",
            mimeType: "image/jpeg",
            context: {},
        });

        expect(result.usage).toEqual({
            model: "gemini-2.5-flash-lite",
            input_tokens: 0,
            output_tokens: 0,
            thought_tokens: 0,
            total_tokens: 0,
            metadata_complete: false,
        });
    });

    test("accepts_omitted_thought_count_when_thinking_is_disabled", async () => {
        const fake = createFakeTransport([
            successResponse(guestDiagnosis, {
                promptTokenCount: 200,
                candidatesTokenCount: 75,
                totalTokenCount: 275,
            }),
        ]);

        const result = await createClient(fake.transport).analyze({
            route: "guest_preview",
            imageBase64: "image",
            mimeType: "image/jpeg",
            context: {},
        });

        expect(result.usage).toMatchObject({
            thought_tokens: 0,
            metadata_complete: true,
        });
    });
});
