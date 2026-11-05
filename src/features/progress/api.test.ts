import { beforeEach, describe, expect, test, vi } from "vitest";

import { confirmComparison, saveComparisonProposal } from "./api";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

function updateBuilder() {
    const state = { payload: null as unknown, filters: [] as unknown[] };
    const builder = {
        state,
        update(payload: unknown) { state.payload = payload; return builder; },
        eq(column: string, value: unknown) {
            state.filters.push([column, value]);
            if (state.filters.length === 2) return Promise.resolve({ data: null, error: null });
            return builder;
        },
    };
    return builder;
}

describe("progress comparison API", () => {
    beforeEach(() => vi.clearAllMocks());

    test("persists the model proposal without confirming or changing the case", async () => {
        const builder = updateBuilder();
        mocks.from.mockReturnValue(builder);
        await saveComparisonProposal("user-1", "scan-1", {
            status: "improving", summary: "More green blades.", evidence: ["Denser coverage"],
        });
        expect(mocks.from).toHaveBeenCalledWith("lawn_scans");
        expect(builder.state.payload).toEqual({
            comparison_proposal_status: "improving",
            comparison_proposal_summary: "More green blades.",
            comparison_evidence: ["Denser coverage"],
        });
        expect(builder.state.filters).toEqual([["id", "scan-1"], ["user_id", "user-1"]]);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    test.each(["improving", "unchanged", "worsening", "resolved", "unable_to_determine"] as const)(
        "confirms owner-selected %s status atomically through the RPC",
        async (status) => {
            mocks.rpc.mockResolvedValue({ data: { case_status: "monitoring" }, error: null });
            await expect(confirmComparison("case-1", "scan-1", status)).resolves.toEqual({ case_status: "monitoring" });
            expect(mocks.rpc).toHaveBeenCalledWith("confirm_scan_comparison", {
                p_case_id: "case-1", p_scan_id: "scan-1", p_status: status,
            });
        },
    );

    test("surfaces owner or linkage rejection from the database", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: new Error("not owned") });
        await expect(confirmComparison("case-1", "scan-2", "resolved")).rejects.toThrow("not owned");
    });
});
