import type { GrassType, GrassTypeInfo, ActivityType } from "@/types/database";

// ── Grass Type Catalog ───────────────────────────────────────

export const GRASS_TYPES: GrassTypeInfo[] = [
    {
        id: "bermuda",
        name: "Bermuda",
        season: "warm",
        description: "Heat-loving, drought-tolerant, fast-growing. The gold standard for Southern lawns.",
        emoji: "☀️",
    },
    {
        id: "st-augustine",
        name: "St. Augustine",
        season: "warm",
        description: "Thick, carpet-like blades. Thrives in shade and coastal humidity.",
        emoji: "🌴",
    },
    {
        id: "zoysia",
        name: "Zoysia",
        season: "warm",
        description: "Dense, soft turf with excellent cold tolerance for a warm-season grass.",
        emoji: "🌿",
    },
    {
        id: "centipede",
        name: "Centipede",
        season: "warm",
        description: "Low-maintenance, slow-growing. Perfect for acidic soils in the Southeast.",
        emoji: "🐛",
    },
    {
        id: "bahia",
        name: "Bahia",
        season: "warm",
        description: "Deep-rooted, sandy-soil survivor. Great for large, low-input lawns.",
        emoji: "🏖️",
    },
    {
        id: "kentucky-bluegrass",
        name: "Kentucky Bluegrass",
        season: "cool",
        description: "Classic Northern lawn. Rich color, self-repairing via rhizomes.",
        emoji: "💎",
    },
    {
        id: "tall-fescue",
        name: "Tall Fescue",
        season: "cool",
        description: "Tough, heat-tolerant cool-season grass. Deep roots handle drought well.",
        emoji: "🌾",
    },
    {
        id: "perennial-ryegrass",
        name: "Perennial Ryegrass",
        season: "cool",
        description: "Quick to establish, fine-textured. Often used for overseeding and sports fields.",
        emoji: "⚡",
    },
    {
        id: "fine-fescue",
        name: "Fine Fescue",
        season: "cool",
        description: "Thrives in shade and low-fertility soils. Minimal mowing needed.",
        emoji: "🌲",
    },
];

export function getGrassTypeInfo(grassType: GrassType): GrassTypeInfo {
    return GRASS_TYPES.find((g) => g.id === grassType) ?? GRASS_TYPES[0];
}

// ── Lawn State ───────────────────────────────────────────────

export type LawnState = "dormant" | "green-up" | "peak-growth" | "transition";

export interface LawnStateInfo {
    state: LawnState;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    emoji: string;
}

/** Returns the lawn state for the given date and grass type */
export function getLawnState(date: Date, grassType: GrassType = "bermuda"): LawnStateInfo {
    const month = date.getMonth() + 1; // 1-12
    const info = getGrassTypeInfo(grassType);
    const isWarm = info.season === "warm";

    if (isWarm) {
        // Warm-season grasses go dormant in winter
        if (month <= 2 || month === 12) {
            return {
                state: "dormant",
                label: "Dormant",
                description: `${info.name} is dormant — protect and prepare`,
                color: "text-gray-500",
                bgColor: "bg-gray-100",
                emoji: "😴",
            };
        } else if (month <= 4) {
            return {
                state: "green-up",
                label: "Green-Up",
                description: `${info.name} is waking up — light feeding time`,
                color: "text-lawn-green-600",
                bgColor: "bg-lawn-green-50",
                emoji: "🌱",
            };
        } else if (month <= 9) {
            return {
                state: "peak-growth",
                label: "Peak Growth",
                description: `Full speed ahead — mow every 5-7 days`,
                color: "text-lawn-green-700",
                bgColor: "bg-lawn-green-100",
                emoji: "🚀",
            };
        } else {
            return {
                state: "transition",
                label: "Transition",
                description: `Slowing down — prepare for dormancy`,
                color: "text-orange-600",
                bgColor: "bg-orange-50",
                emoji: "🍂",
            };
        }
    } else {
        // Cool-season grasses struggle in summer heat
        if (month >= 6 && month <= 8) {
            return {
                state: "dormant",
                label: "Summer Stress",
                description: `${info.name} is heat-stressed — water deeply, avoid fertilizer`,
                color: "text-orange-500",
                bgColor: "bg-orange-50",
                emoji: "🥵",
            };
        } else if (month >= 3 && month <= 5) {
            return {
                state: "peak-growth",
                label: "Spring Growth",
                description: `Prime growing season — mow regularly, fertilize`,
                color: "text-lawn-green-700",
                bgColor: "bg-lawn-green-100",
                emoji: "🚀",
            };
        } else if (month >= 9 && month <= 11) {
            return {
                state: "peak-growth",
                label: "Fall Recovery",
                description: `Best time to seed, fertilize, and strengthen your lawn`,
                color: "text-lawn-green-600",
                bgColor: "bg-lawn-green-50",
                emoji: "🌱",
            };
        } else {
            return {
                state: "dormant",
                label: "Winter Dormant",
                description: `${info.name} growth has slowed — minimal maintenance`,
                color: "text-gray-500",
                bgColor: "bg-gray-100",
                emoji: "❄️",
            };
        }
    }
}

// ── Schedule Tasks ───────────────────────────────────────────

export interface ScheduleTask {
    key: string;
    label: string;
    description: string;
    startDate: Date;
    endDate: Date;
    color: string;
    bgColor: string;
    urgencyDays: number;
}

const YEAR = 2026;

// Per-grass-type schedule configurations
const WARM_SEASON_TASKS: Record<string, ScheduleTask[]> = {
    bermuda: [
        {
            key: "pre-emergent-2026",
            label: "Pre-Emergent",
            description: "Apply Prodiamine/Barricade before soil hits 55°F",
            startDate: new Date(YEAR, 1, 1),
            endDate: new Date(YEAR, 2, 15),
            color: "text-orange-700",
            bgColor: "bg-orange-500",
            urgencyDays: 21,
        },
        {
            key: "spring-scalp-2026",
            label: "Spring Scalp",
            description: "Scalp lawn to remove dormant thatch, promote growth",
            startDate: new Date(YEAR, 2, 1),
            endDate: new Date(YEAR, 2, 20),
            color: "text-yellow-700",
            bgColor: "bg-yellow-500",
            urgencyDays: 14,
        },
        {
            key: "first-fert-2026",
            label: "First Fertilization",
            description: "9-0-24 or similar — 2 weeks after scalp",
            startDate: new Date(YEAR, 2, 15),
            endDate: new Date(YEAR, 3, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-500",
            urgencyDays: 14,
        },
        {
            key: "aeration-2026",
            label: "Aeration",
            description: "Core aerate to reduce compaction",
            startDate: new Date(YEAR, 4, 1),
            endDate: new Date(YEAR, 5, 30),
            color: "text-purple-700",
            bgColor: "bg-purple-500",
            urgencyDays: 14,
        },
        {
            key: "second-fert-2026",
            label: "2nd Fertilization",
            description: "Continue 4-6 week cycle",
            startDate: new Date(YEAR, 4, 1),
            endDate: new Date(YEAR, 4, 31),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
        {
            key: "third-fert-2026",
            label: "3rd Fertilization",
            description: "Mid-summer push",
            startDate: new Date(YEAR, 5, 15),
            endDate: new Date(YEAR, 6, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
        {
            key: "fourth-fert-2026",
            label: "4th Fertilization",
            description: "Late summer — light K-heavy formula",
            startDate: new Date(YEAR, 7, 1),
            endDate: new Date(YEAR, 8, 1),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
    ],
    "st-augustine": [
        {
            key: "pre-emergent-2026",
            label: "Pre-Emergent",
            description: "Apply Atrazine (safe for St. Aug) when soil nears 55°F",
            startDate: new Date(YEAR, 1, 15),
            endDate: new Date(YEAR, 2, 15),
            color: "text-orange-700",
            bgColor: "bg-orange-500",
            urgencyDays: 21,
        },
        {
            key: "spring-feed-2026",
            label: "Spring Feeding",
            description: "15-0-15 or similar slow-release when green-up is 50%+",
            startDate: new Date(YEAR, 3, 1),
            endDate: new Date(YEAR, 3, 30),
            color: "text-blue-700",
            bgColor: "bg-blue-500",
            urgencyDays: 14,
        },
        {
            key: "iron-app-2026",
            label: "Iron Application",
            description: "Ironite or FeSO₄ for deep green without excessive growth",
            startDate: new Date(YEAR, 4, 1),
            endDate: new Date(YEAR, 4, 31),
            color: "text-teal-700",
            bgColor: "bg-teal-500",
            urgencyDays: 14,
        },
        {
            key: "summer-fert-2026",
            label: "Summer Fertilization",
            description: "Light nitrogen — avoid over-pushing in peak heat",
            startDate: new Date(YEAR, 5, 15),
            endDate: new Date(YEAR, 6, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
        {
            key: "chinch-watch-2026",
            label: "Chinch Bug Watch",
            description: "Inspect for chinch bugs in hot, dry areas; treat if found",
            startDate: new Date(YEAR, 5, 1),
            endDate: new Date(YEAR, 7, 31),
            color: "text-red-700",
            bgColor: "bg-red-400",
            urgencyDays: 7,
        },
        {
            key: "fall-fert-2026",
            label: "Fall Potassium",
            description: "High-K winterizer to harden before frost",
            startDate: new Date(YEAR, 8, 15),
            endDate: new Date(YEAR, 9, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
    ],
    zoysia: [
        {
            key: "pre-emergent-2026",
            label: "Pre-Emergent",
            description: "Apply Prodiamine when soil temps approach 55°F",
            startDate: new Date(YEAR, 1, 15),
            endDate: new Date(YEAR, 2, 15),
            color: "text-orange-700",
            bgColor: "bg-orange-500",
            urgencyDays: 21,
        },
        {
            key: "dethatching-2026",
            label: "Dethatching",
            description: "Zoysia builds heavy thatch — dethatch or power-rake",
            startDate: new Date(YEAR, 3, 15),
            endDate: new Date(YEAR, 4, 15),
            color: "text-yellow-700",
            bgColor: "bg-yellow-500",
            urgencyDays: 14,
        },
        {
            key: "first-fert-2026",
            label: "First Fertilization",
            description: "Slow-release N when fully greened up",
            startDate: new Date(YEAR, 3, 15),
            endDate: new Date(YEAR, 4, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-500",
            urgencyDays: 14,
        },
        {
            key: "aeration-2026",
            label: "Aeration",
            description: "Core aerate during peak growth",
            startDate: new Date(YEAR, 4, 1),
            endDate: new Date(YEAR, 5, 30),
            color: "text-purple-700",
            bgColor: "bg-purple-500",
            urgencyDays: 14,
        },
        {
            key: "summer-fert-2026",
            label: "Summer Fertilization",
            description: "Light feeding every 6-8 weeks",
            startDate: new Date(YEAR, 5, 15),
            endDate: new Date(YEAR, 6, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
        {
            key: "fall-fert-2026",
            label: "Fall Winterizer",
            description: "Potassium-heavy feed to harden for winter",
            startDate: new Date(YEAR, 8, 15),
            endDate: new Date(YEAR, 9, 15),
            color: "text-blue-700",
            bgColor: "bg-blue-400",
            urgencyDays: 14,
        },
    ],
};

const COOL_SEASON_TASKS: ScheduleTask[] = [
    {
        key: "early-spring-fert-2026",
        label: "Early Spring Fertilization",
        description: "Light N application as growth resumes",
        startDate: new Date(YEAR, 2, 1),
        endDate: new Date(YEAR, 2, 31),
        color: "text-blue-700",
        bgColor: "bg-blue-500",
        urgencyDays: 14,
    },
    {
        key: "pre-emergent-2026",
        label: "Pre-Emergent (Crabgrass)",
        description: "Apply before soil hits 55°F to prevent crabgrass",
        startDate: new Date(YEAR, 2, 15),
        endDate: new Date(YEAR, 3, 15),
        color: "text-orange-700",
        bgColor: "bg-orange-500",
        urgencyDays: 21,
    },
    {
        key: "spring-mow-start-2026",
        label: "Begin Regular Mowing",
        description: "Set mower to 3-3.5 inches; mow when grass is actively growing",
        startDate: new Date(YEAR, 3, 1),
        endDate: new Date(YEAR, 3, 30),
        color: "text-lawn-green-700",
        bgColor: "bg-lawn-green-500",
        urgencyDays: 14,
    },
    {
        key: "late-spring-fert-2026",
        label: "Late Spring Fertilization",
        description: "Slow-release N to sustain through early summer",
        startDate: new Date(YEAR, 4, 1),
        endDate: new Date(YEAR, 4, 31),
        color: "text-blue-700",
        bgColor: "bg-blue-400",
        urgencyDays: 14,
    },
    {
        key: "summer-stress-2026",
        label: "Summer Stress Mgmt",
        description: "Raise mower height, water deeply 1\"/week, no fertilizer",
        startDate: new Date(YEAR, 5, 15),
        endDate: new Date(YEAR, 7, 31),
        color: "text-red-700",
        bgColor: "bg-red-400",
        urgencyDays: 7,
    },
    {
        key: "fall-aeration-2026",
        label: "Fall Aeration & Overseeding",
        description: "Core aerate and overseed bare/thin areas — best time of year",
        startDate: new Date(YEAR, 8, 1),
        endDate: new Date(YEAR, 9, 15),
        color: "text-purple-700",
        bgColor: "bg-purple-500",
        urgencyDays: 21,
    },
    {
        key: "fall-fert-2026",
        label: "Fall Fertilization",
        description: "Heavy feeding to strengthen roots before winter",
        startDate: new Date(YEAR, 8, 15),
        endDate: new Date(YEAR, 9, 31),
        color: "text-blue-700",
        bgColor: "bg-blue-500",
        urgencyDays: 14,
    },
    {
        key: "winterizer-2026",
        label: "Winterizer Application",
        description: "Final fertilization — promotes root storage for spring",
        startDate: new Date(YEAR, 10, 1),
        endDate: new Date(YEAR, 10, 30),
        color: "text-blue-700",
        bgColor: "bg-blue-400",
        urgencyDays: 14,
    },
];

/** Get the schedule tasks for a given grass type */
export function getScheduleTasks(grassType: GrassType = "bermuda"): ScheduleTask[] {
    const info = getGrassTypeInfo(grassType);

    if (info.season === "cool") {
        return COOL_SEASON_TASKS;
    }

    // Warm-season: use specific schedule if available, otherwise fall back to bermuda
    return WARM_SEASON_TASKS[grassType] ?? WARM_SEASON_TASKS["bermuda"];
}

// Keep backward compat — the old export that some pages may still reference
export const SCHEDULE_TASKS: ScheduleTask[] = WARM_SEASON_TASKS["bermuda"];

// ── Next Step Logic ──────────────────────────────────────────

/** Get the current most-urgent task based on today's date */
export function getNextStep(today: Date, grassType: GrassType = "bermuda"): {
    task: ScheduleTask | null;
    isUrgent: boolean;
    daysUntil: number;
} {
    const tasks = getScheduleTasks(grassType);

    for (const task of tasks) {
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

// ── Quick Tips ───────────────────────────────────────────────

const WARM_TIPS: Record<number, string> = {
    1: "Keep off frozen or frosty grass — dormant warm-season turf is fragile.",
    2: "Sharpen mower blades before the spring season starts.",
    3: "Pre-emergent window is closing — apply before soil hits 55°F.",
    4: "First cut of the year? Set blade low for the scalp (Bermuda/Zoysia).",
    5: "Water deeply but infrequently — 1 inch per week encourages deep roots.",
    6: "Mow every 5-7 days. Don't remove more than 1/3 of the blade height.",
    7: "Watch for chinch bugs — brown patches that don't respond to water.",
    8: "Hold off on heavy nitrogen — avoid pushing soft growth before fall.",
    9: "Apply a winterizer fertilizer to strengthen roots for dormancy.",
    10: "Last mow of the season — cut slightly lower than normal.",
    11: "Leaf blower > mower. Don't mow dormant grass unnecessarily.",
    12: "Great time to service your mower and prepare for next season.",
};

const COOL_TIPS: Record<number, string> = {
    1: "Avoid walking on frozen turf to prevent crown damage.",
    2: "Plan your spring fertilization — order products now.",
    3: "Apply pre-emergent before forsythias stop blooming (55°F soil temp).",
    4: "Begin mowing at 3-3.5 inches as growth picks up.",
    5: "Water consistently — cool-season grass needs ~1 inch/week.",
    6: "Raise the mower height as temperatures climb. Tall grass = cooler roots.",
    7: "Avoid fertilizing — your grass is stressed by heat. Water deeply instead.",
    8: "Continue deep watering. Seed prep begins late this month.",
    9: "Best month to aerate, overseed, and fertilize cool-season lawns!",
    10: "Final fertilization (winterizer). Continue mowing until growth stops.",
    11: "Keep mowing as long as it's growing. Remove fallen leaves promptly.",
    12: "Service equipment and plan next year's lawn care calendar.",
};

/** Quick seasonal tips by month */
export function getQuickTip(date: Date, grassType: GrassType = "bermuda"): string {
    const month = date.getMonth() + 1;
    const info = getGrassTypeInfo(grassType);
    const tips = info.season === "cool" ? COOL_TIPS : WARM_TIPS;
    return tips[month] ?? "Keep your equipment clean and sharp.";
}

// ── Fertilization note per season ────────────────────────────

export function getFertilizationNote(grassType: GrassType = "bermuda"): {
    title: string;
    text: string;
} {
    const info = getGrassTypeInfo(grassType);

    if (info.season === "cool") {
        return {
            title: `📋 ${info.name} Fertilization Schedule`,
            text: `Cool-season grasses like ${info.name} grow best with heavy fall feeding and a light spring application. ` +
                `Fertilize in early spring, skip summer (heat stress), then apply heavy N in September-October and ` +
                `a winterizer in November. Use a balanced NPK in spring and high-nitrogen in fall.`,
        };
    }

    return {
        title: `📋 ${info.name} Fertilization Schedule`,
        text: `${info.name} grass grows best with a 4-6 week fertilization cycle during active growth (May–September). ` +
            `Start ~2 weeks after green-up and continue until 6 weeks before first frost. ` +
            `Use a balanced NPK in spring, higher nitrogen mid-summer, and a winterizer (low N, high K) in fall.`,
    };
}

// ── Grass-Type Activity Types ────────────────────────────────

export interface ActivityTypeOption {
    value: ActivityType;
    label: string;
}

/** All activity types that apply to any lawn */
const BASE_ACTIVITY_TYPES: ActivityTypeOption[] = [
    { value: "mow", label: "Mow" },
    { value: "fertilize", label: "Fertilize" },
    { value: "pre-emergent", label: "Pre-Emergent" },
    { value: "water", label: "Water" },
    { value: "aerate", label: "Aerate" },
];

/** Scalp is only relevant for Bermuda (the only grass in our schedule
 *  with an explicit spring-scalp task). Zoysia uses dethatching instead.
 */
const SCALP_ACTIVITY: ActivityTypeOption = { value: "scalp", label: "Scalp" };

const SCALP_GRASS_TYPES: GrassType[] = ["bermuda"];

/**
 * Returns the activity type options appropriate for the given grass type.
 * Inserts "Scalp" between "Mow" and "Fertilize" for grass types that
 * support scalping; omits it for all others.
 */
export function getActivityTypes(grassType: GrassType = "bermuda"): ActivityTypeOption[] {
    if (SCALP_GRASS_TYPES.includes(grassType)) {
        // Insert scalp right after mow
        return [
            BASE_ACTIVITY_TYPES[0], // mow
            SCALP_ACTIVITY,
            ...BASE_ACTIVITY_TYPES.slice(1),
        ];
    }
    return BASE_ACTIVITY_TYPES;
}

// ── Utilities ────────────────────────────────────────────────

export function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
