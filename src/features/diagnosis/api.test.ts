import { beforeEach, describe, expect, test, vi } from "vitest";
import { diagnoseLawn } from "@/lib/gemini";
import { runGuestPreview, runPersonalizedDiagnosis } from "./api";

vi.mock("@/lib/gemini", () => ({ diagnoseLawn: vi.fn() }));

const mockedDiagnose = vi.mocked(diagnoseLawn);

describe("diagnosis route wrappers", () => {
    beforeEach(() => mockedDiagnose.mockReset());

    test("sends only the guest symptom through the guest_preview route", async () => {
        mockedDiagnose.mockResolvedValue({ diagnosis: {} as never, allowance: { source: "guest" }, usage_event_id: "event" });
        await runGuestPreview({ imageBase64: "abc", mimeType: "image/jpeg", symptom: "brown", requestId: "request" });
        expect(mockedDiagnose).toHaveBeenCalledWith({
            mode: "guest_preview",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            requestId: "request",
            context: { symptom: "brown" },
        });
    });

    test("forces personalized mode while preserving bounded context", async () => {
        mockedDiagnose.mockResolvedValue({ diagnosis: {} as never, allowance: { source: "monthly" }, usage_event_id: "event" });
        await runPersonalizedDiagnosis({ imageBase64: "abc", mimeType: "image/png", requestId: "request", context: { symptom: "thin", grass_type: "bermuda" } });
        expect(mockedDiagnose).toHaveBeenCalledWith(expect.objectContaining({ mode: "personalized", context: { symptom: "thin", grass_type: "bermuda" } }));
    });
});
