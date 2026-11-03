import {
    isGuestDiagnosisPreview,
    type GuestDiagnosisPreview,
} from "@shared/diagnosis-contract";

export const GUEST_DRAFT_DATABASE_NAME = "my-lawn-guest-draft";
export const GUEST_DRAFT_STORE_NAME = "drafts";

const DATABASE_VERSION = 1;
const ACTIVE_DRAFT_KEY = "active";
const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

export interface GuestDraft {
    version: 1;
    image: Blob;
    previewUrlData?: string;
    symptom: string;
    previewDiagnosis: GuestDiagnosisPreview;
    requestId: string;
    createdAt: number;
}

export interface GuestDraftStoreOptions {
    indexedDB?: IDBFactory;
    now?: number;
}

function getIndexedDB(options?: GuestDraftStoreOptions): IDBFactory {
    const factory = options?.indexedDB ?? globalThis.indexedDB;
    if (!factory) {
        throw new Error("Guest draft storage is unavailable in this browser.");
    }
    return factory;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(
            GUEST_DRAFT_DATABASE_NAME,
            DATABASE_VERSION,
        );
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(GUEST_DRAFT_STORE_NAME)) {
                database.createObjectStore(GUEST_DRAFT_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
            reject(new Error("Guest draft storage upgrade was blocked."));
    });
}

async function runRequest<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
    options?: GuestDraftStoreOptions,
): Promise<T> {
    const database = await openDatabase(getIndexedDB(options));
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = database.transaction(
                GUEST_DRAFT_STORE_NAME,
                mode,
            );
            const request = action(
                transaction.objectStore(GUEST_DRAFT_STORE_NAME),
            );
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        database.close();
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isStoredGuestDraft(value: unknown): value is GuestDraft {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    const allowedKeys = new Set([
        "version",
        "image",
        "previewUrlData",
        "symptom",
        "previewDiagnosis",
        "requestId",
        "createdAt",
    ]);

    return (
        Object.keys(record).every((key) => allowedKeys.has(key)) &&
        record.version === 1 &&
        record.image instanceof Blob &&
        record.image.size > 0 &&
        (record.previewUrlData === undefined ||
            (typeof record.previewUrlData === "string" &&
                record.previewUrlData.startsWith("data:image/"))) &&
        isNonEmptyString(record.symptom) &&
        isGuestDiagnosisPreview(record.previewDiagnosis) &&
        isNonEmptyString(record.requestId) &&
        typeof record.createdAt === "number" &&
        Number.isFinite(record.createdAt)
    );
}

export function isGuestDraftExpired(
    draft: Pick<GuestDraft, "createdAt">,
    now = Date.now(),
): boolean {
    return now - draft.createdAt >= GUEST_DRAFT_TTL_MS;
}

export async function saveGuestDraft(
    draft: GuestDraft,
    options?: GuestDraftStoreOptions,
): Promise<void> {
    if (!isStoredGuestDraft(draft)) {
        throw new Error("Cannot save an invalid guest draft.");
    }
    await runRequest(
        "readwrite",
        (store) => store.put(draft, ACTIVE_DRAFT_KEY),
        options,
    );
}

export async function clearGuestDraft(
    options?: GuestDraftStoreOptions,
): Promise<void> {
    await runRequest(
        "readwrite",
        (store) => store.delete(ACTIVE_DRAFT_KEY),
        options,
    );
}

export async function loadGuestDraft(
    options?: GuestDraftStoreOptions,
): Promise<GuestDraft | null> {
    const value = await runRequest<unknown>(
        "readonly",
        (store) => store.get(ACTIVE_DRAFT_KEY),
        options,
    );
    if (value === undefined) return null;

    if (
        !isStoredGuestDraft(value) ||
        isGuestDraftExpired(value, options?.now ?? Date.now())
    ) {
        await clearGuestDraft(options);
        return null;
    }

    return value;
}
