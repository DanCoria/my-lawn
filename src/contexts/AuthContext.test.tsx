// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const authMocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInAnonymously: vi.fn(),
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
    supabase: {
        auth: {
            getSession: authMocks.getSession,
            onAuthStateChange: authMocks.onAuthStateChange,
            signInAnonymously: authMocks.signInAnonymously,
            updateUser: authMocks.updateUser,
            signInWithPassword: authMocks.signInWithPassword,
            signOut: authMocks.signOut,
        },
        from: authMocks.from,
    },
}));

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: "user-123",
        aud: "authenticated",
        role: "authenticated",
        email: "person@example.com",
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: "2026-11-01T12:00:00.000Z",
        ...overrides,
    };
}

function makeSession(user: User): Session {
    return {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user,
    };
}

let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
    const auth = useAuth();
    latestAuth = auth;
    return <div data-testid="session-kind">{auth.sessionKind}</div>;
}

async function renderWithSession(session: Session | null) {
    authMocks.getSession.mockResolvedValue({
        data: { session },
        error: null,
    });
    render(
        <AuthProvider>
            <Probe />
        </AuthProvider>,
    );
    await waitFor(() => expect(latestAuth?.loading).toBe(false));
}

describe("AuthProvider guest conversion operations", () => {
    beforeEach(() => {
        latestAuth = null;
        authMocks.onAuthStateChange.mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } },
        });
        authMocks.signOut.mockResolvedValue({ error: null });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test("derives anonymous and permanent state only from trusted user fields", async () => {
        const metadataSpoofedUser = makeUser({
            is_anonymous: false,
            user_metadata: { is_anonymous: true },
        });
        await renderWithSession(makeSession(metadataSpoofedUser));
        expect(screen.getByTestId("session-kind").textContent).toBe("permanent");

        const authChange = authMocks.onAuthStateChange.mock.calls[0][0];
        act(() => {
            authChange(
                "SIGNED_IN",
                makeSession(makeUser({ is_anonymous: true })),
            );
        });
        expect(screen.getByTestId("session-kind").textContent).toBe("anonymous");

        act(() => authChange("SIGNED_OUT", null));
        expect(screen.getByTestId("session-kind").textContent).toBe("none");
    });

    test("passes the Turnstile token when creating an anonymous session", async () => {
        const anonymousUser = makeUser({ is_anonymous: true });
        authMocks.signInAnonymously.mockResolvedValue({
            data: { user: anonymousUser, session: makeSession(anonymousUser) },
            error: null,
        });
        await renderWithSession(null);

        let returnedUser: User | undefined;
        await act(async () => {
            returnedUser = await latestAuth!.ensureAnonymousSession(
                "turnstile-token",
            );
        });

        expect(returnedUser).toEqual(anonymousUser);
        expect(authMocks.signInAnonymously).toHaveBeenCalledWith({
            options: { captchaToken: "turnstile-token" },
        });
    });

    test("links an email to the current anonymous user through updateUser", async () => {
        authMocks.updateUser.mockResolvedValue({
            data: { user: makeUser({ email: "new@example.com" }) },
            error: null,
        });
        await renderWithSession(
            makeSession(makeUser({ is_anonymous: true, email: undefined })),
        );

        await act(async () => {
            await latestAuth!.linkAnonymousEmail("new@example.com");
        });

        expect(authMocks.updateUser).toHaveBeenCalledWith({
            email: "new@example.com",
        });
    });

    test("signs into an existing account without reassigning anonymous rows", async () => {
        authMocks.signInWithPassword.mockResolvedValue({
            data: {
                user: makeUser({ id: "existing-user" }),
                session: makeSession(makeUser({ id: "existing-user" })),
            },
            error: null,
        });
        await renderWithSession(
            makeSession(makeUser({ is_anonymous: true, email: undefined })),
        );

        await act(async () => {
            await latestAuth!.signIntoExistingAccount(
                "owner@example.com",
                "correct horse battery staple",
            );
        });

        expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
            email: "owner@example.com",
            password: "correct horse battery staple",
        });
        expect(authMocks.from).not.toHaveBeenCalled();
        expect(authMocks.signOut).not.toHaveBeenCalled();
    });
});
