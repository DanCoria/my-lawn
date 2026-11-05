export type {
    AiUsageSummary,
    DiagnosisAlternative,
    DiagnosisConfidence,
    DiagnosisEvidence,
    DiagnosisV2,
    FollowUpComparison,
    FollowUpStatus,
    GuestDiagnosisPreview,
    ImageQuality,
    PlanSeed,
    PlanSeedCheckOption,
    PlanSeedStep,
} from "../../../shared/diagnosis-contract.ts";

export {
    isAiUsageSummary,
    isDiagnosisV2,
    isFollowUpComparison,
    isGuestDiagnosisPreview,
    isUsableDiagnosis,
} from "../../../shared/diagnosis-contract.ts";
