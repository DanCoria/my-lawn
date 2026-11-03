import {
    isDiagnosisV2,
    isGuestDiagnosisPreview,
    type DiagnosisAlternative,
    type DiagnosisConfidence,
    type DiagnosisEvidence,
} from "@shared/diagnosis-contract";

export interface DisplayDiagnosis {
    likelyCause: string;
    confidence?: DiagnosisConfidence;
    summary: string;
    evidence: DiagnosisEvidence[];
    alternatives: DiagnosisAlternative[];
    safeNextStep: string;
    safetyNotes: string[];
    isLegacy: boolean;
    imageUsable: boolean;
    retakeGuidance?: string;
    canStartPlan: boolean;
}

const legacyNextStep = "Run a new scan when you want current, personalized guidance.";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : null;
}

const legacyScorePattern = /\b\d+(?:\.\d+)?\s*\/\s*10\b/i;
const legacyCommercialPattern = /\b(buy|purchase|shop|order|product|brand)\b/i;
const legacyBrandedActionPattern = /\b(?:Use|Apply)\s+[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*/;

function safeLegacyText(value: unknown): string | null {
    const text = nonEmptyString(value);
    if (
        !text
        || legacyScorePattern.test(text)
        || legacyCommercialPattern.test(text)
        || legacyBrandedActionPattern.test(text)
    ) return null;
    return text;
}

function legacyEvidence(value: unknown): DiagnosisEvidence[] {
    if (!isRecord(value) || !Array.isArray(value.observations)) return [];
    return value.observations
        .map(safeLegacyText)
        .filter((observation): observation is string => observation !== null)
        .slice(0, 10)
        .map((observation) => ({
            observation,
            significance: "Observation saved with this older scan.",
        }));
}

export function toDisplayDiagnosis(value: unknown): DisplayDiagnosis {
    if (isDiagnosisV2(value)) {
        return {
            likelyCause: value.likely_cause,
            confidence: value.confidence,
            summary: value.summary,
            evidence: value.evidence,
            alternatives: value.alternatives,
            safeNextStep: value.safe_next_step,
            safetyNotes: value.safety_notes,
            isLegacy: false,
            imageUsable: value.image_quality.usable,
            retakeGuidance: value.image_quality.retake_guidance,
            canStartPlan: value.image_quality.usable,
        };
    }

    if (isGuestDiagnosisPreview(value)) {
        return {
            likelyCause: value.likely_cause,
            confidence: value.confidence,
            summary: value.summary,
            evidence: [],
            alternatives: [],
            safeNextStep: value.safe_next_step,
            safetyNotes: [],
            isLegacy: false,
            imageUsable: value.image_quality.usable,
            retakeGuidance: value.image_quality.retake_guidance,
            canStartPlan: false,
        };
    }

    if (isRecord(value)) {
        const likelyCause = safeLegacyText(value.condition_label)
            ?? "Previous lawn scan";
        const summary = safeLegacyText(value.summary)
            ?? "This older scan does not contain enough detail to show a current diagnosis.";
        return {
            likelyCause,
            summary,
            evidence: legacyEvidence(value),
            alternatives: [],
            safeNextStep: legacyNextStep,
            safetyNotes: [],
            isLegacy: true,
            imageUsable: true,
            canStartPlan: false,
        };
    }

    return {
        likelyCause: "Previous lawn scan",
        summary: "This older scan does not contain enough detail to show a current diagnosis.",
        evidence: [],
        alternatives: [],
        safeNextStep: legacyNextStep,
        safetyNotes: [],
        isLegacy: true,
        imageUsable: true,
        canStartPlan: false,
    };
}
