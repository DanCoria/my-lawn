import { isDiagnosisV2, type DiagnosisV2 } from "@shared/diagnosis-contract";

import { supabase } from "@/lib/supabase";
import type { GrassType } from "@/types/database";

export interface ObservationProfileContext {
    grassType: GrassType;
    locationName?: string;
    areaLabel?: string;
}

export interface CreatedObservation {
    caseId: string;
    scanId: string;
}

function imageDetails(image: Blob): { contentType: "image/jpeg" | "image/png"; extension: "jpg" | "png" } {
    if (image.type === "image/jpeg") return { contentType: "image/jpeg", extension: "jpg" };
    if (image.type === "image/png") return { contentType: "image/png", extension: "png" };
    throw new Error("The saved photo must be a JPG or PNG image.");
}

async function requirePermanentOwner(expectedUserId: string): Promise<void> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== expectedUserId || data.user.is_anonymous === true) {
        throw new Error("A permanent account is required to save this lawn diagnosis.");
    }
}

export async function createObservationFromDiagnosis(
    userId: string,
    diagnosis: DiagnosisV2,
    image: Blob,
    profile: ObservationProfileContext,
): Promise<CreatedObservation> {
    if (!isDiagnosisV2(diagnosis) || !diagnosis.image_quality.usable) {
        throw new Error("A valid personalized diagnosis is required before saving a lawn observation.");
    }
    await requirePermanentOwner(userId);

    const { contentType, extension } = imageDetails(image);
    const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
    const storage = supabase.storage.from("lawn-scans");
    let caseId: string | null = null;

    const { error: uploadError } = await storage.upload(storagePath, image, {
        contentType,
        upsert: false,
    });
    if (uploadError) throw uploadError;

    try {
        const { data: lawnCase, error: caseError } = await supabase
            .from("lawn_cases")
            .insert({
                user_id: userId,
                status: "observation",
                is_primary: false,
                title: diagnosis.likely_cause,
                area_label: profile.areaLabel ?? profile.locationName ?? null,
                likely_cause: diagnosis.likely_cause,
                confidence: diagnosis.confidence,
                diagnosis,
                plan_seed: diagnosis.plan_seed,
            })
            .select("*")
            .single();
        if (caseError) throw caseError;
        const insertedCaseId = lawnCase.id;
        caseId = insertedCaseId;

        const { data: scan, error: scanError } = await supabase
            .from("lawn_scans")
            .insert({
                user_id: userId,
                image_url: storagePath,
                storage_path: storagePath,
                case_id: insertedCaseId,
                purpose: "initial",
                diagnosis_schema_version: 2,
                diagnosis,
            })
            .select("*")
            .single();
        if (scanError) throw scanError;

        return { caseId: insertedCaseId, scanId: scan.id };
    } catch (error) {
        if (caseId) {
            await supabase.from("lawn_cases").delete().eq("id", caseId);
        }
        await storage.remove([storagePath]);
        throw error;
    }
}

export async function startPrimaryPlan(
    caseId: string,
): Promise<{ caseId: string; stepIds: string[] }> {
    const { data: lawnCase, error: caseError } = await supabase
        .from("lawn_cases")
        .select("*")
        .eq("id", caseId)
        .single();
    if (caseError) throw caseError;
    if (!lawnCase || !isDiagnosisV2(lawnCase.diagnosis)) {
        throw new Error("This observation does not contain a valid personalized plan.");
    }

    const { error: startError } = await supabase.rpc("start_plan_from_observation", {
        p_case_id: caseId,
    });
    if (startError) throw startError;

    const { data: steps, error: stepsError } = await supabase
        .from("plan_steps")
        .select("*")
        .eq("case_id", caseId)
        .order("step_order", { ascending: true });
    if (stepsError) throw stepsError;

    return { caseId, stepIds: (steps ?? []).map((step) => step.id) };
}
