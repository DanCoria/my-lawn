import { supabase } from "@/lib/supabase";
import type { ComparisonProposal, ComparisonStatus } from "./compare";

export async function saveComparisonProposal(
    userId: string,
    scanId: string,
    proposal: ComparisonProposal,
): Promise<void> {
    const { error } = await supabase
        .from("lawn_scans")
        .update({
            comparison_proposal_status: proposal.status,
            comparison_proposal_summary: proposal.summary,
            comparison_evidence: proposal.evidence,
        })
        .eq("id", scanId)
        .eq("user_id", userId);
    if (error) throw error;
}

export async function confirmComparison(
    caseId: string,
    scanId: string,
    status: ComparisonStatus,
): Promise<{ case_status: string }> {
    const { data, error } = await supabase.rpc("confirm_scan_comparison", {
        p_case_id: caseId,
        p_scan_id: scanId,
        p_status: status,
    });
    if (error) throw error;
    return data as { case_status: string };
}
