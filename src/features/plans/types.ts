export type {
    LawnCase,
    LawnCaseStatus,
    PlanStep,
    PlanStepCheckOption,
    PlanStepKind,
    PlanStepStatus,
} from "@/types/database";

export interface PlanWeather {
    isRaining: boolean;
    windMph: number;
    temperatureF?: number;
}

export interface PlanReminder {
    stepId: string;
    kind: "action_due" | "check_due";
    title: string;
    reason: string;
}
