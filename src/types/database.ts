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

export interface LawnScan {
    id: string;
    user_id: string;
    image_url: string;
    storage_path: string | null;
    diagnosis: import("@/lib/gemini").Diagnosis
        | import("@shared/diagnosis-contract").DiagnosisV2;
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
