import { useState, useEffect } from "react";

export interface UserLocation {
    lat: number;
    lon: number;
}

// Default: Dallas, TX
const DEFAULT_LOCATION: UserLocation = { lat: 32.78, lon: -96.80 };
const STORAGE_KEY = "my-lawn-location";

/**
 * Hook that returns the user's geolocation.
 * - Requests browser location on first use
 * - Caches the result in localStorage so it doesn't re-prompt
 * - Falls back to Dallas, TX if denied or unavailable
 */
export function useGeolocation() {
    const [location, setLocation] = useState<UserLocation | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check cache first
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
            try {
                setLocation(JSON.parse(cached));
                setLoading(false);
                return;
            } catch {
                localStorage.removeItem(STORAGE_KEY);
            }
        }

        // Request from browser
        if (!navigator.geolocation) {
            setLocation(DEFAULT_LOCATION);
            setLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc: UserLocation = {
                    lat: Math.round(position.coords.latitude * 100) / 100,
                    lon: Math.round(position.coords.longitude * 100) / 100,
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
                setLocation(loc);
                setLoading(false);
            },
            () => {
                // Denied or error — fall back to default
                setLocation(DEFAULT_LOCATION);
                setLoading(false);
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    }, []);

    return { location, loading };
}
