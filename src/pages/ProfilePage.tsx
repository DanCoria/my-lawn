import { useState } from "react";
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
} from "lucide-react";

export function ProfilePage() {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const { profile, grassType, updateGrassType } = useLawnProfile();
    const grassInfo = getGrassTypeInfo(grassType);

    const [editingGrass, setEditingGrass] = useState(false);
    const [pendingGrass, setPendingGrass] = useState<GrassType>(grassType);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

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
