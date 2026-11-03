// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GuestScanPage } from "./GuestScanPage";

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), preview: vi.fn(), save: vi.fn(), resize: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ ensureAnonymousSession: mocks.ensure }) }));
vi.mock("@/features/diagnosis/api", async () => ({ runGuestPreview: mocks.preview }));
vi.mock("./guestDraft", async (loadOriginal) => ({ ...(await loadOriginal()), saveGuestDraft: mocks.save }));
vi.mock("@/lib/gemini", async (loadOriginal) => ({ ...(await loadOriginal()), resizeImageForAI: mocks.resize }));

const diagnosis = { schema_version: "guest-preview-1" as const, image_quality: { usable: true }, likely_cause: "Possible drought stress", confidence: "medium" as const, summary: "Folded, dry blades are visible.", safe_next_step: "Check soil moisture first." };

function renderPage() {
    return render(<MemoryRouter><GuestScanPage renderTurnstile={(verify) => <button onClick={() => verify("captcha-token")}>Complete security check</button>} createRequestId={() => "11111111-1111-4111-8111-111111111111"} /></MemoryRouter>);
}

async function completeForm() {
    const file = new File(["photo"], "lawn.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/lawn photo/i), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/brown patches/i));
    fireEvent.click(screen.getByRole("button", { name: /complete security/i }));
    fireEvent.click(screen.getByRole("button", { name: /analyze my lawn/i }));
}

describe("GuestScanPage", () => {
    afterEach(cleanup);
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resize.mockResolvedValue("resized-base64");
        mocks.ensure.mockResolvedValue({ id: "anonymous" });
        mocks.preview.mockResolvedValue({ diagnosis, allowance: { source: "guest" } });
    });

    test("requires a symptom and Turnstile, then keeps one request id and offers conversion", async () => {
        renderPage();
        expect((screen.getByRole("button", { name: /analyze my lawn/i }) as HTMLButtonElement).disabled).toBe(true);
        await completeForm();
        await screen.findByText("Possible drought stress");
        expect(mocks.ensure).toHaveBeenCalledTimes(1);
        expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ requestId: "11111111-1111-4111-8111-111111111111", symptom: "brown" }));
        expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ requestId: "11111111-1111-4111-8111-111111111111", previewDiagnosis: diagnosis }));
        expect(screen.getByRole("link", { name: /create profile/i }).getAttribute("href")).toBe("/diagnose/convert");
        expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toContain("mode=signin");
    });

    test("shows retake guidance and does not save an unusable draft", async () => {
        mocks.preview.mockResolvedValue({ diagnosis: { ...diagnosis, image_quality: { usable: false, retake_guidance: "Move closer in brighter light." } }, allowance: { source: "guest" } });
        renderPage();
        await completeForm();
        await screen.findByText("Move closer in brighter light.");
        expect(mocks.save).not.toHaveBeenCalled();
    });

    test("shows safe network-limit copy without automatically retrying", async () => {
        mocks.preview.mockRejectedValue(Object.assign(new Error("Lawn scans are temporarily at their safety limit. Please come back later."), { code: "network_limit_exhausted" }));
        renderPage();
        await completeForm();
        await screen.findByText(/temporarily at their safety limit/i);
        await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    });
});
