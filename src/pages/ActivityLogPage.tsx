import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { Activity, ActivityType } from "@/types/database";
import {
    Scissors,
    Droplets,
    FlameKindling,
    Leaf,
    Zap,
    CircleDot,
    Loader2,
    ChevronDown,
    ChevronUp,
    Trash2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
    { value: "mow", label: "Mow" },
    { value: "scalp", label: "Scalp" },
    { value: "fertilize", label: "Fertilize" },
    { value: "pre-emergent", label: "Pre-Emergent" },
    { value: "water", label: "Water" },
    { value: "aerate", label: "Aerate" },
];

const ACTIVITY_CONFIG: Record<
    ActivityType,
    { icon: typeof Scissors; color: string; bg: string; dot: string }
> = {
    mow: { icon: Scissors, color: "text-lawn-green-700", bg: "bg-lawn-green-50", dot: "bg-lawn-green-600" },
    scalp: { icon: FlameKindling, color: "text-yellow-700", bg: "bg-yellow-50", dot: "bg-yellow-500" },
    fertilize: { icon: Leaf, color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
    "pre-emergent": { icon: Zap, color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" },
    water: { icon: Droplets, color: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-400" },
    aerate: { icon: CircleDot, color: "text-purple-700", bg: "bg-purple-50", dot: "bg-purple-500" },
};

export function ActivityLogPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [type, setType] = useState<ActivityType>("mow");
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [notes, setNotes] = useState("");
    const [filter, setFilter] = useState<ActivityType | "all">("all");
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [showForm, setShowForm] = useState(true);
    const [formError, setFormError] = useState<string | null>(null);

    const { data: activities = [], isLoading } = useQuery({
        queryKey: ["activities", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("activities")
                .select("*")
                .eq("user_id", user!.id)
                .order("date", { ascending: false });
            if (error) throw error;
            return (data ?? []) as Activity[];
        },
    });

    const addActivity = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.from("activities").insert({
                user_id: user!.id,
                type,
                date,
                notes: notes.trim() || null,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["activities"] });
            queryClient.invalidateQueries({ queryKey: ["last-mow"] });
            setNotes("");
            setDate(format(new Date(), "yyyy-MM-dd"));
            setFormError(null);
        },
        onError: (err: Error) => setFormError(err.message),
    });

    const deleteActivity = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("activities").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["activities"] });
            queryClient.invalidateQueries({ queryKey: ["last-mow"] });
        },
    });

    const filtered = filter === "all" ? activities : activities.filter((a) => a.type === filter);

    // Calendar logic
    const monthStart = startOfMonth(calendarDate);
    const monthEnd = endOfMonth(calendarDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDow = getDay(monthStart); // 0=Sun

    const activityDateMap = activities.reduce<Record<string, ActivityType[]>>((acc, a) => {
        const key = a.date.slice(0, 10);
        if (!acc[key]) acc[key] = [];
        acc[key].push(a.type);
        return acc;
    }, {});

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addActivity.mutate();
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-lawn-green-700 px-5 pt-12 pb-5">
                <h1 className="text-white text-2xl font-bold">Activity Log</h1>
                <p className="text-lawn-green-200 text-sm mt-0.5">Record and review your lawn work</p>
            </div>

            <div className="px-4 py-5 space-y-5 page-content">
                {/* Log Entry Form */}
                <div className="card overflow-hidden">
                    <button
                        id="toggle-form-btn"
                        onClick={() => setShowForm(!showForm)}
                        className="w-full flex items-center justify-between px-4 py-4 font-semibold text-gray-900"
                    >
                        <span>+ Log New Activity</span>
                        {showForm ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                    </button>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="border-t border-gray-100 px-4 pb-4 space-y-4 pt-4">
                            {/* Type selector */}
                            <div>
                                <p className="section-title">Activity Type</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {ACTIVITY_TYPES.map(({ value, label }) => {
                                        const cfg = ACTIVITY_CONFIG[value];
                                        const Icon = cfg.icon;
                                        const selected = type === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                id={`type-btn-${value}`}
                                                onClick={() => setType(value)}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150 ${selected
                                                        ? `border-lawn-green-500 ${cfg.bg} ${cfg.color}`
                                                        : "border-gray-100 bg-white text-gray-400"
                                                    }`}
                                            >
                                                <Icon size={20} />
                                                <span className="text-xs font-semibold">{label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Date */}
                            <div>
                                <label className="section-title block">Date</label>
                                <input
                                    id="activity-date"
                                    type="date"
                                    value={date}
                                    max={format(new Date(), "yyyy-MM-dd")}
                                    onChange={(e) => setDate(e.target.value)}
                                    required
                                    className="input-field"
                                />
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="section-title block">Notes (optional)</label>
                                <textarea
                                    id="activity-notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="e.g. Applied 0.5 lb N/1000 sq ft Scott's Turf Builder..."
                                    rows={3}
                                    className="input-field resize-none"
                                />
                            </div>

                            {formError && (
                                <p className="text-red-500 text-sm">{formError}</p>
                            )}

                            <button
                                id="log-submit-btn"
                                type="submit"
                                disabled={addActivity.isPending}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {addActivity.isPending ? (
                                    <><Loader2 size={16} className="animate-spin" /> Saving...</>
                                ) : (
                                    "Save Activity"
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Calendar View */}
                <div>
                    <p className="section-title px-1">Monthly View</p>
                    <div className="card p-4">
                        {/* Month nav */}
                        <div className="flex items-center justify-between mb-4">
                            <button
                                id="prev-month-btn"
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                ←
                            </button>
                            <p className="font-semibold text-gray-900">
                                {format(calendarDate, "MMMM yyyy")}
                            </p>
                            <button
                                id="next-month-btn"
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                →
                            </button>
                        </div>

                        {/* Day headers */}
                        <div className="grid grid-cols-7 mb-1">
                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Days grid */}
                        <div className="grid grid-cols-7 gap-y-1">
                            {Array.from({ length: startDow }).map((_, i) => (
                                <div key={`empty-${i}`} />
                            ))}
                            {days.map((day) => {
                                const key = format(day, "yyyy-MM-dd");
                                const dayActivities = activityDateMap[key] ?? [];
                                const isToday = isSameDay(day, new Date());
                                return (
                                    <div key={key} className="flex flex-col items-center py-1">
                                        <span className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-lawn-green-700 text-white" : "text-gray-700"
                                            }`}>
                                            {format(day, "d")}
                                        </span>
                                        <div className="flex gap-0.5 flex-wrap justify-center max-w-[28px]">
                                            {[...new Set(dayActivities)].slice(0, 3).map((t) => (
                                                <div
                                                    key={t}
                                                    className={`w-1.5 h-1.5 rounded-full ${ACTIVITY_CONFIG[t].dot}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-3">
                            {ACTIVITY_TYPES.map(({ value, label }) => (
                                <div key={value} className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${ACTIVITY_CONFIG[value].dot}`} />
                                    <span className="text-xs text-gray-500">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Activity History */}
                <div>
                    <div className="flex items-center justify-between px-1 mb-3">
                        <p className="section-title mb-0">History</p>
                        <div className="flex gap-1.5">
                            <button
                                id="filter-all-btn"
                                onClick={() => setFilter("all")}
                                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filter === "all" ? "bg-lawn-green-700 text-white" : "bg-white text-gray-500 border border-gray-200"
                                    }`}
                            >
                                All
                            </button>
                            {ACTIVITY_TYPES.map(({ value, label }) => (
                                <button
                                    key={value}
                                    id={`filter-${value}-btn`}
                                    onClick={() => setFilter(value)}
                                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filter === value
                                            ? `${ACTIVITY_CONFIG[value].bg} ${ACTIVITY_CONFIG[value].color} border border-current`
                                            : "bg-white text-gray-500 border border-gray-200"
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="animate-spin text-lawn-green-600" size={24} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="card p-8 text-center">
                            <p className="text-gray-400 text-sm">No activities logged yet.</p>
                            <p className="text-gray-300 text-xs mt-1">Use the form above to add your first entry.</p>
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            {filtered.map((activity, idx) => {
                                const cfg = ACTIVITY_CONFIG[activity.type];
                                const Icon = cfg.icon;
                                return (
                                    <div
                                        key={activity.id}
                                        className={`flex items-start gap-3 px-4 py-4 ${idx < filtered.length - 1 ? "border-b border-gray-100" : ""
                                            }`}
                                    >
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                                            <Icon size={18} className={cfg.color} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-sm text-gray-900 capitalize">
                                                    {activity.type.replace("-", " ")}
                                                </p>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {new Date(activity.date + "T12:00:00").toLocaleDateString("en-US", {
                                                    weekday: "short",
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                })}
                                            </p>
                                            {activity.notes && (
                                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{activity.notes}</p>
                                            )}
                                        </div>
                                        <button
                                            id={`delete-activity-${activity.id}`}
                                            onClick={() => deleteActivity.mutate(activity.id)}
                                            className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
