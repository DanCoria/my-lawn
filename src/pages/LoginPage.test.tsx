// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn() }),
}));

afterEach(cleanup);

describe("LoginPage guest preview entry", () => {
    test("does not advertise the guest preview when its route is disabled", () => {
        render(
            <MemoryRouter>
                <LoginPage guestPreviewEnabled={false} />
            </MemoryRouter>,
        );

        expect(screen.queryByRole("link", { name: /preview a lawn problem/i })).toBeNull();
    });

    test("links to the diagnosis flow when the guest preview is enabled", () => {
        render(
            <MemoryRouter>
                <LoginPage guestPreviewEnabled />
            </MemoryRouter>,
        );

        expect(screen.getByRole("link", { name: /preview a lawn problem/i }).getAttribute("href")).toBe("/diagnose");
    });
});
