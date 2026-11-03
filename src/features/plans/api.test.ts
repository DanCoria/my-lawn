import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    completePlanStep,
    fetchLawnCases,
    fetchPlanSteps,
    fetchPrimaryCase,
    invalidatePlanResources,
    planKeys,
    postponePlanStep,
    startPlan,
    switchPrimaryCase,
} from "./api";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

function builder(result: unknown) {
    const calls: Array<[string, unknown]> = [];
    const value = {
        calls,
        select(columns: string) { calls.push(["select", columns]); return value; },
        eq(column: string, input: unknown) { calls.push([`eq:${column}`, input]); return value; },
        in(column: string, input: unknown) { calls.push([`in:${column}`, input]); return value; },
        order(column: string, input: unknown) { calls.push([`order:${column}`, input]); return value; },
        maybeSingle() { calls.push(["maybeSingle", true]); return Promise.resolve({ data: result, error: null }); },
        then(resolve: (input: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: result, error: null }).then(resolve); },
    };
    return value;
}

describe("complete plan resource queries", () => {
    beforeEach(() => vi.clearAllMocks());

    test("uses stable complete-row keys", () => {
        expect(planKeys.cases("user-1")).toEqual(["lawn-cases", "user-1"]);
        expect(planKeys.steps("user-1", "case-1")).toEqual(["plan-steps", "user-1", "case-1"]);
        expect(planKeys.primary("user-1")).toEqual(["primary-plan", "user-1"]);
    });

    test("fetches complete owned cases and steps", async () => {
        const cases = builder([]); const steps = builder([]);
        mocks.from.mockReturnValueOnce(cases).mockReturnValueOnce(steps);
        await fetchLawnCases("user-1"); await fetchPlanSteps("user-1", "case-1");
        expect(cases.calls).toContainEqual(["select", "*"]);
        expect(cases.calls).toContainEqual(["eq:user_id", "user-1"]);
        expect(steps.calls).toContainEqual(["select", "*"]);
        expect(steps.calls).toContainEqual(["eq:case_id", "case-1"]);
        expect(steps.calls).toContainEqual(["eq:user_id", "user-1"]);
    });

    test("fetches one complete primary active or monitoring case", async () => {
        const primary = builder(null); mocks.from.mockReturnValue(primary);
        await fetchPrimaryCase("user-1");
        expect(primary.calls).toContainEqual(["select", "*"]);
        expect(primary.calls).toContainEqual(["eq:is_primary", true]);
        expect(primary.calls).toContainEqual(["in:status", ["active", "monitoring"]]);
        expect(primary.calls).toContainEqual(["maybeSingle", true]);
    });
});

describe("plan transitions", () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: {}, error: null }); });

    test("uses server-owned RPCs for every transition", async () => {
        await startPlan("case-1");
        await completePlanStep("step-1", "dry");
        await postponePlanStep("step-2", "2026-11-04T15:00:00.000Z");
        await switchPrimaryCase("case-2");
        expect(mocks.rpc).toHaveBeenNthCalledWith(1, "start_plan_from_observation", { p_case_id: "case-1" });
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_plan_step", { p_step_id: "step-1", p_result: "dry" });
        expect(mocks.rpc).toHaveBeenNthCalledWith(3, "postpone_plan_step", { p_step_id: "step-2", p_due_at: "2026-11-04T15:00:00.000Z" });
        expect(mocks.rpc).toHaveBeenNthCalledWith(4, "switch_primary_case", { p_case_id: "case-2" });
    });

    test("invalidates cases, every user step resource, and primary plan", async () => {
        const client = new QueryClient();
        const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
        await invalidatePlanResources(client, "user-1");
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lawn-cases", "user-1"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plan-steps", "user-1"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["primary-plan", "user-1"] });
    });
});
