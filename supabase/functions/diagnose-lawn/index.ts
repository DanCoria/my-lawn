import { createClient } from "npm:@supabase/supabase-js@2.95.3";

import {
    createGeminiDiagnosisClient,
    GeminiProviderError,
    type GeminiDiagnosisResult,
    type GeminiTransport,
} from "../_shared/gemini-client.ts";
import {
    createDiagnoseHandler,
    type ReservationResult,
} from "./handler.ts";

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`Missing required server configuration: ${name}`);
    return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
    const value = Number(Deno.env.get(name) ?? fallback);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function bearerToken(request: Request): string | null {
    const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
    return match?.[1] ?? null;
}

function normalizedGatewayAddress(value: string | null): string | null {
    const address = value?.split(",", 1)[0]?.trim().replace(/^\[|\]$/g, "");
    if (!address || address.length > 128) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
        const octets = address.split(".").map(Number);
        return octets.every((octet) => octet >= 0 && octet <= 255)
            ? octets.join(".")
            : null;
    }
    try {
        const hostname = new URL(`http://[${address}]/`).hostname.replace(/^\[|\]$/g, "");
        return hostname.includes(":") ? hostname.toLowerCase() : null;
    } catch {
        return null;
    }
}

async function hmacSha256(secret: string, value: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const geminiTransport = (apiKey: string): GeminiTransport => async (request) => {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        { text: request.prompt },
                        ...(request.referenceImageBase64 && request.referenceMimeType
                            ? [{ inlineData: { mimeType: request.referenceMimeType, data: request.referenceImageBase64 } }]
                            : []),
                        { inlineData: { mimeType: request.mimeType, data: request.imageBase64 } },
                    ],
                }],
                generationConfig: request.generationConfig,
            }),
            signal: AbortSignal.timeout(30_000),
        },
    );

    if (!response.ok) {
        throw new GeminiProviderError(
            "transport_error",
            `Gemini request failed with status ${response.status}`,
        );
    }

    const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
            totalTokenCount?: number;
        };
    };
    const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
    return { text: text ?? "", usageMetadata: payload.usageMetadata };
};

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const networkSecret = requiredEnv("NETWORK_HMAC_SECRET");
const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});
const provider = createGeminiDiagnosisClient(
    {
        guestModel: requiredEnv("GEMINI_GUEST_MODEL"),
        diagnosisModel: requiredEnv("GEMINI_DIAGNOSIS_MODEL"),
    },
    geminiTransport(requiredEnv("GEMINI_API_KEY")),
);
const allowedOrigins = new Set(
    requiredEnv("APP_ALLOWED_ORIGINS")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
);
const scansEnabled = Deno.env.get("AI_SCANS_ENABLED") === "true";
const globalLimit = positiveIntegerEnv("AI_DAILY_GLOBAL_LIMIT", 100);
const guestLimit = positiveIntegerEnv("AI_DAILY_GUEST_LIMIT", 50);
const networkLimit = positiveIntegerEnv("AI_GUEST_NETWORK_LIMIT", 3);

const handler = createDiagnoseHandler({
    allowedOrigins,
    clock: () => new Date(),
    provider,
    authenticate: async (request) => {
        const token = bearerToken(request);
        if (!token) return null;
        const { data, error } = await service.auth.getUser(token);
        if (error || !data.user) return null;
        return {
            userId: data.user.id,
            isAnonymous: data.user.is_anonymous === true,
        };
    },
    // Supabase's gateway supplies x-real-ip. Client-provided body/header fields
    // never participate in guest throttling.
    getTrustedNetworkAddress: (request) => normalizedGatewayAddress(request.headers.get("x-real-ip")),
    hashNetworkAddress: (address) => hmacSha256(networkSecret, address),
    getRuntimeState: async () => {
        if (!scansEnabled) return { enabled: false, circuitOpenUntil: null };
        const { data, error } = await service.rpc("get_ai_runtime_state");
        if (error) throw error;
        const state = data as { circuit_open_until?: string | null } | null;
        return {
            enabled: true,
            circuitOpenUntil: state?.circuit_open_until ?? null,
        };
    },
    reserve: async (input): Promise<ReservationResult> => {
        const { data, error } = await service.rpc("reserve_ai_request_v2", {
            p_user_id: input.userId,
            p_is_anonymous: input.isAnonymous,
            p_network_hash: input.networkHash,
            p_request_key: input.requestId,
            p_route: input.route,
            p_global_limit: globalLimit,
            p_guest_limit: guestLimit,
            p_network_limit: networkLimit,
        });
        if (error) throw error;
        const result = data as Record<string, unknown>;
        if (result.allowed !== true) {
            return {
                allowed: false,
                reason: typeof result.reason === "string" ? result.reason : "reservation_rejected",
                duplicate: result.duplicate === true,
                resetAt: typeof result.reset_at === "string" ? result.reset_at : undefined,
            };
        }
        if (typeof result.event_id !== "string" || typeof result.allowance_source !== "string") {
            throw new Error("Invalid reservation response");
        }
        return {
            allowed: true,
            eventId: result.event_id,
            allowanceSource: result.allowance_source,
            duplicate: result.duplicate === true,
            status: typeof result.status === "string" ? result.status : undefined,
            existingDiagnosis: result.response_payload && typeof result.response_payload === "object"
                ? result.response_payload as GeminiDiagnosisResult["diagnosis"]
                : undefined,
        };
    },
    markStarted: async (eventId) => {
        const { data, error } = await service.rpc("mark_ai_request_started_v2", { p_event_id: eventId });
        if (error) throw error;
        const result = data as { started?: boolean; reason?: string } | null;
        return {
            started: result?.started === true,
            reason: result?.reason,
        };
    },
    finalize: async ({ eventId, usage, diagnosis }) => {
        const { error } = await service.rpc("finalize_ai_request_v2", {
            p_event_id: eventId,
            p_scan_id: null,
            p_usage: usage,
            p_response: diagnosis,
        });
        if (error) throw error;
    },
    fail: async ({ eventId, status, errorCode, usage }) => {
        const { error } = await service.rpc("fail_ai_request_v2", {
            p_event_id: eventId,
            p_status: status,
            p_error_code: errorCode.slice(0, 128),
            p_usage: usage ?? null,
        });
        if (error) throw error;
    },
    openCircuit: async () => {
        const { error } = await service.rpc("evaluate_ai_circuit");
        if (error) throw error;
    },
});

Deno.serve(handler);
