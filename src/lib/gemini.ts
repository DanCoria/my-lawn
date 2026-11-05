
import {
    isDiagnosisV2,
    isFollowUpComparison,
    isGuestDiagnosisPreview,
    type DiagnosisV2,
    type FollowUpComparison,
    type GuestDiagnosisPreview,
} from "@shared/diagnosis-contract";
import { supabase } from "@/lib/supabase";

export interface DiagnosisIssue {
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
}

export interface DiagnosisRecommendation {
    action: string;
    urgency: "low" | "medium" | "high";
    product_suggestion: string | null;
}

export interface Diagnosis {
    condition_score: number; // 1-10
    condition_label: string;
    summary: string;
    observations: string[];
    issues: DiagnosisIssue[];
    recommendations: DiagnosisRecommendation[];
}

export type DiagnosisMode = "guest_preview" | "personalized" | "follow_up";
export type DiagnosisSymptom = "brown" | "weeds" | "bare" | "thin" | "not_sure";

export interface BrowserDiagnosisContext {
    symptom?: DiagnosisSymptom;
    grass_type?: string;
    location_name?: string;
    date?: string;
    latitude?: number;
    longitude?: number;
    weather_summary?: string;
    recent_activity?: string[];
    user_observation?: string;
    original_diagnosis_summary?: string;
    elapsed_days?: number;
}

export interface BrowserDiagnosisRequest {
    mode: DiagnosisMode;
    requestId: string;
    imageBase64: string;
    mimeType: "image/jpeg" | "image/png";
    referenceImageBase64?: string;
    referenceMimeType?: "image/jpeg" | "image/png";
    context: BrowserDiagnosisContext;
}

export interface DiagnoseResponse {
    diagnosis: GuestDiagnosisPreview | DiagnosisV2 | FollowUpComparison;
    allowance: { source: "guest" | "welcome" | "monthly" };
    usage_event_id: string;
}

export function getRetakeGuidance(
    diagnosis: GuestDiagnosisPreview | DiagnosisV2 | FollowUpComparison,
): string | null {
    if (diagnosis.image_quality.usable) return null;
    return diagnosis.image_quality.retake_guidance
        ?? "Retake the photo in good light with the affected lawn area filling the frame.";
}

export class DiagnosisApiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly retryable: boolean;
    readonly resetAt: string | null;

    constructor(code: string, status: number, retryable: boolean, message: string, resetAt: string | null = null) {
        super(message);
        this.name = "DiagnosisApiError";
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.resetAt = resetAt;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeApiError(code: string, status: number, resetAt: string | null = null): DiagnosisApiError {
    if (code === "personal_allowance_exhausted") {
        return new DiagnosisApiError(
            code,
            status,
            false,
            "You’ve used your available lawn scans. Your next scan will be available after your allowance resets.",
            resetAt,
        );
    }
    if (["network_limit_exhausted", "global_limit_exhausted", "guest_global_limit_exhausted"].includes(code)) {
        return new DiagnosisApiError(
            code,
            status,
            false,
            "Lawn scans are temporarily at their safety limit. Please come back later.",
        );
    }
    if (code === "unknown_cooldown" || code === "request_in_flight" || code === "duplicate_request") {
        return new DiagnosisApiError(
            code,
            status,
            true,
            "Your previous lawn scan may still be processing. Wait two minutes before trying again.",
        );
    }
    if (status === 503 || code === "temporarily_unavailable" || code === "analysis_unavailable" || code === "circuit_open") {
        return new DiagnosisApiError(
            code,
            status,
            true,
            "Lawn analysis is temporarily unavailable. Please try again later.",
        );
    }
    if (status === 401 || code === "invalid_auth") {
        return new DiagnosisApiError(code, status, false, "Please sign in again before analyzing your lawn.");
    }
    if (status === 400 || status === 413) {
        return new DiagnosisApiError(
            code,
            status,
            false,
            "That photo could not be analyzed. Choose a clear JPG or PNG and try again.",
        );
    }
    return new DiagnosisApiError(
        code || "request_failed",
        status,
        status >= 500,
        "The lawn scan could not be completed. Please try again later.",
    );
}

function parseResponse(value: unknown, mode: DiagnosisMode): DiagnoseResponse | null {
    if (!isRecord(value) || !isRecord(value.allowance)) return null;
    const source = value.allowance.source;
    if (source !== "guest" && source !== "welcome" && source !== "monthly") return null;
    if (typeof value.usage_event_id !== "string") return null;
    const validDiagnosis = mode === "guest_preview"
        ? isGuestDiagnosisPreview(value.diagnosis)
        : mode === "follow_up"
          ? isFollowUpComparison(value.diagnosis)
          : isDiagnosisV2(value.diagnosis);
    if (!validDiagnosis) return null;
    return value as unknown as DiagnoseResponse;
}

export async function diagnoseLawn(
    request: BrowserDiagnosisRequest,
): Promise<DiagnoseResponse> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
        throw new DiagnosisApiError(
            "not_authenticated",
            401,
            false,
            "Please sign in again before analyzing your lawn.",
        );
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnose-lawn`;

    let response: Response;
    try {
        response = await fetch(functionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
                mode: request.mode,
                request_id: request.requestId,
                image: request.imageBase64,
                mime_type: request.mimeType,
                ...(request.referenceImageBase64 && request.referenceMimeType ? {
                    reference_image: request.referenceImageBase64,
                    reference_mime_type: request.referenceMimeType,
                } : {}),
                context: request.context,
            }),
        });
    } catch {
        throw new DiagnosisApiError(
            "network_error",
            0,
            true,
            "Lawn analysis could not be reached. Check your connection and try again.",
        );
    }

    if (!response.ok) {
        let code = "request_failed";
        let resetAt: string | null = null;
        try {
            const body: unknown = await response.json();
            if (isRecord(body)) {
                if (typeof body.error === "string") code = body.error;
                if (typeof body.reset_at === "string" && Number.isFinite(Date.parse(body.reset_at))) {
                    resetAt = body.reset_at;
                }
            }
        } catch {
            // The browser receives only the safe status-based fallback below.
        }
        throw safeApiError(code, response.status, resetAt);
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new DiagnosisApiError(
            "invalid_response",
            502,
            true,
            "Lawn analysis returned an unreadable result. Please try again later.",
        );
    }
    const parsed = parseResponse(body, request.mode);
    if (!parsed) {
        throw new DiagnosisApiError(
            "invalid_response",
            502,
            true,
            "Lawn analysis returned an unreadable result. Please try again later.",
        );
    }
    return parsed;
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
            const base64 = result.split(",")[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/** Resize image to a small thumbnail and return as a base64 data URL */
export function generateThumbnail(
    file: File,
    maxWidth = 300,
    maxHeight = 225
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
            const w = Math.round(img.width * ratio);
            const h = Math.round(img.height * ratio);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas not available"));
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(objectUrl);
            resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Failed to load image"));
        };
        img.src = objectUrl;
    });
}
/** 
 * Resizes an image for AI analysis. 
 * High enough for detail, but small enough to avoid Edge Function payload limits.
 * Returns raw base64 string (no prefix).
 */
export function resizeImageForAI(
    file: File,
    maxDimension = 1600
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            let w = img.width;
            let h = img.height;

            if (w > maxDimension || h > maxDimension) {
                if (w > h) {
                    h = Math.round((h * maxDimension) / w);
                    w = maxDimension;
                } else {
                    w = Math.round((w * maxDimension) / h);
                    h = maxDimension;
                }
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas not available"));

            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(objectUrl);

            // Get base64 and strip the prefix
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            resolve(dataUrl.split(",")[1]);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Failed to load image for resizing"));
        };
        img.src = objectUrl;
    });
}
