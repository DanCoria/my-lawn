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
    task_key: string;
    completed_at: string;
}

export type ActivityInsert = Omit<Activity, "id" | "user_id" | "created_at">;

export interface LawnScan {
    id: string;
    user_id: string;
    image_url: string;
    diagnosis: import("@/lib/gemini").Diagnosis;
    created_at: string;
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
    created_at: string;
    updated_at: string;
}
