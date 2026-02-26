
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
import { supabase } from "@/lib/supabase";

export async function diagnoseLawn(
    imageBase64: string,
    mimeType: string,
    date: Date
): Promise<Diagnosis> {
    const dateStr = date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    // Get the user's JWT for authentication
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
        throw new Error("Not authenticated — please log in and try again.");
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnose-lawn`;

    const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ image: imageBase64, mimeType, dateStr }),
    });

    if (!response.ok) {
        // Parse the error body from our Edge Function
        let message = `Edge Function failed (${response.status})`;
        try {
            const body = await response.json();
            if (body.error) message = body.error;
        } catch {
            // body wasn't JSON, use default message
        }
        throw new Error(message);
    }

    return await response.json();
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
