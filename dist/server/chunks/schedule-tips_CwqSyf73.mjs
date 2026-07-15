const SCHEDULE_INTERVIEW_CONVERSATION_ID = "schedule-interview";
const SCHEDULE_TIPS = [
  {
    id: "daily-brief",
    title: "Daily brief",
    description: "Personalized daily briefing on topics you care about most",
    prompt: "Send me a daily briefing about the topics I care about most — AI, software engineering, and public-sector tech.",
    icon: "sun"
  },
  {
    id: "email-monitor",
    title: "Email monitor",
    description: "Scan emails and surface anything that needs attention",
    prompt: "Scan my emails every morning and let me know anything that needs my attention.",
    icon: "mail"
  },
  {
    id: "research-digest",
    title: "Research digest",
    description: "High-signal papers and engineering reports on a cadence",
    prompt: "Send me high-signal papers and engineering reports about agentic systems every Friday.",
    icon: "globe"
  },
  {
    id: "job-scan",
    title: "Opportunity scan",
    description: "Monitor for roles or leads matching your criteria",
    prompt: "Let me know when strong LATAM-to-U.S. part-time AI consulting roles appear.",
    icon: "briefcase"
  },
  {
    id: "weekly-routine",
    title: "Weekly routine",
    description: "Refresh a recurring personal or operational routine",
    prompt: "Refresh my beach-running routine once a week.",
    icon: "activity"
  }
];
const SCHEDULE_INTERVIEW_AGENT_BRIEF = `[schedule_interview mode]
You are conducting a scheduling interview in the Runtime Console Scheduled view.
Deliverable: a registered scheduled workflow the operator can manage (pause, run now, delete).

Interview rules:
1. Clarify task scope before registering — what to do, output format, sources, tone, language.
2. Ask one focused question at a time when required information is missing (timing, scope, format, language).
3. Propose sensible defaults and ask the operator to confirm or adjust (like a briefing scope checklist).
4. Do not register until task description AND cron timing are explicit.
5. When ready to register, include a fenced block exactly in this form (valid JSON inside):

\`\`\`schedule-ready
{"title":"Short title","description":"Full task intent for the workflow runner","cron":"0 9 * * *","icon":"calendar"}
\`\`\`

Icon values: calendar, mail, globe, briefcase, activity, sun.
Cron: 5-field UTC expression. After the block, confirm what was scheduled in plain language.`;

export { SCHEDULE_INTERVIEW_AGENT_BRIEF as S, SCHEDULE_INTERVIEW_CONVERSATION_ID as a, SCHEDULE_TIPS as b };
