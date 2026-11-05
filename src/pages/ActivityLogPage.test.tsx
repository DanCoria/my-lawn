// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@/types/database";

const fullActivity: Activity = {
    id: "activity-1",
    user_id: "user-1",
    type: "mow",
    date: "2026-09-20",
    notes: "Manual mow — backyard notes",
    created_at: "2026-09-20T12:00:00.000Z",
};

function makeQueryBuilder(table: string) {
    let selection = "";

    const builder = {
        select(value: string) {
            selection = value;
            return builder;
        },
        eq() {
            return builder;
        },
        order() {
            return builder;
        },
        limit() {
            return builder;
        },
        maybeSingle() {
            return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
            let data: unknown[] = [];

            if (table === "activities" && selection === "type,date") {
                data = [{ type: fullActivity.type, date: fullActivity.date }];
            } else if (table === "activities" && selection === "*") {
                data = [fullActivity];
            }

            return Promise.resolve({ data, error: null }).then(resolve);
        },
    };

    return builder;
}

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: (table: string) => makeQueryBuilder(table),
    },
}));

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("@/contexts/LawnProfileContext", () => ({
    useGrassType: () => "bermuda",
    useLawnProfile: () => ({
        grassType: "bermuda",
        profile: {
            latitude: 32.7,
            longitude: -97.3,
            location_name: "Test Lawn",
        },
        loading: false,
    }),
}));

vi.mock("@/hooks/useGeolocation", () => ({
    useGeolocation: () => ({ location: null, loading: false }),
}));

vi.mock("@/lib/weather", () => ({
    fetchWeather: () => Promise.resolve({
        currentTemp: 75,
        currentWindSpeed: 5,
        isRaining: false,
        rainToday: 0,
        rainNext48h: 0,
        soilTemp: null,
        highToday: 80,
        lowToday: 60,
        conditions: "Clear",
    }),
    getWeatherAdvice: () => ({
        canMow: true,
        canWater: true,
        canFertilize: true,
        mowReason: "Good conditions",
        waterReason: "Water if needed",
        fertReason: "Safe to fertilize",
    }),
}));

vi.mock("@/features/plans/api", () => ({
    usePrimaryCase: () => ({ data: null, isLoading: false }),
    usePlanSteps: () => ({ data: [], isLoading: false }),
    useCompletePlanStep: () => ({ mutate: vi.fn(), isPending: false }),
    usePostponePlanStep: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { TodayPage } from "@/pages/TodayPage";
import { ActivityLogPage } from "@/pages/ActivityLogPage";

afterEach(() => {
    vi.clearAllMocks();
});

function renderPage(page: React.ReactNode, queryClient: QueryClient) {
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                {page}
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe("activity query cache", () => {
    it("keeps complete activity ids, notes, and deletion controls when navigating from Today to Progress", async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity, retry: false } },
        });

        const dashboard = renderPage(<TodayPage />, queryClient);

        await waitFor(() => {
            expect(queryClient.getQueryData(["activities", "user-1"])).toBeDefined();
        });
        dashboard.unmount();

        const activityLog = renderPage(<ActivityLogPage embedded />, queryClient);

        await waitFor(() => {
            expect(activityLog.container.querySelector('[id^="delete-activity-"]')).not.toBeNull();
        });
        const deleteButton = activityLog.container.querySelector('[id^="delete-activity-"]');
        expect(deleteButton?.getAttribute("id")).toBe("delete-activity-activity-1");
        expect(activityLog.getByText("Manual mow — backyard notes")).toBeTruthy();
        expect(activityLog.getByPlaceholderText(/mowed at 3 inches/i)).toBeTruthy();
    });
});
