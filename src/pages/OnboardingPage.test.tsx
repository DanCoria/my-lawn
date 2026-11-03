// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DiagnosisV2, GuestDiagnosisPreview } from "@shared/diagnosis-contract";
import { OnboardingPage } from "./OnboardingPage";

const mocks = vi.hoisted(() => ({
    completeOnboarding: vi.fn(), loadDraft: vi.fn(), clearDraft: vi.fn(), resize: vi.fn(),
    runPersonalized: vi.fn(), createObservation: vi.fn(), startPlan: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "existing-user" }, sessionKind: "permanent" }) }));
vi.mock("@/contexts/LawnProfileContext", () => ({ useLawnProfile: () => ({ completeOnboarding: mocks.completeOnboarding }) }));
vi.mock("@/features/guest/guestDraft", () => ({ loadGuestDraft: mocks.loadDraft, clearGuestDraft: mocks.clearDraft }));
vi.mock("@/lib/gemini", async (loadOriginal) => ({ ...(await loadOriginal()), resizeImageForAI: mocks.resize }));
vi.mock("@/features/diagnosis/api", () => ({ runPersonalizedDiagnosis: mocks.runPersonalized }));
vi.mock("@/features/plans/createPlan", () => ({ createObservationFromDiagnosis: mocks.createObservation, startPrimaryPlan: mocks.startPlan }));

const preview: GuestDiagnosisPreview = {
    schema_version: "guest-preview-1", image_quality: { usable: true }, likely_cause: "Possible drought stress",
    confidence: "medium", summary: "Dry folded blades.", safe_next_step: "Check the soil.",
};
const diagnosis: DiagnosisV2 = {
    schema_version: 2, image_quality: { usable: true }, likely_cause: "Heat stress", confidence: "medium",
    summary: "Folded blades suggest heat stress.", evidence: [{ observation: "Folded blades", significance: "Moisture response" }],
    alternatives: [], safe_next_step: "Check soil moisture.", safety_notes: ["Verify before treatment."],
    plan_seed: { summary: "Confirm moisture.", steps: [{ order: 1, kind: "action", title: "Check soil", instructions: "Feel two inches down.", due_in_days: 0 }] },
};
const draft = {
    version: 1 as const, image: new Blob(["guest-photo"], { type: "image/jpeg" }), symptom: "brown",
    previewDiagnosis: preview, requestId: "guest-request", createdAt: Date.now(),
};

function renderPage() {
    return render(<MemoryRouter initialEntries={["/onboarding?from=guest"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/" element={<div>Home mode</div>} /></Routes></MemoryRouter>);
}

async function submitMinimalProfile() {
    fireEvent.click(await screen.findByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: /bermuda/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip location/i }));
    fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
}

describe("converted guest onboarding", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.loadDraft.mockResolvedValue(draft);
        mocks.resize.mockResolvedValue("personalized-image");
        mocks.completeOnboarding.mockResolvedValue(undefined);
        mocks.runPersonalized.mockResolvedValue({ diagnosis, allowance: { source: "welcome" }, usage_event_id: "usage-1" });
        mocks.createObservation.mockResolvedValue({ caseId: "case-1", scanId: "scan-1" });
        mocks.startPlan.mockResolvedValue({ caseId: "case-1", stepIds: ["step-1"] });
        mocks.clearDraft.mockResolvedValue(undefined);
    });
    afterEach(cleanup);

    test("collects minimal context, re-analyzes once for the permanent owner, and starts one primary plan", async () => {
        renderPage();
        await screen.findByText(/saved lawn preview/i);
        await submitMinimalProfile();
        await screen.findByText("Heat stress");

        expect(mocks.runPersonalized).toHaveBeenCalledTimes(1);
        expect(mocks.runPersonalized).toHaveBeenCalledWith(expect.objectContaining({
            requestId: expect.not.stringMatching(/^guest-request$/),
            imageBase64: "personalized-image",
            context: expect.objectContaining({ symptom: "brown", grass_type: "bermuda" }),
        }));
        expect(mocks.createObservation).toHaveBeenCalledWith("existing-user", diagnosis, draft.image, expect.objectContaining({ grassType: "bermuda" }));
        expect(mocks.createObservation.mock.invocationCallOrder[0]).toBeLessThan(mocks.clearDraft.mock.invocationCallOrder[0]);

        fireEvent.click(screen.getByRole("button", { name: /start this plan/i }));
        await screen.findByText("Home mode");
        expect(mocks.startPlan).toHaveBeenCalledWith("case-1");
    });

    test("keeps a declined diagnosis as an observation", async () => {
        renderPage(); await screen.findByText(/saved lawn preview/i); await submitMinimalProfile();
        await screen.findByText("Heat stress");
        fireEvent.click(screen.getByRole("button", { name: /keep as observation/i }));
        await screen.findByText("Home mode");
        expect(mocks.startPlan).not.toHaveBeenCalled();
        expect(mocks.createObservation).toHaveBeenCalledTimes(1);
    });

    test("preserves the draft and uploads nothing when allowance is exhausted", async () => {
        const error = Object.assign(new Error("You’ve used your available lawn scans."), {
            code: "personal_allowance_exhausted", resetAt: "2026-11-30T15:00:00.000Z",
        });
        mocks.runPersonalized.mockRejectedValue(error);
        renderPage(); await screen.findByText(/saved lawn preview/i); await submitMinimalProfile();
        await screen.findByText(/November 30/i);
        expect(mocks.createObservation).not.toHaveBeenCalled();
        expect(mocks.clearDraft).not.toHaveBeenCalled();
        expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    });
});
