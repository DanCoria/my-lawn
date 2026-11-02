import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";

import type {
    GeminiDiagnosisClient,
    GeminiDiagnosisResult,
} from "../_shared/gemini-client.ts";
import { GeminiProviderError } from "../_shared/gemini-client.ts";

export interface DiagnoseRequest {
    mode: "guest_preview" | "personalized" | "follow_up";
    request_id: string;
    image: string;
    mime_type: "image/jpeg" | "image/png";
    context: Record<string, unknown>;
}

export interface AuthenticatedIdentity {
    userId: string;
    isAnonymous: boolean;
}

export interface ReservationInput {
    userId: string;
    isAnonymous: boolean;
    networkHash: string | null;
    requestId: string;
    route: DiagnoseRequest["mode"];
}

export type ReservationResult =
    | {
          allowed: true;
          eventId: string;
          allowanceSource: string;
          duplicate?: boolean;
          status?: string;
          existingDiagnosis?: GeminiDiagnosisResult["diagnosis"];
      }
    | { allowed: false; reason: string; duplicate?: boolean };

export interface RuntimeState {
    enabled: boolean;
    circuitOpenUntil: string | null;
}

export interface DiagnoseHandlerDependencies {
    authenticate(request: Request): Promise<AuthenticatedIdentity | null>;
    getTrustedNetworkAddress(request: Request): string | null;
    hashNetworkAddress(address: string): Promise<string>;
    reserve(input: ReservationInput): Promise<ReservationResult>;
    markStarted(eventId: string): Promise<{ started: boolean; reason?: string }>;
    finalize(input: {
        eventId: string;
        usage: GeminiDiagnosisResult["usage"];
        diagnosis: GeminiDiagnosisResult["diagnosis"];
    }): Promise<void>;
    fail(input: {
        eventId: string;
        status: "failed" | "unusable" | "unknown";
        errorCode: string;
        usage?: GeminiDiagnosisResult["usage"];
    }): Promise<void>;
    getRuntimeState(): Promise<RuntimeState>;
    openCircuit(error: unknown): Promise<void>;
    provider: GeminiDiagnosisClient;
    clock(): Date;
    allowedOrigins: ReadonlySet<string>;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_ENCODED_IMAGE_CHARS = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_ENCODED_IMAGE_CHARS + 16 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(origin: string | null, status: number, body: unknown): Response {
    const headers = new Headers({ "content-type": "application/json" });
    if (origin) headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const symptoms = new Set(["brown", "weeds", "bare", "thin", "not_sure"]);
const grassTypes = new Set([
    "bermuda", "st-augustine", "zoysia", "centipede", "bahia",
    "kentucky-bluegrass", "tall-fescue", "perennial-ryegrass", "fine-fescue",
]);
const contextKeys = {
    guest_preview: new Set(["symptom"]),
    personalized: new Set([
        "symptom", "grass_type", "location_name", "date", "latitude", "longitude",
        "weather_summary", "recent_activity",
    ]),
    follow_up: new Set([
        "symptom", "grass_type", "date", "weather_summary", "user_observation",
        "original_diagnosis_summary", "elapsed_days",
    ]),
} as const;

function boundedString(value: unknown, max = 240): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= max;
}

function sanitizeContext(
    mode: DiagnoseRequest["mode"],
    value: unknown,
): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    if (Object.keys(value).some((key) => !contextKeys[mode].has(key))) return null;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === "symptom") {
            if (typeof item !== "string" || !symptoms.has(item)) return null;
        } else if (key === "grass_type") {
            if (typeof item !== "string" || !grassTypes.has(item)) return null;
        } else if (key === "date") {
            if (typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item)) return null;
        } else if (key === "latitude") {
            if (typeof item !== "number" || !Number.isFinite(item) || item < -90 || item > 90) return null;
        } else if (key === "longitude") {
            if (typeof item !== "number" || !Number.isFinite(item) || item < -180 || item > 180) return null;
        } else if (key === "elapsed_days") {
            if (!Number.isInteger(item) || (item as number) < 0 || (item as number) > 365) return null;
        } else if (key === "recent_activity") {
            if (!Array.isArray(item) || item.length > 10 || item.some((entry) => !boundedString(entry, 160))) return null;
        } else if (!boundedString(item)) {
            return null;
        }
        output[key] = item;
    }
    if (mode === "guest_preview" && !symptoms.has(String(output.symptom))) return null;
    return JSON.stringify(output).length <= 4096 ? output : null;
}

function parseRequest(value: unknown): DiagnoseRequest | null {
    if (!isRecord(value)) return null;
    if (value.mode !== "guest_preview" && value.mode !== "personalized" && value.mode !== "follow_up") return null;
    if (typeof value.request_id !== "string" || !UUID_PATTERN.test(value.request_id)) return null;
    if (typeof value.image !== "string" || value.image.length === 0) return null;
    if (value.mime_type !== "image/jpeg" && value.mime_type !== "image/png") return null;
    const context = sanitizeContext(value.mode, value.context);
    if (!context) return null;
    return { ...value, mode: value.mode, request_id: value.request_id, image: value.image, mime_type: value.mime_type, context };
}

async function readJsonBody(request: Request): Promise<{ value?: unknown; error?: "too_large" | "invalid" }> {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return { error: "too_large" };
    if (!request.body) return { error: "invalid" };
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_REQUEST_BYTES) {
                await reader.cancel();
                return { error: "too_large" };
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return { value: JSON.parse(text) };
    } catch {
        return { error: "invalid" };
    }
}

function decodeBase64(value: string): Uint8Array | null {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    } catch {
        return null;
    }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || signature.some((byte, index) => bytes[index] !== byte)) return null;
    try {
        const decoded = decodePng(bytes, { checkCrc: true });
        return decoded.width > 0 && decoded.height > 0
            ? { width: decoded.width, height: decoded.height }
            : null;
    } catch {
        return null;
    }
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    try {
        const decoded = decodeJpeg(bytes, {
            useTArray: true,
            formatAsRGBA: false,
            tolerantDecoding: false,
            maxResolutionInMP: 2.56,
            maxMemoryUsageInMB: 32,
        });
        return decoded.width > 0 && decoded.height > 0
            ? { width: decoded.width, height: decoded.height }
            : null;
    } catch {
        return null;
    }
}

function reservationStatus(reason: string): number {
    if (reason === "request_in_flight" || reason === "unknown_cooldown") return 409;
    if (reason === "circuit_open") return 503;
    return 429;
}

function isTimeout(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "TimeoutError") return true;
    return error instanceof Error
        && "cause" in error
        && isTimeout((error as Error & { cause?: unknown }).cause);
}

export function createDiagnoseHandler(deps: DiagnoseHandlerDependencies) {
    return async (request: Request): Promise<Response> => {
        const origin = request.headers.get("origin");
        if (!origin || !deps.allowedOrigins.has(origin)) return response(null, 403, { error: "origin_not_allowed" });
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "access-control-allow-origin": origin,
                    "access-control-allow-headers": "authorization, apikey, content-type",
                    "access-control-allow-methods": "POST, OPTIONS",
                    vary: "Origin",
                },
            });
        }
        if (request.method !== "POST") return response(origin, 405, { error: "method_not_allowed" });

        const body = await readJsonBody(request);
        if (body.error === "too_large") return response(origin, 413, { error: "request_too_large" });
        if (body.error) return response(origin, 400, { error: "invalid_json" });
        const input = parseRequest(body.value);
        if (!input) return response(origin, 400, { error: "invalid_request" });

        const authorization = request.headers.get("authorization");
        if (!authorization?.match(/^Bearer\s+\S+$/i)) return response(origin, 401, { error: "invalid_auth" });
        const identity = await deps.authenticate(request);
        if (!identity) return response(origin, 401, { error: "invalid_auth" });
        if ((identity.isAnonymous && input.mode !== "guest_preview") || (!identity.isAnonymous && input.mode === "guest_preview")) {
            return response(origin, 403, { error: "invalid_session_route" });
        }

        let networkHash: string | null = null;
        if (identity.isAnonymous) {
            const address = deps.getTrustedNetworkAddress(request);
            if (!address) return response(origin, 403, { error: "guest_protection_unavailable" });
            networkHash = await deps.hashNetworkAddress(address);
        }

        if (input.image.length > MAX_ENCODED_IMAGE_CHARS) return response(origin, 400, { error: "invalid_image" });
        const bytes = decodeBase64(input.image);
        if (!bytes || bytes.byteLength > MAX_IMAGE_BYTES) return response(origin, 400, { error: "invalid_image" });
        const dimensions = input.mime_type === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
        if (!dimensions || Math.max(dimensions.width, dimensions.height) > MAX_IMAGE_DIMENSION) {
            return response(origin, 400, { error: "invalid_image_dimensions" });
        }

        let runtime: RuntimeState;
        try { runtime = await deps.getRuntimeState(); } catch { return response(origin, 503, { error: "temporarily_unavailable" }); }
        if (!runtime.enabled || (runtime.circuitOpenUntil && new Date(runtime.circuitOpenUntil) > deps.clock())) {
            return response(origin, 503, { error: "temporarily_unavailable" });
        }

        let reservation: ReservationResult;
        try {
            reservation = await deps.reserve({
                userId: identity.userId,
                isAnonymous: identity.isAnonymous,
                networkHash,
                requestId: input.request_id,
                route: input.mode,
            });
        } catch {
            return response(origin, 503, { error: "temporarily_unavailable" });
        }
        if (!reservation.allowed) {
            return response(origin, reservationStatus(reservation.reason), { error: reservation.reason });
        }
        if (reservation.duplicate) {
            if (reservation.status === "completed" && reservation.existingDiagnosis) {
                return response(origin, 200, {
                    diagnosis: reservation.existingDiagnosis,
                    allowance: { source: reservation.allowanceSource },
                    usage_event_id: reservation.eventId,
                });
            }
            return response(origin, 409, {
                error: "duplicate_request",
                status: reservation.status ?? "unknown",
                usage_event_id: reservation.eventId,
            });
        }

        try {
            const start = await deps.markStarted(reservation.eventId);
            if (!start.started) {
                return response(origin, reservationStatus(start.reason ?? "circuit_open"), {
                    error: start.reason ?? "temporarily_unavailable",
                });
            }
        } catch {
            await Promise.allSettled([
                deps.fail({ eventId: reservation.eventId, status: "failed", errorCode: "start_failed" }),
            ]);
            return response(origin, 503, { error: "temporarily_unavailable" });
        }
        let result: GeminiDiagnosisResult;
        try {
            result = await deps.provider.analyze({
                route: input.mode,
                imageBase64: input.image,
                mimeType: input.mime_type,
                context: input.context,
            });
        } catch (error) {
            const providerError = error instanceof GeminiProviderError ? error : null;
            const status = isTimeout(error) || providerError?.outcomeUnknown ? "unknown" : "failed";
            await Promise.allSettled([deps.fail({
                eventId: reservation.eventId,
                status,
                errorCode: providerError?.code ?? (error instanceof Error ? error.name : "provider_error"),
                usage: providerError?.usage,
            })]);
            await Promise.allSettled([deps.openCircuit(error)]);
            return response(origin, 503, { error: "analysis_unavailable" });
        }

        if (!result.diagnosis.image_quality.usable) {
            await Promise.allSettled([deps.fail({
                eventId: reservation.eventId,
                status: "unusable",
                errorCode: "image_unusable",
                usage: result.usage,
            })]);
        } else {
            try {
                await deps.finalize({
                    eventId: reservation.eventId,
                    usage: result.usage,
                    diagnosis: result.diagnosis,
                });
            } catch (error) {
                await Promise.allSettled([deps.fail({
                    eventId: reservation.eventId,
                    status: "unknown",
                    errorCode: "finalization_failed",
                    usage: result.usage,
                })]);
                await Promise.allSettled([deps.openCircuit(error)]);
                return response(origin, 503, { error: "analysis_unavailable" });
            }
        }
        return response(origin, 200, {
            diagnosis: result.diagnosis,
            allowance: { source: reservation.allowanceSource },
            usage_event_id: reservation.eventId,
        });
    };
}
