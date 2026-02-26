import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import {
    getLawnState,
    getNextStep,
    getQuickTip,
    SCHEDULE_TASKS,
    formatDate,
} from "@/lib/lawnLogic";
import { fetchWeather, getWeatherAdvice } from "@/lib/weather";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
    CheckCircle2,
    Circle,
    Scissors,
    Lightbulb,
    LogOut,
    Cloud,
    Wind,
    Sun,
    Thermometer,
    Droplets,
    AlertCircle,
    Check,
    CloudRain
} from "lucide-react";



const TODAY = new Date();

export function DashboardPage() {
    const { user, signOut } = useAuth();
    const queryClient = useQueryClient();
    const lawnState = getLawnState(TODAY);
    const { task: nextTask, isUrgent, daysUntil } = getNextStep(TODAY);
    const tip = getQuickTip(TODAY);
    const { location, loading: locationLoading } = useGeolocation();

    // Fetch weather data using user's location
    const { data: weather, isLoading: weatherLoading } = useQuery({
        queryKey: ["weather", location?.lat, location?.lon],
        queryFn: () => fetchWeather(location?.lat, location?.lon),
        staleTime: 1000 * 60 * 30, // 30 mins
        enabled: !locationLoading, // wait until we have coordinates
    });

    const weatherAdvice = weather ? getWeatherAdvice(weather) : null;

    // Fetch task completions
    const { data: completions = [] } = useQuery({
        queryKey: ["task-completions", user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from("task_completions")
                .select("task_key")
                .eq("user_id", user!.id);
            return data?.map((r) => r.task_key) ?? [];
        },
    });

    // Fetch last mow
    const { data: lastMow } = useQuery({
        queryKey: ["last-mow", user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from("activities")
                .select("date")
                .eq("user_id", user!.id)
                .eq("type", "mow")
                .order("date", { ascending: false })
                .limit(1)
                .maybeSingle();
            return data?.date ?? null;
        },
    });

    // Toggle task completion
    const toggleTask = useMutation({
        mutationFn: async ({ key, completed }: { key: string; completed: boolean }) => {
            if (completed) {
                await supabase
                    .from("task_completions")
                    .delete()
                    .eq("user_id", user!.id)
                    .eq("task_key", key);
            } else {
                await supabase.from("task_completions").insert({
                    user_id: user!.id,
                    task_key: key,
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["task-completions"] });
        },
    });

    const daysSinceLastMow = lastMow
        ? Math.floor(
            (TODAY.getTime() - new Date(lastMow).getTime()) / (1000 * 60 * 60 * 24)
        )
        : null;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-lawn-green-700 px-5 pt-12 pb-6 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-lawn-green-600 rounded-full -translate-y-1/2 translate-x-1/2 opacity-30" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-lawn-green-800 rounded-full translate-y-1/2 -translate-x-1/2 opacity-30" />

                <div className="relative flex items-start justify-between">
                    <div>
                        <p className="text-lawn-green-200 text-sm font-medium">
                            {TODAY.toLocaleDateString("en-US", {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                        <h1 className="text-white text-2xl font-bold mt-0.5">My Lawn 🌱</h1>
                        <p className="text-lawn-green-300 text-xs mt-1">
                            {user?.email}
                        </p>
                    </div>
                    <button
                        id="signout-btn"
                        onClick={signOut}
                        className="p-2 rounded-full bg-lawn-green-600 text-lawn-green-200 hover:bg-lawn-green-500 transition-colors"
                    >
                        <LogOut size={18} />
                    </button>
                </div>

                {/* Lawn State Badge */}
                <div className="relative mt-5 flex items-center gap-3">
                    <div className="flex items-center gap-2.5 bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse-glow" />
                        <span className="text-white font-semibold text-sm">{lawnState.emoji} {lawnState.label}</span>
                    </div>
                    <p className="text-lawn-green-200 text-xs flex-1">{lawnState.description}</p>
                </div>
            </div>

            {/* Content */}
            <div className="px-4 py-5 space-y-5 page-content animate-fade-in">

                {/* Weather & Advice Card */}
                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Cloud className="text-lawn-green-600" size={20} />
                        <h2 className="font-bold text-gray-900">Weather & Advice</h2>
                    </div>

                    {weatherLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-lawn-green-600" />
                        </div>
                    ) : weather && weatherAdvice ? (
                        <div className="space-y-5">
                            {/* Weather Stats */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-5">
                                    <div className="flex items-center gap-1.5">
                                        <Thermometer size={18} className="text-gray-400" />
                                        <span className="text-lg font-bold text-gray-900">{weather.currentTemp}°F</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Wind size={18} className="text-gray-400" />
                                        <span className="text-sm font-medium text-gray-600">{weather.currentWindSpeed} mph</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {weather.isRaining ? (
                                            <CloudRain size={18} className="text-sky-500" />
                                        ) : (
                                            <Sun size={18} className="text-amber-500" />
                                        )}
                                        <span className="text-sm font-medium text-gray-600">{weather.conditions}</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-400">
                                    Hi {weather.highToday}° / Lo {weather.lowToday}° · Next 48h rain: {weather.rainNext48h.toFixed(1)}"
                                </p>
                            </div>

                            <div className="h-px bg-gray-100" />

                            {/* Lawn Advice */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${weatherAdvice.canMow ? 'bg-lawn-green-50 text-lawn-green-600' : 'bg-gray-50 text-gray-400'}`}>
                                        <Scissors size={14} />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {weatherAdvice.canMow ? (
                                            <div className="w-4 h-4 bg-lawn-green-500 rounded flex items-center justify-center">
                                                <Check size={10} className="text-white" />
                                            </div>
                                        ) : null}
                                        <p className="text-sm font-medium text-gray-700">{weatherAdvice.mowReason}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${weatherAdvice.canWater ? 'bg-sky-50 text-sky-600' : 'bg-gray-50 text-gray-400'}`}>
                                        <Droplets size={14} />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {weatherAdvice.canWater ? (
                                            <div className="w-4 h-4 bg-lawn-green-500 rounded flex items-center justify-center">
                                                <Check size={10} className="text-white" />
                                            </div>
                                        ) : null}
                                        <p className="text-sm font-medium text-gray-700">{weatherAdvice.waterReason}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${weatherAdvice.canFertilize ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                        <Lightbulb size={14} />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {weatherAdvice.canFertilize ? (
                                            <div className="w-4 h-4 bg-lawn-green-500 rounded flex items-center justify-center">
                                                <Check size={10} className="text-white" />
                                            </div>
                                        ) : null}
                                        <p className="text-sm font-medium text-gray-700">{weatherAdvice.fertReason}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-red-500 text-sm">
                            <AlertCircle size={16} />
                            <span>Failed to load weather data</span>
                        </div>
                    )}
                </div>

                {/* Next Step Card */}
                {nextTask && (
                    <div className={`rounded-2xl p-5 shadow-md ${isUrgent
                        ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white"
                        : "bg-gradient-to-br from-lawn-green-700 to-lawn-green-800 text-white"
                        }`}>
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isUrgent ? "text-orange-100" : "text-lawn-green-200"
                                    }`}>
                                    {isUrgent && daysUntil === 0 ? "🔴 Active Now" : isUrgent ? "⚠️ Urgent" : "🗓️ Coming Up"}
                                </p>
                                <h2 className="text-xl font-bold">{nextTask.label}</h2>
                                <p className={`text-sm mt-1 ${isUrgent ? "text-orange-100" : "text-lawn-green-200"}`}>
                                    {nextTask.description}
                                </p>
                            </div>
                        </div>
                        <div className={`mt-4 pt-4 border-t ${isUrgent ? "border-orange-400" : "border-lawn-green-600"}`}>
                            <p className="text-xs font-medium opacity-80">
                                Window: {formatDate(nextTask.startDate)} – {formatDate(nextTask.endDate)}
                                {daysUntil > 0 && ` · Starts in ${daysUntil} days`}
                            </p>
                        </div>
                    </div>
                )}

                {/* Days Since Last Mow */}
                <div className="card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-lawn-green-50 flex items-center justify-center flex-shrink-0">
                        <Scissors className="text-lawn-green-700" size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Last Mow</p>
                        {daysSinceLastMow !== null ? (
                            <>
                                <p className="text-2xl font-bold text-gray-900">
                                    {daysSinceLastMow} <span className="text-base font-medium text-gray-500">days ago</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {lastMow
                                        ? new Date(lastMow).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                        })
                                        : ""}
                                </p>
                            </>
                        ) : (
                            <p className="text-gray-400 text-sm mt-0.5">No mow recorded yet</p>
                        )}
                    </div>
                    {daysSinceLastMow !== null && daysSinceLastMow > 7 && (
                        <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2.5 py-1 rounded-full">
                            Overdue
                        </span>
                    )}
                </div>

                {/* Action Checklist */}
                <div>
                    <p className="section-title px-1">2026 Season Checklist</p>
                    <div className="card overflow-hidden">
                        {SCHEDULE_TASKS.map((task, idx) => {
                            const done = completions.includes(task.key);
                            const isActive = TODAY >= task.startDate && TODAY <= task.endDate;
                            return (
                                <button
                                    key={task.key}
                                    id={`task-${task.key}`}
                                    onClick={() => toggleTask.mutate({ key: task.key, completed: done })}
                                    className={`w-full flex items-center gap-4 px-4 py-4 text-left transition-colors
                    hover:bg-gray-50 active:bg-gray-100
                    ${idx < SCHEDULE_TASKS.length - 1 ? "border-b border-gray-100" : ""}
                    ${done ? "opacity-60" : ""}
                  `}
                                >
                                    <div className={`w-5 h-5 flex-shrink-0 ${done ? "text-lawn-green-600" : "text-gray-300"}`}>
                                        {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={`font-semibold text-sm ${done ? "line-through text-gray-400" : "text-gray-900"}`}>
                                                {task.label}
                                            </p>
                                            {isActive && !done && (
                                                <span className="text-xs bg-lawn-green-100 text-lawn-green-700 font-bold px-2 py-0.5 rounded-full">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {formatDate(task.startDate)} – {formatDate(task.endDate)}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Tip */}
                <div className="card p-4 flex items-start gap-3 bg-amber-50 border-amber-100">
                    <Lightbulb className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Quick Tip</p>
                        <p className="text-sm text-amber-900">{tip}</p>
                    </div>
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
