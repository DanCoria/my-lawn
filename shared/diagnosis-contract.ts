export type DiagnosisConfidence = "low" | "medium" | "high";

export interface ImageQuality {
    usable: boolean;
    retake_guidance?: string;
}

export interface DiagnosisEvidence {
    observation: string;
    significance: string;
}

export interface DiagnosisAlternative {
    cause: string;
    reason: string;
    verification: string;
}

export interface PlanSeedCheckOption {
    value: string;
    label: string;
    next_order?: number;
}

export interface PlanSeedStep {
    order: number;
    kind: "action" | "check";
    title: string;
    instructions: string;
    due_in_days: number;
    follow_up_in_days?: number;
    check_options?: PlanSeedCheckOption[];
}

export interface PlanSeed {
    summary: string;
    steps: PlanSeedStep[];
}

export interface GuestDiagnosisPreview {
    schema_version: "guest-preview-1";
    image_quality: ImageQuality;
    likely_cause: string;
    confidence: DiagnosisConfidence;
    summary: string;
    safe_next_step: string;
}

export interface DiagnosisV2 {
    schema_version: 2;
    image_quality: ImageQuality;
    likely_cause: string;
    confidence: DiagnosisConfidence;
    summary: string;
    evidence: DiagnosisEvidence[];
    alternatives: DiagnosisAlternative[];
    safe_next_step: string;
    safety_notes: string[];
    treatment_category?: string;
    active_ingredient?: string;
    plan_seed: PlanSeed;
}

export type FollowUpStatus =
    | "improving"
    | "unchanged"
    | "worsening"
    | "resolved"
    | "unable_to_determine";

export interface FollowUpComparison {
    schema_version: "follow-up-1";
    image_quality: ImageQuality;
    status: FollowUpStatus;
    summary: string;
    evidence: string[];
}

export interface AiUsageSummary {
    model: string;
    input_tokens: number;
    output_tokens: number;
    thought_tokens: number;
    total_tokens: number;
    metadata_complete: boolean;
}

type UnknownRecord = Record<string, unknown>;

const CONFIDENCE_VALUES = new Set<DiagnosisConfidence>([
    "low",
    "medium",
    "high",
]);
const FOLLOW_UP_STATUS_VALUES = new Set<FollowUpStatus>([
    "improving", "unchanged", "worsening", "resolved", "unable_to_determine",
]);

function isRecord(value: unknown): value is UnknownRecord {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype
    );
}

function hasExactKeys(
    value: UnknownRecord,
    required: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const keys = Object.keys(value);
    const allowed = new Set([...required, ...optional]);

    return (
        required.every((key) =>
            Object.prototype.hasOwnProperty.call(value, key),
        ) &&
        keys.every((key) => allowed.has(key))
    );
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) >= 0;
}

function isImageQuality(value: unknown): value is ImageQuality {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ["usable"], ["retake_guidance"]) ||
        typeof value.usable !== "boolean"
    ) {
        return false;
    }

    if (
        value.retake_guidance !== undefined &&
        !isNonEmptyString(value.retake_guidance)
    ) {
        return false;
    }

    return value.usable || isNonEmptyString(value.retake_guidance);
}

function isConfidence(value: unknown): value is DiagnosisConfidence {
    return (
        typeof value === "string" &&
        CONFIDENCE_VALUES.has(value as DiagnosisConfidence)
    );
}

function isEvidence(value: unknown): value is DiagnosisEvidence {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["observation", "significance"]) &&
        isNonEmptyString(value.observation) &&
        isNonEmptyString(value.significance)
    );
}

function isAlternative(value: unknown): value is DiagnosisAlternative {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["cause", "reason", "verification"]) &&
        isNonEmptyString(value.cause) &&
        isNonEmptyString(value.reason) &&
        isNonEmptyString(value.verification)
    );
}

function isCheckOption(value: unknown): value is PlanSeedCheckOption {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["value", "label"], ["next_order"]) &&
        isNonEmptyString(value.value) &&
        isNonEmptyString(value.label) &&
        (value.next_order === undefined ||
            (isNonNegativeInteger(value.next_order) && value.next_order > 0))
    );
}

function isPlanSeedStep(value: unknown): value is PlanSeedStep {
    if (
        !isRecord(value) ||
        !hasExactKeys(
            value,
            ["order", "kind", "title", "instructions", "due_in_days"],
            ["follow_up_in_days", "check_options"],
        ) ||
        !isNonNegativeInteger(value.order) ||
        value.order < 1 ||
        (value.kind !== "action" && value.kind !== "check") ||
        !isNonEmptyString(value.title) ||
        !isNonEmptyString(value.instructions) ||
        !isNonNegativeInteger(value.due_in_days) ||
        (value.follow_up_in_days !== undefined &&
            !isNonNegativeInteger(value.follow_up_in_days))
    ) {
        return false;
    }

    if (value.kind === "action") {
        return value.check_options === undefined;
    }

    return (
        Array.isArray(value.check_options) &&
        value.check_options.length > 0 &&
        value.check_options.every(isCheckOption)
    );
}

function isPlanSeed(value: unknown): value is PlanSeed {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["summary", "steps"]) &&
        isNonEmptyString(value.summary) &&
        Array.isArray(value.steps) &&
        value.steps.length > 0 &&
        value.steps.every(isPlanSeedStep)
    );
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isNonEmptyString);
}

export function isGuestDiagnosisPreview(
    value: unknown,
): value is GuestDiagnosisPreview {
    return (
        isRecord(value) &&
        hasExactKeys(value, [
            "schema_version",
            "image_quality",
            "likely_cause",
            "confidence",
            "summary",
            "safe_next_step",
        ]) &&
        value.schema_version === "guest-preview-1" &&
        isImageQuality(value.image_quality) &&
        isNonEmptyString(value.likely_cause) &&
        isConfidence(value.confidence) &&
        isNonEmptyString(value.summary) &&
        isNonEmptyString(value.safe_next_step)
    );
}

export function isDiagnosisV2(value: unknown): value is DiagnosisV2 {
    return (
        isRecord(value) &&
        hasExactKeys(
            value,
            [
                "schema_version",
                "image_quality",
                "likely_cause",
                "confidence",
                "summary",
                "evidence",
                "alternatives",
                "safe_next_step",
                "safety_notes",
                "plan_seed",
            ],
            ["treatment_category", "active_ingredient"],
        ) &&
        value.schema_version === 2 &&
        isImageQuality(value.image_quality) &&
        isNonEmptyString(value.likely_cause) &&
        isConfidence(value.confidence) &&
        isNonEmptyString(value.summary) &&
        Array.isArray(value.evidence) &&
        value.evidence.length > 0 &&
        value.evidence.every(isEvidence) &&
        Array.isArray(value.alternatives) &&
        value.alternatives.every(isAlternative) &&
        isNonEmptyString(value.safe_next_step) &&
        isStringArray(value.safety_notes) &&
        (value.treatment_category === undefined ||
            isNonEmptyString(value.treatment_category)) &&
        (value.active_ingredient === undefined ||
            isNonEmptyString(value.active_ingredient)) &&
        isPlanSeed(value.plan_seed)
    );
}

export function isFollowUpComparison(value: unknown): value is FollowUpComparison {
    return (
        isRecord(value)
        && hasExactKeys(value, ["schema_version", "image_quality", "status", "summary", "evidence"])
        && value.schema_version === "follow-up-1"
        && isImageQuality(value.image_quality)
        && typeof value.status === "string"
        && FOLLOW_UP_STATUS_VALUES.has(value.status as FollowUpStatus)
        && isNonEmptyString(value.summary)
        && isStringArray(value.evidence)
    );
}

export function isUsableDiagnosis(
    value: unknown,
): value is GuestDiagnosisPreview | DiagnosisV2 | FollowUpComparison {
    if (isGuestDiagnosisPreview(value) || isDiagnosisV2(value) || isFollowUpComparison(value)) {
        return value.image_quality.usable;
    }

    return false;
}

export function isAiUsageSummary(value: unknown): value is AiUsageSummary {
    return (
        isRecord(value) &&
        hasExactKeys(value, [
            "model",
            "input_tokens",
            "output_tokens",
            "thought_tokens",
            "total_tokens",
            "metadata_complete",
        ]) &&
        isNonEmptyString(value.model) &&
        isNonNegativeInteger(value.input_tokens) &&
        isNonNegativeInteger(value.output_tokens) &&
        isNonNegativeInteger(value.thought_tokens) &&
        isNonNegativeInteger(value.total_tokens) &&
        typeof value.metadata_complete === "boolean"
    );
}
