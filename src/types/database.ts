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

