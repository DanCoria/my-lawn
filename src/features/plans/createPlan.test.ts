import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DiagnosisV2 } from "@shared/diagnosis-contract";
import { createObservationFromDiagnosis, startPrimaryPlan } from "./createPlan";

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(), from: vi.fn(), storageFrom: vi.fn(), upload: vi.fn(), remove: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
    supabase: {
        auth: { getUser: mocks.getUser },
        from: mocks.from,
        storage: { from: mocks.storageFrom },
        rpc: mocks.rpc,
    },
}));

const diagnosis: DiagnosisV2 = {
    schema_version: 2, image_quality: { usable: true }, likely_cause: "Heat stress", confidence: "medium",
    summary: "Folded blades suggest heat stress.",
    evidence: [{ observation: "Folded blades", significance: "Moisture response" }],
    alternatives: [{ cause: "Fungal pressure", reason: "Overlap", verification: "Check lesions" }],
    safe_next_step: "Check soil moisture.", safety_notes: ["Verify before treatment."],
    plan_seed: { summary: "Confirm moisture.", steps: [{ order: 1, kind: "action", title: "Check soil", instructions: "Feel two inches down.", due_in_days: 0 }] },
};

function insertBuilder(data: unknown, error: unknown = null) {
    const state = { payload: null as unknown };
    const value = {
        state,
        insert(payload: unknown) { state.payload = payload; return value; },
        select() { return value; },
        single() { return Promise.resolve({ data, error }); },
        delete() { return value; },
        eq() { return Promise.resolve({ data: null, error: null }); },
    };
    return value;
}

describe("createObservationFromDiagnosis", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: false } }, error: null });
        mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
        mocks.upload.mockResolvedValue({ data: { path: "user-1/photo.jpg" }, error: null });
        mocks.remove.mockResolvedValue({ data: null, error: null });
    });

    test("verifies permanent ownership before private upload and persists a V2 observation scan", async () => {
        const caseBuilder = insertBuilder({ id: "case-1" });
        const scanBuilder = insertBuilder({ id: "scan-1" });
        mocks.from.mockImplementation((table: string) => table === "lawn_cases" ? caseBuilder : scanBuilder);

        await expect(createObservationFromDiagnosis("user-1", diagnosis, new Blob(["photo"], { type: "image/jpeg" }), { grassType: "bermuda", locationName: "Austin" }))
            .resolves.toEqual({ caseId: "case-1", scanId: "scan-1" });

        expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/.+\.jpg$/), expect.any(Blob), expect.objectContaining({ contentType: "image/jpeg", upsert: false }));
        expect(caseBuilder.state.payload).toEqual(expect.objectContaining({ user_id: "user-1", status: "observation", is_primary: false, diagnosis, plan_seed: diagnosis.plan_seed }));
        expect(scanBuilder.state.payload).toEqual(expect.objectContaining({ user_id: "user-1", case_id: "case-1", purpose: "initial", diagnosis_schema_version: 2, diagnosis }));
        expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
    });

    test("rejects anonymous or invalid diagnosis before uploading", async () => {
        mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: true } }, error: null });
        await expect(createObservationFromDiagnosis("user-1", diagnosis, new Blob(["photo"]), { grassType: "bermuda" })).rejects.toThrow("permanent account");
        await expect(createObservationFromDiagnosis("user-1", {} as DiagnosisV2, new Blob(["photo"]), { grassType: "bermuda" })).rejects.toThrow("valid personalized diagnosis");
        expect(mocks.upload).not.toHaveBeenCalled();
    });

    test("cleans up the private image and observation if scan persistence fails", async () => {
        const caseBuilder = insertBuilder({ id: "case-1" });
        const scanBuilder = insertBuilder(null, new Error("scan insert failed"));
        mocks.from.mockImplementation((table: string) => table === "lawn_cases" ? caseBuilder : scanBuilder);
        await expect(createObservationFromDiagnosis("user-1", diagnosis, new Blob(["photo"], { type: "image/jpeg" }), { grassType: "bermuda" })).rejects.toThrow("scan insert failed");
        expect(mocks.remove).toHaveBeenCalledTimes(1);
    });
});

describe("startPrimaryPlan", () => {
    test("validates the stored plan seed, starts through the RPC, and returns materialized step ids", async () => {
        const caseQuery = { select: () => caseQuery, eq: () => caseQuery, single: () => Promise.resolve({ data: { id: "case-1", diagnosis }, error: null }) };
        const stepQuery = { select: () => stepQuery, eq: () => stepQuery, order: () => Promise.resolve({ data: [{ id: "step-1" }], error: null }) };
        mocks.from.mockImplementation((table: string) => table === "lawn_cases" ? caseQuery : stepQuery);
        mocks.rpc.mockResolvedValue({ data: "case-1", error: null });
        await expect(startPrimaryPlan("case-1")).resolves.toEqual({ caseId: "case-1", stepIds: ["step-1"] });
        expect(mocks.rpc).toHaveBeenCalledWith("start_plan_from_observation", { p_case_id: "case-1" });
    });
});
