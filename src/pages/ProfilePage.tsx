import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLawnProfile } from "@/contexts/LawnProfileContext";
import { GRASS_TYPES, getGrassTypeInfo } from "@/lib/lawnLogic";
import { BottomNav } from "@/components/BottomNav";
import type { GrassType } from "@/types/database";
import {
    User,
    Leaf,
    ChevronRight,
    LogOut,
    Check,
    Loader2,
    Sun,
    Snowflake,
    ArrowLeft,
    MapPin,
    Search,
} from "lucide-react";

export function ProfilePage() {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const { profile, grassType, updateGrassType, updateLocation } = useLawnProfile();
    const grassInfo = getGrassTypeInfo(grassType);

    const [editingGrass, setEditingGrass] = useState(false);
    const [pendingGrass, setPendingGrass] = useState<GrassType>(grassType);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // New Location States
    const [editingLocation, setEditingLocation] = useState(false);
    const [detectingLocation, setDetectingLocation] = useState(false);
    const [locationResolved, setLocationResolved] = useState(profile?.latitude ? true : false);
    const [locationName, setLocationName] = useState(profile?.location_name || "");
    const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(
        profile?.latitude && profile?.longitude
            ? { lat: profile.latitude, lon: profile.longitude }
            : null
    );
    const [zipCode, setZipCode] = useState(profile?.zip_code || "");
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [locationSaving, setLocationSaving] = useState(false);
    const [locationSuccess, setLocationSuccess] = useState(false);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchQuery.trim().length >= 3 && !locationResolved) {
                const query = searchQuery.split(",")[0].trim();
                setSearching(true);
                setSearchError(null);
                fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.results) {
                            setSearchResults(data.results);
                        } else {
                            setSearchResults([]);
                        }
                    })
                    .catch(err => {
                        console.error("Autocomplete fetch error:", err);
                    })
                    .finally(() => {
                        setSearching(false);
                    });
            } else {
                setSearchResults([]);
            }
        }, 400);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, locationResolved]);

    const handleSaveGrass = async () => {
        if (pendingGrass === grassType) {
            setEditingGrass(false);
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            await updateGrassType(pendingGrass);
            setSuccess(true);
            setEditingGrass(false);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update");
        } finally {
            setSaving(false);
        }
    };

    const handleGPSDetect = () => {
        setDetectingLocation(true);
        setSearchError(null);
        if (!navigator.geolocation) {
            setSearchError("Geolocation is not supported by your browser");
            setDetectingLocation(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = Math.round(position.coords.latitude * 100) / 100;
                const lon = Math.round(position.coords.longitude * 100) / 100;
                setCoordinates({ lat, lon });
                setLocationName(`GPS: ${lat}, ${lon}`);
                setZipCode("");
                setLocationResolved(true);
                setDetectingLocation(false);
            },
            () => {
                setSearchError("Could not access GPS location. Please search manually.");
                setDetectingLocation(false);
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    };

    const handleSelectResult = (result: any) => {
        const lat = Math.round(result.latitude * 100) / 100;
        const lon = Math.round(result.longitude * 100) / 100;
        setCoordinates({ lat, lon });
        
        const nameParts = [result.name];
        if (result.admin1) nameParts.push(result.admin1);
        else if (result.country) nameParts.push(result.country);
        
        const fullName = nameParts.join(", ");
        setLocationName(fullName);
        setZipCode(result.postcodes?.[0] || (/\d{5}/.test(searchQuery) ? searchQuery.match(/\d{5}/)?.[0] || "" : ""));
        setLocationResolved(true);
        setSearchResults([]);
        setSearchQuery(fullName);
    };

    const handleSearchLocation = async () => {
        if (!searchQuery.trim()) return;
        if (searchResults.length > 0) {
            handleSelectResult(searchResults[0]);
            return;
        }
        const query = searchQuery.split(",")[0].trim();
        setSearching(true);
        setSearchError(null);
        try {
            const res = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
                    query
                )}&count=1&language=en&format=json`
            );
            if (!res.ok) throw new Error("Search request failed");
            const data = await res.json();
            if (!data.results || data.results.length === 0) {
                throw new Error("Location not found. Try another city or ZIP code.");
            }
            handleSelectResult(data.results[0]);
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : "Search failed");
            setLocationResolved(false);
        } finally {
            setSearching(false);
        }
    };

    const handleSaveLocation = async () => {
        if (!coordinates || !locationResolved) {
            setEditingLocation(false);
            return;
        }
        setLocationSaving(true);
        setSearchError(null);
        setLocationSuccess(false);
        try {
            await updateLocation(coordinates.lat, coordinates.lon, zipCode, locationName);
            localStorage.setItem("my-lawn-location", JSON.stringify({ lat: coordinates.lat, lon: coordinates.lon }));
            setLocationSuccess(true);
            setEditingLocation(false);
            setTimeout(() => setLocationSuccess(false), 3000);
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : "Failed to save location");
        } finally {
            setLocationSaving(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-lawn-green-700 px-5 pt-12 pb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-lawn-green-600 rounded-full -translate-y-1/2 translate-x-1/2 opacity-30" />
                <div className="relative">
                    <h1 className="text-white text-2xl font-bold flex items-center gap-2">
                        <User size={22} /> Profile
                    </h1>
                    <p className="text-lawn-green-200 text-sm mt-0.5">
                        Manage your lawn preferences
                    </p>
                </div>
            </div>

            <div className="px-4 py-5 space-y-5 page-content animate-fade-in">

                {/* Account Info */}
                <div>
                    <p className="section-title px-1">Account</p>
                    <div className="card p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-lawn-green-50 flex items-center justify-center">
                                <User size={24} className="text-lawn-green-700" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm">
                                    {profile?.display_name || "Lawn Enthusiast"}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                    {user?.email}
                                </p>
                            </div>
                        </div>
                        {profile && (
                            <p className="text-xs text-gray-400">
                                Member since {new Date(profile.created_at).toLocaleDateString("en-US", {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Grass Type */}
                <div>
                    <p className="section-title px-1">Your Grass Type</p>

                    {!editingGrass ? (
                        <div className="card overflow-hidden">
                            <div className="p-4 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-lawn-green-50 flex items-center justify-center text-2xl flex-shrink-0">
                                    {grassInfo.emoji}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-gray-900">{grassInfo.name}</p>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                            ${grassInfo.season === "warm"
                                                ? "bg-amber-50 text-amber-600"
                                                : "bg-sky-50 text-sky-600"
                                            }`}
                                        >
                                            {grassInfo.season === "warm" ? <Sun size={9} /> : <Snowflake size={9} />}
                                            {grassInfo.season}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                        {grassInfo.description}
                                    </p>
                                </div>
                            </div>
                            <button
                                id="change-grass-btn"
                                onClick={() => {
                                    setPendingGrass(grassType);
                                    setEditingGrass(true);
                                }}
                                className="w-full border-t border-gray-100 px-4 py-3 flex items-center justify-between text-sm font-medium text-lawn-green-700 hover:bg-lawn-green-50 transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <Leaf size={14} />
                                    Change grass type
                                </span>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="card p-4">
                                <p className="text-sm font-medium text-gray-700 mb-3">Select your grass type:</p>
                                <div className="space-y-2 max-h-80 overflow-y-auto">
                                    {GRASS_TYPES.map((grass) => (
                                        <button
                                            key={grass.id}
                                            id={`profile-grass-${grass.id}`}
                                            type="button"
                                            onClick={() => setPendingGrass(grass.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                                                ${pendingGrass === grass.id
                                                    ? "border-lawn-green-500 bg-lawn-green-50"
                                                    : "border-gray-100 hover:border-gray-200"
                                                }`}
                                        >
                                            <span className="text-xl">{grass.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold ${pendingGrass === grass.id ? "text-lawn-green-800" : "text-gray-900"}`}>
                                                    {grass.name}
                                                </p>
                                                <p className="text-xs text-gray-400 truncate">{grass.description}</p>
                                            </div>
                                            {pendingGrass === grass.id && (
                                                <div className="w-5 h-5 bg-lawn-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <Check size={12} className="text-white" strokeWidth={3} />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                                    <p className="text-red-600 text-sm">{error}</p>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    id="cancel-grass-change-btn"
                                    onClick={() => setEditingGrass(false)}
                                    disabled={saving}
                                    className="flex-1 btn-secondary flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft size={14} />
                                    Cancel
                                </button>
                                <button
                                    id="save-grass-btn"
                                    onClick={handleSaveGrass}
                                    disabled={saving}
                                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            Save
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="mt-3 bg-lawn-green-50 border border-lawn-green-200 rounded-xl px-4 py-3 animate-slide-up">
                            <p className="text-lawn-green-700 text-sm font-medium">
                                ✅ Grass type updated! Your dashboard and schedule have been refreshed.
                            </p>
                        </div>
                    )}
                </div>

                {/* Lawn Location */}
                <div>
                    <p className="section-title px-1">Lawn Location</p>

                    {!editingLocation ? (
                        <div className="card overflow-hidden">
                            <div className="p-4 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-lawn-green-50 flex items-center justify-center text-2xl flex-shrink-0 text-lawn-green-700">
                                    <MapPin size={26} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    {profile?.latitude && profile?.longitude ? (
                                        <>
                                            <p className="font-bold text-gray-900">{profile.location_name || "Custom Location"}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                                Coordinates: {profile.latitude.toFixed(2)}°, {profile.longitude.toFixed(2)}°
                                                {profile.zip_code && ` · ZIP: ${profile.zip_code}`}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="font-bold text-gray-900">Not Set (Using Default)</p>
                                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                                Dallas, TX (Default fallback)
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button
                                id="change-location-btn"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSearchError(null);
                                    setLocationResolved(profile?.latitude ? true : false);
                                    setLocationName(profile?.location_name || "");
                                    setCoordinates(
                                        profile?.latitude && profile?.longitude
                                            ? { lat: profile.latitude, lon: profile.longitude }
                                            : null
                                    );
                                    setZipCode(profile?.zip_code || "");
                                    setEditingLocation(true);
                                }}
                                className="w-full border-t border-gray-100 px-4 py-3 flex items-center justify-between text-sm font-medium text-lawn-green-700 hover:bg-lawn-green-50 transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <MapPin size={14} />
                                    Change location
                                </span>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="card p-4 space-y-4">
                                <p className="text-sm font-medium text-gray-700">Update your lawn location:</p>
                                
                                {/* GPS detection */}
                                <button
                                    id="profile-gps-btn"
                                    type="button"
                                    onClick={handleGPSDetect}
                                    disabled={detectingLocation || searching}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {detectingLocation ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin text-gray-500" />
                                            Detecting GPS...
                                        </>
                                    ) : (
                                        <>
                                            <MapPin size={14} className="text-lawn-green-600" />
                                            Use GPS Location
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center gap-3">
                                    <div className="h-px bg-gray-100 flex-1" />
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or Search</span>
                                    <div className="h-px bg-gray-100 flex-1" />
                                </div>

                                {/* Manual search input */}
                                <div className="relative">
                                    <div className="flex gap-2">
                                        <input
                                            id="profile-location-input"
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                if (locationResolved) setLocationResolved(false);
                                            }}
                                            onKeyDown={(e) => e.key === "Enter" && handleSearchLocation()}
                                            placeholder="City name or ZIP code"
                                            className="input-field flex-1 py-2.5 text-sm"
                                        />
                                        <button
                                            id="profile-location-search-btn"
                                            type="button"
                                            onClick={handleSearchLocation}
                                            disabled={searching || detectingLocation}
                                            className="p-2.5 rounded-xl bg-lawn-green-700 text-white hover:bg-lawn-green-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center flex-shrink-0"
                                        >
                                            {searching ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Search size={16} />
                                            )}
                                        </button>
                                    </div>

                                    {/* Autocomplete Dropdown */}
                                    {searchResults.length > 0 && !locationResolved && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-slide-up text-left">
                                            {searchResults.map((result) => {
                                                const nameParts = [result.name];
                                                if (result.admin1) nameParts.push(result.admin1);
                                                else if (result.country) nameParts.push(result.country);
                                                const fullName = nameParts.join(", ");
                                                
                                                return (
                                                    <button
                                                        key={`${result.id}-${result.latitude}`}
                                                        type="button"
                                                        onClick={() => handleSelectResult(result)}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-lawn-green-50 border-b border-gray-100 last:border-0 transition-colors flex items-center gap-2"
                                                    >
                                                        <MapPin size={14} className="text-lawn-green-600 flex-shrink-0" />
                                                        <span className="truncate">{fullName}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {searchError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-red-600 text-xs text-center">{searchError}</p>
                                    </div>
                                )}

                                {/* Resolved Info */}
                                {locationResolved && coordinates && (
                                    <div className="p-3 bg-lawn-green-50 border border-lawn-green-100 rounded-xl text-center">
                                        <p className="text-xs font-semibold text-lawn-green-800">Verified: {locationName}</p>
                                        <p className="text-[10px] text-lawn-green-600 mt-0.5">
                                            Coords: {coordinates.lat.toFixed(2)}°, {coordinates.lon.toFixed(2)}°
                                            {zipCode && ` · ZIP: ${zipCode}`}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    id="cancel-location-change-btn"
                                    onClick={() => setEditingLocation(false)}
                                    disabled={locationSaving}
                                    className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm"
                                >
                                    <ArrowLeft size={14} />
                                    Cancel
                                </button>
                                <button
                                    id="save-location-btn"
                                    onClick={handleSaveLocation}
                                    disabled={locationSaving || !locationResolved}
                                    className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
                                >
                                    {locationSaving ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            Save
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {locationSuccess && (
                        <div className="mt-3 bg-lawn-green-50 border border-lawn-green-200 rounded-xl px-4 py-3 animate-slide-up">
                            <p className="text-lawn-green-700 text-sm font-medium">
                                ✅ Location updated! Your weather and schedule have been refreshed.
                            </p>
                        </div>
                    )}
                </div>

                {/* Sign Out */}
                <div>
                    <p className="section-title px-1">More</p>
                    <div className="card overflow-hidden">
                        <button
                            id="profile-signout-btn"
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-4 py-4 text-left text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <LogOut size={18} />
                            <span className="font-medium text-sm">Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
