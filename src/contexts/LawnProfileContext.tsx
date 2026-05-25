import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { GrassType, UserProfile } from "@/types/database";

interface LawnProfileContextType {
    profile: UserProfile | null;
    grassType: GrassType;
    loading: boolean;
    needsOnboarding: boolean;
    updateGrassType: (grassType: GrassType) => Promise<void>;
    completeOnboarding: (
        grassType: GrassType,
        location?: { lat: number; lon: number; zipCode: string; name: string } | null
    ) => Promise<void>;
    updateLocation: (lat: number, lon: number, zipCode: string, name: string) => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const LawnProfileContext = createContext<LawnProfileContextType | null>(null);

export function LawnProfileProvider({ children }: { children: ReactNode }) {
    const { user, loading: authLoading } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    // Track which userId we've completed a fetch for.
    // needsOnboarding only fires once fetchedForUserId === user.id,
    // preventing false redirects during the async gap between sign-in and profile fetch.
    const [fetchedForUserId, setFetchedForUserId] = useState<string | null>(null);

    const fetchProfile = useCallback(async () => {
        if (!user) {
            setProfile(null);
            setFetchedForUserId(null);
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle();

            if (error) {
                console.error("Error fetching profile:", error);
            }
            setProfile(data as UserProfile | null);
            setFetchedForUserId(user.id);
        } catch (err) {
            console.error("Profile fetch failed:", err);
            setFetchedForUserId(user.id); // mark as done even on error
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!authLoading) {
            fetchProfile();
        }
    }, [authLoading, fetchProfile]);

    const completeOnboarding = async (
        grassType: GrassType,
        location?: { lat: number; lon: number; zipCode: string; name: string } | null
    ) => {
        if (!user) throw new Error("Not authenticated");

        const insertData = {
            id: user.id,
            grass_type: grassType,
            onboarding_completed: true,
            latitude: location?.lat ?? null,
            longitude: location?.lon ?? null,
            zip_code: location?.zipCode ?? null,
            location_name: location?.name ?? null,
        };

        let result = await supabase
            .from("user_profiles")
            .insert(insertData)
            .select()
            .single();

        if (result.error) {
            // Row already exists (e.g. user went back and re-submitted) — update instead
            if (result.error.code === "23505") {
                const updateData = {
                    grass_type: grassType,
                    onboarding_completed: true,
                    latitude: location?.lat ?? null,
                    longitude: location?.lon ?? null,
                    zip_code: location?.zipCode ?? null,
                    location_name: location?.name ?? null,
                };
                result = await supabase
                    .from("user_profiles")
                    .update(updateData)
                    .eq("id", user.id)
                    .select()
                    .single();
            }
            if (result.error) {
                console.error("completeOnboarding error:", result.error);
                throw result.error;
            }
        }

        setProfile(result.data as UserProfile);
    };

    const updateGrassType = async (grassType: GrassType) => {
        if (!user || !profile) throw new Error("No profile to update");

        const { data, error } = await supabase
            .from("user_profiles")
            .update({ grass_type: grassType })
            .eq("id", user.id)
            .select()
            .single();

        if (error) throw error;
        setProfile(data as UserProfile);
    };

    const updateLocation = async (lat: number, lon: number, zipCode: string, name: string) => {
        if (!user || !profile) throw new Error("No profile to update");

        const { data, error } = await supabase
            .from("user_profiles")
            .update({
                latitude: lat,
                longitude: lon,
                zip_code: zipCode,
                location_name: name,
            })
            .eq("id", user.id)
            .select()
            .single();

        if (error) throw error;
        setProfile(data as UserProfile);
    };

    const refreshProfile = async () => {
        await fetchProfile();
    };

    // Only true once the profile fetch has completed for the current user.
    // Guarding on fetchedForUserId prevents the race where user=present but
    // profile is still null because the DB fetch hasn't returned yet.
    const needsOnboarding =
        !loading &&
        !authLoading &&
        !!user &&
        fetchedForUserId === user.id &&
        (!profile || !profile.onboarding_completed);
    const grassType: GrassType = profile?.grass_type ?? "bermuda";

    return (
        <LawnProfileContext.Provider
            value={{
                profile,
                grassType,
                loading: loading || authLoading,
                needsOnboarding,
                updateGrassType,
                completeOnboarding,
                updateLocation,
                refreshProfile,
            }}
        >
            {children}
        </LawnProfileContext.Provider>
    );
}

export function useLawnProfile() {
    const ctx = useContext(LawnProfileContext);
    if (!ctx) throw new Error("useLawnProfile must be used within LawnProfileProvider");
    return ctx;
}

/** Convenience hook — returns just the grass type string */
export function useGrassType(): GrassType {
    const { grassType } = useLawnProfile();
    return grassType;
}
