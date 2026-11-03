import type {
    BrowserDiagnosisContext,
    DiagnoseResponse,
    DiagnosisSymptom,
} from "@/lib/gemini";
import { diagnoseLawn } from "@/lib/gemini";
import type { GuestDiagnosisPreview } from "@shared/diagnosis-contract";

export interface AllowanceSummary {
    source: "guest" | "welcome" | "monthly";
}

export interface GuestPreviewInput {
    imageBase64: string;
    mimeType: "image/jpeg" | "image/png";
    symptom: DiagnosisSymptom;
    requestId: string;
}

export interface GuestPreviewResult {
    diagnosis: GuestDiagnosisPreview;
    allowance: AllowanceSummary;
}

export interface PersonalizedDiagnosisInput {
    imageBase64: string;
    mimeType: "image/jpeg" | "image/png";
    requestId: string;
    context: BrowserDiagnosisContext;
}

export async function runGuestPreview(
    input: GuestPreviewInput,
): Promise<GuestPreviewResult> {
    const result = await diagnoseLawn({
        mode: "guest_preview",
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        requestId: input.requestId,
        context: { symptom: input.symptom },
    });
    return {
        diagnosis: result.diagnosis as GuestDiagnosisPreview,
        allowance: result.allowance,
    };
}

export function runPersonalizedDiagnosis(
    input: PersonalizedDiagnosisInput,
): Promise<DiagnoseResponse> {
    return diagnoseLawn({ ...input, mode: "personalized" });
}
