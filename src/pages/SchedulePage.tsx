import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { SCHEDULE_TASKS, formatDate } from "@/lib/lawnLogic";
import { CheckCircle2 } from "lucide-react";

const YEAR = 2026;
const YEAR_START = new Date(YEAR, 0, 1);
const YEAR_END = new Date(YEAR, 11, 31);
const YEAR_MS = YEAR_END.getTime() - YEAR_START.getTime();
const TODAY = new Date();

function toPercent(date: Date): number {
    return Math.max(0, Math.min(100, ((date.getTime() - YEAR_START.getTime()) / YEAR_MS) * 100));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SchedulePage() {
    const { user } = useAuth();

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

    const todayPct = toPercent(TODAY);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-lawn-green-700 px-5 pt-12 pb-5">
                <h1 className="text-white text-2xl font-bold">2026 Season Schedule</h1>
                <p className="text-lawn-green-200 text-sm mt-0.5">Bermuda grass — Southern US calendar</p>
            </div>

            <div className="px-4 py-5 space-y-6 page-content">

                {/* Visual Timeline */}
                <div>
                    <p className="section-title px-1">Full Year Timeline</p>
                    <div className="card p-4 overflow-x-auto">
                        {/* Month axis */}
                        <div className="relative h-5 mb-3 min-w-[280px]">
                            {MONTH_LABELS.map((label, i) => (
                                <span
                                    key={label}
                                    className="absolute text-[9px] text-gray-400 font-medium transform -translate-x-1/2"
                                    style={{ left: `${(i / 11) * 100}%` }}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>

                        {/* Timeline bars */}
                        <div className="relative space-y-2.5 min-w-[280px]">
                            {SCHEDULE_TASKS.map((task) => {
                                const startPct = toPercent(task.startDate);
                                const endPct = toPercent(task.endDate);
                                const widthPct = endPct - startPct;
                                const done = completions.includes(task.key);
                                const isActive = TODAY >= task.startDate && TODAY <= task.endDate;

                                return (
                                    <div key={task.key} className="relative h-7 flex items-center">
                                        {/* Track */}
                                        <div className="absolute inset-0 bg-gray-100 rounded-full" />
                                        {/* Fill */}
                                        <div
                                            className={`absolute h-full rounded-full transition-opacity duration-300 ${task.bgColor} ${done ? "opacity-30" : isActive ? "opacity-100 shadow-sm" : "opacity-60"}`}
                                            style={{
                                                left: `${startPct}%`,
                                                width: `${widthPct}%`,
                                            }}
                                        />
                                        {/* Label */}
                                        <span
                                            className="absolute text-[10px] font-bold text-white drop-shadow px-1.5 truncate"
                                            style={{ left: `${startPct + 0.5}%`, maxWidth: `${widthPct}%` }}
                                        >
                                            {task.label}
                                        </span>
                                        {/* Completion check */}
                                        {done && (
                                            <div
                                                className="absolute"
                                                style={{ left: `${startPct + widthPct / 2}%`, transform: "translateX(-50%)" }}
                                            >
                                                <CheckCircle2 size={14} className="text-lawn-green-600" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Today marker */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                                style={{ left: `${todayPct}%` }}
                            >
                                <div className="absolute -top-5 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    Today
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Task Detail Cards */}
                <div>
                    <p className="section-title px-1">Task Windows</p>
                    <div className="space-y-3">
                        {SCHEDULE_TASKS.map((task) => {
                            const done = completions.includes(task.key);
                            const isActive = TODAY >= task.startDate && TODAY <= task.endDate;
                            const isPast = TODAY > task.endDate;

                            let statusLabel = "";
                            let statusClass = "";
                            if (done) { statusLabel = "Completed"; statusClass = "bg-lawn-green-100 text-lawn-green-700"; }
                            else if (isActive) { statusLabel = "Active Now"; statusClass = "bg-lawn-green-600 text-white"; }
                            else if (isPast) { statusLabel = "Past Window"; statusClass = "bg-gray-100 text-gray-500"; }
                            else {
                                const daysAway = Math.ceil((task.startDate.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
                                statusLabel = `In ${daysAway} days`;
                                statusClass = daysAway <= 21
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-blue-50 text-blue-600";
                            }

                            return (
                                <div key={task.key} className={`card p-4 flex items-start gap-4 ${isActive ? "ring-2 ring-lawn-green-500 ring-offset-1" : ""}`}>
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 ${task.bgColor} bg-opacity-20`}>
                                        <div className={`w-4 h-4 rounded-full ${task.bgColor}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-gray-900 text-sm">{task.label}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {formatDate(task.startDate)} – {formatDate(task.endDate)}
                                                </p>
                                            </div>
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${statusClass}`}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{task.description}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Fertilization schedule note */}
                <div className="card p-4 bg-blue-50 border-blue-100">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">📋 Fertilization Schedule</p>
                    <p className="text-xs text-blue-800 leading-relaxed">
                        Bermuda grass grows best with a 4-6 week fertilization cycle during active growth (May–September).
                        Start ~2 weeks after the Spring Scalp and continue until 6 weeks before first frost.
                        Use a balanced NPK in spring, higher nitrogen mid-summer, and a winterizer (low N, high K) in fall.
                    </p>
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
