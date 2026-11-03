import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import type { GuestDiagnosisPreview } from "@shared/diagnosis-contract";
import {
    GUEST_DRAFT_DATABASE_NAME,
    GUEST_DRAFT_STORE_NAME,
    clearGuestDraft,
    isGuestDraftExpired,
    loadGuestDraft,
    saveGuestDraft,
    type GuestDraft,
} from "./guestDraft";

const previewDiagnosis: GuestDiagnosisPreview = {
    schema_version: "guest-preview-1",
    image_quality: { usable: true },
    likely_cause: "Possible drought stress",
    confidence: "medium",
    summary: "The blades appear folded and dry.",
    safe_next_step: "Check the soil moisture before watering.",
};

function makeDraft(createdAt = Date.UTC(2026, 10, 1, 12)): GuestDraft {
    return {
        version: 1,
        image: new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png",
        }),
        previewUrlData: "data:image/png;base64,iVBORw==",
        symptom: "A dry brown patch near the sidewalk",
        previewDiagnosis,
        requestId: "guest-request-123",
        createdAt,
    };
}

function writeRawRecord(indexedDB: IDBFactory, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(GUEST_DRAFT_DATABASE_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
                GUEST_DRAFT_STORE_NAME,
                "readwrite",
            );
            transaction.objectStore(GUEST_DRAFT_STORE_NAME).put(value, "active");
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        };
    });
}

describe("guest draft persistence", () => {
    let indexedDB: IDBFactory;

    beforeEach(() => {
        indexedDB = new IDBFactory();
    });

    test("round-trips the guest image Blob without uploading it", async () => {
        const draft = makeDraft();

        await saveGuestDraft(draft, { indexedDB });
        const restored = await loadGuestDraft({
            indexedDB,
            now: draft.createdAt + 1_000,
        });

        expect(restored).not.toBeNull();
        expect(restored?.image).toBeInstanceOf(Blob);
        expect(restored?.image.type).toBe("image/png");
        expect(Array.from(new Uint8Array(await restored!.image.arrayBuffer()))).toEqual([
            137,
            80,
            78,
            71,
        ]);
        expect(restored).toMatchObject({
            symptom: draft.symptom,
            requestId: "guest-request-123",
            previewDiagnosis,
        });
    });

    test("expires drafts at 24 hours and purges the stored Blob", async () => {
        const draft = makeDraft();
        await saveGuestDraft(draft, { indexedDB });

        expect(isGuestDraftExpired(draft, draft.createdAt + 86_399_999)).toBe(false);
        expect(isGuestDraftExpired(draft, draft.createdAt + 86_400_000)).toBe(true);
        expect(
            await loadGuestDraft({
                indexedDB,
                now: draft.createdAt + 86_400_000,
            }),
        ).toBeNull();
        expect(
            await loadGuestDraft({ indexedDB, now: draft.createdAt + 1_000 }),
        ).toBeNull();
    });

    test("clear removes the complete draft including its image Blob", async () => {
        const draft = makeDraft();
        await saveGuestDraft(draft, { indexedDB });

        await clearGuestDraft({ indexedDB });

        expect(
            await loadGuestDraft({ indexedDB, now: draft.createdAt + 1_000 }),
        ).toBeNull();
    });

    test("purges a corrupted record instead of returning partial guest data", async () => {
        const draft = makeDraft();
        await saveGuestDraft(draft, { indexedDB });
        await writeRawRecord(indexedDB, {
            ...draft,
            image: "not-a-blob",
            previewDiagnosis: { schema_version: "unexpected" },
        });

        expect(
            await loadGuestDraft({ indexedDB, now: draft.createdAt + 1_000 }),
        ).toBeNull();
        expect(
            await loadGuestDraft({ indexedDB, now: draft.createdAt + 1_000 }),
        ).toBeNull();
    });
});
