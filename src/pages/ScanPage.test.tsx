// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AiUsageEvent, LawnCase, LawnScan, ScanEntitlement } from "@/types/database";
import { ScanExperience, deriveAllowanceSummary, getScanIntent, scanDiagnosisLabel, scanImageSource, stableScanRequestId } from "./ScanPage";

afterEach(cleanup);

const entitlement: ScanEntitlement = {
    user_id: "user-1", tier: "free", welcome_started_at: "2026-11-01T00:00:00Z",
    welcome_limit: 3, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
};

function usage(overrides: Partial<AiUsageEvent> = {}): AiUsageEvent {
    return {
        id: "event-1", user_id: "user-1", request_key: "request-1", route: "personalized",
        allowance_source: "welcome", status: "completed", scan_id: null, model: null,
        input_tokens: null, output_tokens: null, thought_tokens: null, total_tokens: null,
        usage_metadata_complete: null, response_payload: null, error_code: null,
        started_at: null, finalized_at: null, created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z",
        ...overrides,
    };
}

describe("scan allowance and intent", () => {
    test("offers the welcome allowance before the first entitlement row exists", () => {
        expect(deriveAllowanceSummary(null, [], new Date("2026-11-05T00:00:00Z"))).toEqual({
            source: "welcome", remaining: 3, reset_at: null, in_flight: false,
        });
    });

    test("shows remaining welcome scans and the day-30 reset", () => {
        expect(deriveAllowanceSummary(entitlement, [usage()], new Date("2026-11-05T00:00:00Z"))).toEqual({
            source: "welcome", remaining: 2, reset_at: "2026-12-01T00:00:00.000Z", in_flight: false,
        });
    });

    test("replenishes one monthly scan after day 30", () => {
        expect(deriveAllowanceSummary(entitlement, [], new Date("2026-12-05T00:00:00Z"))).toEqual({
            source: "monthly", remaining: 1, reset_at: "2026-12-31T00:00:00.000Z", in_flight: false,
        });
    });

    test("does not charge failed or unusable scans and detects in-flight work", () => {
        const summary = deriveAllowanceSummary(entitlement, [
            usage({ status: "failed" }), usage({ id: "event-2", status: "unusable" }),
            usage({ id: "event-3", status: "started" }),
        ], new Date("2026-11-05T00:00:00Z"))!;
        expect(summary.remaining).toBe(3);
        expect(summary.in_flight).toBe(true);
    });

    test("uses an initial observation without a plan and a linked follow-up with one", () => {
        expect(getScanIntent(null)).toEqual({ mode: "personalized", purpose: "initial", caseId: null });
        expect(getScanIntent({ id: "case-1" } as LawnCase)).toEqual({ mode: "follow_up", purpose: "follow_up", caseId: "case-1" });
    });

    test("reuses a logical request ID across retries", () => {
        const create = vi.fn(() => "new-request");
        expect(stableScanRequestId("existing-request", create)).toBe("existing-request");
        expect(create).not.toHaveBeenCalled();
        expect(stableScanRequestId(null, create)).toBe("new-request");
    });

    test("prefers private signed images and safely labels legacy scans", () => {
        const legacy = {
            image_url: "legacy-public.jpg",
            diagnosis: { condition_label: "Thin turf" },
        } as LawnScan;
        expect(scanImageSource({ ...legacy, signed_image_url: "signed-private.jpg" })).toBe("signed-private.jpg");
        expect(scanDiagnosisLabel(legacy)).toBe("Thin turf");
    });
});

describe("ScanExperience", () => {
    test("preserves history access while allowance is exhausted", () => {
        render(<ScanExperience allowance={{ source: "monthly", remaining: 0, reset_at: "2026-12-01T00:00:00Z", in_flight: false }} intent={getScanIntent(null)} recentScans={<p>Recent scan result</p>} onChoosePhoto={vi.fn()} />);
        expect(screen.getByText(/next scan.*november 30/i)).toBeTruthy();
        expect(screen.getByText("Recent scan result")).toBeTruthy();
        expect(screen.getByRole("button", { name: /choose a photo/i }).hasAttribute("disabled")).toBe(true);
    });

    test("explains follow-up linkage and disables duplicate work in flight", () => {
        render(<ScanExperience allowance={{ source: "welcome", remaining: 2, reset_at: null, in_flight: true }} intent={{ mode: "follow_up", purpose: "follow_up", caseId: "case-1", caseTitle: "Heat stress" }} recentScans={null} onChoosePhoto={vi.fn()} />);
        expect(screen.getByText(/compare progress on heat stress/i)).toBeTruthy();
        expect(screen.getByText(/already being analyzed/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /choose a photo/i }).hasAttribute("disabled")).toBe(true);
    });
});
