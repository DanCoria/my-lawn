export type LawnState = "dormant" | "green-up" | "peak-growth" | "transition";

export interface LawnStateInfo {
    state: LawnState;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    emoji: string;
}

/** Returns the Bermuda grass lawn state for the given date */
export function getLawnState(date: Date): LawnStateInfo {
    const month = date.getMonth() + 1; // 1-12

    if (month <= 2 || month === 12) {
        return {
            state: "dormant",
            label: "Dormant",
            description: "Grass is dormant — protect and prepare",
            color: "text-gray-500",
            bgColor: "bg-gray-100",
            emoji: "😴",
        };
    } else if (month <= 4) {
        return {
            state: "green-up",
            label: "Green-Up",
            description: "Grass is waking up — light feeding time",
            color: "text-lawn-green-600",
            bgColor: "bg-lawn-green-50",
            emoji: "🌱",
        };
    } else if (month <= 9) {
        return {
            state: "peak-growth",
            label: "Peak Growth",
            description: "Full speed ahead — mow every 5-7 days",
            color: "text-lawn-green-700",
            bgColor: "bg-lawn-green-100",
            emoji: "🚀",
        };
    } else {
        return {
            state: "transition",
            label: "Transition",
            description: "Slowing down — prepare for dormancy",
            color: "text-orange-600",
            bgColor: "bg-orange-50",
            emoji: "🍂",
        };
    }
}

export interface ScheduleTask {
    key: string;
    label: string;
    description: string;
    startDate: Date;
    endDate: Date;
    color: string;
    bgColor: string;
    urgencyDays: number; // show as urgent within this many days of start
}

const YEAR = 2026;

export const SCHEDULE_TASKS: ScheduleTask[] = [
    {
        key: "pre-emergent-2026",
        label: "Pre-Emergent",
        description: "Apply Prodiamine/Barricade before soil hits 55°F",
        startDate: new Date(YEAR, 1, 1),  // Feb 1
        endDate: new Date(YEAR, 2, 15),   // Mar 15
        color: "text-orange-700",
        bgColor: "bg-orange-500",
        urgencyDays: 21,
    },
    {
        key: "spring-scalp-2026",
        label: "Spring Scalp",
        description: "Scalp lawn to remove dormant thatch, promote growth",
        startDate: new Date(YEAR, 2, 1),  // Mar 1
        endDate: new Date(YEAR, 2, 20),   // Mar 20
        color: "text-yellow-700",
        bgColor: "bg-yellow-500",
        urgencyDays: 14,
    },
    {
        key: "first-fert-2026",
        label: "First Fertilization",
        description: "9-0-24 or similar — 2 weeks after scalp",
        startDate: new Date(YEAR, 2, 15), // Mar 15
        endDate: new Date(YEAR, 3, 15),   // Apr 15
        color: "text-blue-700",
        bgColor: "bg-blue-500",
        urgencyDays: 14,
    },
    {
        key: "aeration-2026",
        label: "Aeration",
        description: "Core aerate to reduce compaction",
        startDate: new Date(YEAR, 4, 1),  // May 1
        endDate: new Date(YEAR, 5, 30),   // Jun 30
        color: "text-purple-700",
        bgColor: "bg-purple-500",
        urgencyDays: 14,
    },
    {
        key: "second-fert-2026",
        label: "2nd Fertilization",
        description: "Continue 4-6 week cycle",
        startDate: new Date(YEAR, 4, 1),  // May 1
        endDate: new Date(YEAR, 4, 31),   // May 31
        color: "text-blue-700",
        bgColor: "bg-blue-400",
        urgencyDays: 14,
    },
    {
        key: "third-fert-2026",
        label: "3rd Fertilization",
        description: "Mid-summer push",
        startDate: new Date(YEAR, 5, 15), // Jun 15
        endDate: new Date(YEAR, 6, 15),   // Jul 15
        color: "text-blue-700",
        bgColor: "bg-blue-400",
        urgencyDays: 14,
    },
    {
        key: "fourth-fert-2026",
        label: "4th Fertilization",
        description: "Late summer — light K-heavy formula",
        startDate: new Date(YEAR, 7, 1),  // Aug 1
        endDate: new Date(YEAR, 8, 1),    // Sep 1
        color: "text-blue-700",
        bgColor: "bg-blue-400",
        urgencyDays: 14,
    },
];

/** Get the current most-urgent task based on today's date */
export function getNextStep(today: Date): {
    task: ScheduleTask | null;
    isUrgent: boolean;
    daysUntil: number;
} {
    for (const task of SCHEDULE_TASKS) {
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysUntilStart = Math.ceil(
            (task.startDate.getTime() - today.getTime()) / msPerDay
        );
        const daysUntilEnd = Math.ceil(
            (task.endDate.getTime() - today.getTime()) / msPerDay
        );

        // Currently in window
        if (daysUntilStart <= 0 && daysUntilEnd > 0) {
            return { task, isUrgent: true, daysUntil: 0 };
        }
        // Upcoming within urgency window
        if (daysUntilStart > 0 && daysUntilStart <= task.urgencyDays) {
            return { task, isUrgent: true, daysUntil: daysUntilStart };
        }
        // Next upcoming (regardless of urgency)
        if (daysUntilStart > 0) {
            return { task, isUrgent: false, daysUntil: daysUntilStart };
        }
    }
    return { task: null, isUrgent: false, daysUntil: 0 };
}

/** Quick seasonal tips by month */
export function getQuickTip(date: Date): string {
    const month = date.getMonth() + 1;
    const tips: Record<number, string> = {
        1: "Keep off frozen or frosty grass — dormant Bermuda is fragile.",
        2: "Sharpen mower blades before the Spring Scalp season.",
        3: "Pre-emergent window is closing — apply before soil hits 55°F.",
        4: "First cut of the year? Set blade to lowest setting for the scalp.",
        5: "Water deeply but infrequently — 1 inch per week encourages deep roots.",
        6: "Mow every 5-7 days. Don't remove more than 1/3 of the blade height.",
        7: "Watch for chinch bugs — brown patches that don't respond to water.",
        8: "Hold off on heavy nitrogen — avoid pushing soft growth before fall.",
        9: "Apply a winterizer fertilizer to strengthen roots for dormancy.",
        10: "Last mow of the season — cut slightly lower than normal.",
        11: "Leaf blower > mower. Don't mow dormant grass unnecessarily.",
        12: "Great time to service your mower and prepare for next season.",
    };
    return tips[month] ?? "Keep your equipment clean and sharp.";
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
