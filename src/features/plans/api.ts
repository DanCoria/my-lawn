import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LawnCase, PlanStep } from "@/types/database";

export const planKeys = {
    cases: (userId: string) => ["lawn-cases", userId] as const,
    steps: (userId: string, caseId: string) => ["plan-steps", userId, caseId] as const,
    primary: (userId: string) => ["primary-plan", userId] as const,
};

export async function fetchLawnCases(userId: string): Promise<LawnCase[]> {
    const { data, error } = await supabase
        .from("lawn_cases")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as LawnCase[];
}

export async function fetchPlanSteps(
    userId: string,
    caseId: string,
): Promise<PlanStep[]> {
    const { data, error } = await supabase
        .from("plan_steps")
        .select("*")
        .eq("user_id", userId)
        .eq("case_id", caseId)
        .order("step_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as PlanStep[];
}

export async function fetchPrimaryCase(userId: string): Promise<LawnCase | null> {
    const { data, error } = await supabase
        .from("lawn_cases")
        .select("*")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .in("status", ["active", "monitoring"])
        .maybeSingle();
    if (error) throw error;
    return data as LawnCase | null;
}

async function runRpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, parameters);
    if (error) throw error;
    return data as T;
}

export function startPlan(caseId: string): Promise<string> {
    return runRpc<string>("start_plan_from_observation", { p_case_id: caseId });
}

export function completePlanStep(stepId: string, result: string): Promise<Record<string, unknown>> {
    return runRpc("complete_plan_step", { p_step_id: stepId, p_result: result });
}

export function postponePlanStep(stepId: string, dueAt: string): Promise<void> {
    return runRpc<void>("postpone_plan_step", { p_step_id: stepId, p_due_at: dueAt });
}

export function switchPrimaryCase(caseId: string): Promise<void> {
    return runRpc<void>("switch_primary_case", { p_case_id: caseId });
}

export async function invalidatePlanResources(
    queryClient: QueryClient,
    userId: string,
): Promise<void> {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: planKeys.cases(userId) }),
        queryClient.invalidateQueries({ queryKey: ["plan-steps", userId] }),
        queryClient.invalidateQueries({ queryKey: planKeys.primary(userId) }),
    ]);
}

export function useLawnCases(userId: string) {
    return useQuery({
        queryKey: planKeys.cases(userId),
        queryFn: () => fetchLawnCases(userId),
        enabled: Boolean(userId),
    });
}

export function usePlanSteps(userId: string, caseId: string) {
    return useQuery({
        queryKey: planKeys.steps(userId, caseId),
        queryFn: () => fetchPlanSteps(userId, caseId),
        enabled: Boolean(userId && caseId),
    });
}

export function usePrimaryCase(userId: string) {
    return useQuery({
        queryKey: planKeys.primary(userId),
        queryFn: () => fetchPrimaryCase(userId),
        enabled: Boolean(userId),
    });
}

function usePlanMutation<TVariables>(
    userId: string,
    mutationFn: (variables: TVariables) => Promise<unknown>,
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => invalidatePlanResources(queryClient, userId),
    });
}

export function useStartPlan(userId: string) {
    return usePlanMutation(userId, (caseId: string) => startPlan(caseId));
}

export function useCompletePlanStep(userId: string) {
    return usePlanMutation(userId, (input: { stepId: string; result: string }) =>
        completePlanStep(input.stepId, input.result));
}

export function usePostponePlanStep(userId: string) {
    return usePlanMutation(userId, (input: { stepId: string; dueAt: string }) =>
        postponePlanStep(input.stepId, input.dueAt));
}

export function useSwitchPrimaryCase(userId: string) {
    return usePlanMutation(userId, (caseId: string) => switchPrimaryCase(caseId));
}
