// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConvertAccountPage } from "./ConvertAccountPage";

const mocks = vi.hoisted(() => ({ link: vi.fn(), signIn: vi.fn(), load: vi.fn(), clear: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ linkAnonymousEmail: mocks.link, signIntoExistingAccount: mocks.signIn }) }));
vi.mock("./guestDraft", () => ({ loadGuestDraft: mocks.load, clearGuestDraft: mocks.clear }));

const draft = { version: 1, image: new Blob(["photo"], { type: "image/jpeg" }), symptom: "brown", previewDiagnosis: {}, requestId: "request", createdAt: Date.now() };

describe("ConvertAccountPage", () => {
    afterEach(cleanup);
    beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(draft); });

    test("links a new email while preserving the local draft for verification", async () => {
        mocks.link.mockResolvedValue(undefined);
        render(<MemoryRouter><ConvertAccountPage manualLinkingEnabled /></MemoryRouter>);
        await screen.findByText(/save this diagnosis/i);
        fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "new@example.com" } });
        fireEvent.click(screen.getByRole("button", { name: /email me a verification link/i }));
        await screen.findByText(/check your email/i);
        expect(mocks.link).toHaveBeenCalledWith("new@example.com");
        expect(mocks.clear).not.toHaveBeenCalled();
    });

    test("offers existing-account sign-in when the email is already registered", async () => {
        mocks.link.mockRejectedValue(new Error("A user with this email address has already been registered"));
        render(<MemoryRouter><ConvertAccountPage manualLinkingEnabled /></MemoryRouter>);
        await screen.findByText(/save this diagnosis/i);
        fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@example.com" } });
        fireEvent.click(screen.getByRole("button", { name: /email me a verification link/i }));
        await screen.findByLabelText(/^password$/i);
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
        fireEvent.click(screen.getByRole("button", { name: /sign in and continue/i }));
        await screen.findByRole("link", { name: /continue to profile setup/i });
        expect(mocks.signIn).toHaveBeenCalledWith("owner@example.com", "password123");
        expect(mocks.clear).not.toHaveBeenCalled();
    });

    test("explains an expired draft without fabricating a personalized result", async () => {
        mocks.load.mockResolvedValue(null);
        render(<MemoryRouter><ConvertAccountPage manualLinkingEnabled /></MemoryRouter>);
        await screen.findByText(/preview was not saved/i);
        expect(screen.queryByText(/personalized diagnosis/i)).toBeNull();
        expect(mocks.link).not.toHaveBeenCalled();
    });
});
