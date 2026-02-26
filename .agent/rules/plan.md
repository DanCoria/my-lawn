---
trigger: always_on
---

# My Lawn 🌱

A mobile-first personal lawn management dashboard for achieving a golf-course-quality Bermuda grass lawn. Recommendations change based on user's location. 

## Page 1: Dashboard
- **Lawn State Indicator** — Shows current status (Dormant, Green-up, Peak Growth, Transition) based on the current date and climate logic
- **Next Step Card** — A prominent, attention-grabbing card showing the most urgent task right now. For February 2026: "URGENT: Apply Pre-emergent (Prodiamine/Barricade)"
- **Action Checklist** — Upcoming tasks with estimated date windows (Pre-emergent, Spring Scalp, First Fertilization, Aeration) with checkmarks for completion
- **Days Since Last Mow** — A quick counter showing how long it's been since the last mow entry
- **Quick Tips** — Contextual reminders like "Sharpen mower blades before the Spring Scalp"

## Page 2: Activity Log
- **Log Entry Form** — Simple form to record: Action Type (Mow, Fertilize, Pre-emergent, Scalp, Water), Date, and Notes
- **Activity History** — Scrollable list of past entries with icons and timestamps, filterable by type
- **Calendar View** — Monthly calendar showing logged activities as colored dots

## Page 3: Season Schedule
- **2026 Timeline** — Visual timeline showing all key windows for the year:
  - Pre-Emergent: Feb 1 – Mar 15
  - Spring Scalp: Early-Mid March
  - Fertilization cycles: Every 4-6 weeks starting ~2 weeks after scalp
  - Aeration: May-June
- Current date marker on the timeline

## Authentication
- Simple Supabase email/password login (single user)
- Protected routes so only you can access the dashboard
- Users can sign up to have their own dashboard with their own lawn data

## Email Reminders
- Supabase edge function + Resend integration to send email reminders a few days before key action windows (pre-emergent, scalp, fertilization)
- Scheduled via pg_cron to check daily

## Database
- **activities** table — Stores all logged lawn activities (type, date, notes)
- **task_completions** table — Tracks which seasonal checklist items have been marked done

## Design
- Deep lawn green (#166534) primary color, earth tones, clean white backgrounds
- Mobile-first responsive layout
- Lucide icons: Scissors (mow/scalp), Droplets (water), Thermometer (soil temp), Calendar (schedule)