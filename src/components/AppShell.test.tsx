// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test } from "vitest";

import { AppShell } from "./AppShell";
import { BottomNav } from "./BottomNav";

afterEach(cleanup);

function renderShell(path = "/") {
    return render(
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<div>Today route</div>} />
                    <Route path="/plan" element={<><div>Plan route</div><BottomNav /></>} />
                    <Route path="/scan" element={<div>Scan route</div>} />
                    <Route path="/progress" element={<div>Progress route</div>} />
                    <Route path="/profile" element={<div>Profile route</div>} />
                </Route>
                <Route path="/diagnose" element={<div>Guest preview route</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("AppShell", () => {
    test("shows exactly four coach-first tabs with active state and safe-area padding", () => {
        const view = renderShell("/plan");
        const navigation = screen.getByRole("navigation", { name: /primary/i });
        const links = Array.from(navigation.querySelectorAll("a"));

        expect(links.map((link) => link.textContent?.trim())).toEqual(["Today", "Plan", "Scan", "Progress"]);
        expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/plan", "/scan", "/progress"]);
        expect(screen.getByRole("link", { name: "Plan" }).getAttribute("aria-current")).toBe("page");
        expect(navigation.className).toContain("pb-[env(safe-area-inset-bottom)]");
        expect(view.container.textContent).not.toContain("Schedule");
        expect(view.container.textContent).not.toContain("Log");
    });

    test("keeps profile in the header and leaves guest routes outside the shell", () => {
        renderShell("/");
        expect(screen.getByRole("link", { name: /open profile/i }).getAttribute("href")).toBe("/profile");
        cleanup();

        renderShell("/diagnose");
        expect(screen.getByText("Guest preview route")).toBeTruthy();
        expect(screen.queryByRole("navigation", { name: /primary/i })).toBeNull();
        expect(screen.queryByRole("link", { name: /open profile/i })).toBeNull();
    });
});
