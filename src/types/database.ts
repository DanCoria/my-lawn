export type ActivityType =
    | "mow"
    | "fertilize"
    | "pre-emergent"
    | "scalp"
    | "water"
    | "aerate";

export interface Activity {
    id: string;
    user_id: string;
    type: ActivityType;
    date: string; // ISO date string YYYY-MM-DD
    notes: string | null;
    created_at: string;
}

export interface TaskCompletion {
    id: string;
    user_id: string;
    grass_type: GrassType;
    task_key: string;
    completed_at: string;
}

export type ActivityInsert = Omit<Activity, "id" | "user_id" | "created_at">;

export type LawnCaseStatus =
    | "observation"
    | "active"
    | "monitoring"
    | "paused"
    | "resolved"
    | "archived";

export interface LawnCase {
    id: string;
    user_id: string;
    status: LawnCaseStatus;
    is_primary: boolean;
    title: string;
    area_label: string | null;
    likely_cause: string | null;
    confidence: "low" | "medium" | "high" | null;
    diagnosis: import("@shared/diagnosis-contract").DiagnosisV2;
    plan_seed: import("@shared/diagnosis-contract").PlanSeed;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

export type PlanStepKind = "action" | "check";
export type PlanStepStatus = "locked" | "ready" | "done" | "postponed" | "skipped";

export interface PlanStepCheckOption {
    value: string;
    label: string;
    next_order?: number;
}

export interface PlanStep {
    id: string;
    case_id: string;
    user_id: string;
    step_order: number;
    stage: string;
    kind: PlanStepKind;
    title: string;
    rationale: string | null;
    instructions: string;
    estimated_effort_minutes: number | null;
    delay_days: number;
    follow_up_days: number | null;
    not_before_at: string | null;
    due_at: string | null;
    weather_constraints: Record<string, unknown> | null;
    check_options: PlanStepCheckOption[] | null;
    status: PlanStepStatus;
    result: string | null;
    completed_at: string | null;
    postponed_at: string | null;
    created_at: string;
    updated_at: string;
}

export type ScanPurpose = "initial" | "follow_up" | "observation";
export type ScanComparisonStatus =
    | "improving"
    | "unchanged"
    | "worsening"
    | "resolved"
    | "unable_to_determine";

export interface LawnScan {
    id: string;
    user_id: string;
    image_url: string;
    storage_path: string | null;
    diagnosis: import("@/lib/gemini").Diagnosis
        | import("@shared/diagnosis-contract").DiagnosisV2
        | import("@shared/diagnosis-contract").FollowUpComparison;
    case_id: string | null;
    purpose: ScanPurpose | null;
    diagnosis_schema_version: number | null;
    comparison_status: ScanComparisonStatus | null;
    comparison_summary: string | null;
    comparison_proposal_status: ScanComparisonStatus | null;
    comparison_proposal_summary: string | null;
    comparison_evidence: string[] | null;
    comparison_confirmed_at: string | null;
    created_at: string;
}

export type AiUsageStatus =
    | "reserved"
    | "started"
    | "completed"
    | "failed"
    | "unusable"
    | "unknown";

export type ScanAllowanceSource = "guest" | "welcome" | "monthly";

export interface ScanEntitlement {
    user_id: string;
    tier: "free";
    welcome_started_at: string;
    welcome_limit: number;
    created_at: string;
    updated_at: string;
}

export interface AiUsageEvent {
    id: string;
    user_id: string;
    request_key: string;
    route: "guest_preview" | "personalized" | "follow_up";
    allowance_source: ScanAllowanceSource;
    status: AiUsageStatus;
    scan_id: string | null;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    thought_tokens: number | null;
    total_tokens: number | null;
    usage_metadata_complete: boolean | null;
    response_payload: import("@shared/diagnosis-contract").GuestDiagnosisPreview
        | import("@shared/diagnosis-contract").DiagnosisV2
        | null;
    error_code: string | null;
    started_at: string | null;
    finalized_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AllowanceSummary {
    source: ScanAllowanceSource;
    remaining: number;
    reset_at: string | null;
    in_flight: boolean;
}

// ── Grass types & user profiles ──────────────────────────────

export type GrassType =
    | "bermuda"
    | "st-augustine"
    | "zoysia"
    | "centipede"
    | "bahia"
    | "kentucky-bluegrass"
    | "tall-fescue"
    | "perennial-ryegrass"
    | "fine-fescue";

export type GrassSeason = "warm" | "cool";

export interface GrassTypeInfo {
    id: GrassType;
    name: string;
    season: GrassSeason;
    description: string;
    emoji: string;
}

export interface UserProfile {
    id: string;
    grass_type: GrassType;
    display_name: string | null;
    onboarding_completed: boolean;
    latitude: number | null;
    longitude: number | null;
    zip_code: string | null;
    location_name: string | null;
    created_at: string;
    updated_at: string;
}
