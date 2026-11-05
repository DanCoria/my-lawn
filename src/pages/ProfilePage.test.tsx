// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ProfileAllowanceCard } from "./ProfilePage";

afterEach(cleanup);

describe("ProfileAllowanceCard", () => {
    test("shows the owner allowance and reset without billing or outbound notification controls", () => {
        render(<ProfileAllowanceCard allowance={{
            source: "monthly", remaining: 0, reset_at: "2026-12-01T00:00:00Z", in_flight: false,
        }} />);
        expect(screen.getByText(/0 scans available/i)).toBeTruthy();
        expect(screen.getByText(/resets november 30/i)).toBeTruthy();
        expect(screen.queryByText(/billing|upgrade|email reminders|push notifications/i)).toBeNull();
    });
});
