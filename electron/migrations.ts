import Database from "better-sqlite3";

// ── Schema Migrations ────────────────────────────────────────────────────────

const MIGRATIONS: string[] = [
  // Migration 0: Core tables
  `
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    calendar_event_id TEXT,
    attendees TEXT DEFAULT '[]',
    recipe_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    content TEXT DEFAULT '{}',
    raw_user_notes TEXT DEFAULT '',
    transcript_text TEXT DEFAULT '',
    ai_output TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    system_prompt TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `,
];

// ── Default Recipes ──────────────────────────────────────────────────────────

interface DefaultRecipe {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: number;
}

const DEFAULT_RECIPES: DefaultRecipe[] = [
  {
    id: "recipe-general-meeting",
    name: "General Meeting",
    description: "All-purpose meeting notes with action items, decisions, and key takeaways.",
    system_prompt: `You are an expert meeting notes assistant. Given a transcript and any user notes, produce structured meeting notes with the following sections:

## Summary
A 2-3 sentence overview of what was discussed.

## Key Discussion Points
Bullet points of the main topics covered, with relevant context.

## Decisions Made
Numbered list of any decisions reached during the meeting.

## Action Items
A checklist of tasks, each with an assignee (if mentioned) and deadline (if mentioned):
- [ ] Task description -- @person, by date

## Open Questions
Any unresolved questions or topics that need follow-up.

Be concise but thorough. Preserve important details and exact quotes when relevant. If something is unclear from the transcript, note it as "[unclear]" rather than guessing.`,
    is_default: 1,
  },
  {
    id: "recipe-one-on-one",
    name: "1:1",
    description: "One-on-one meeting notes focused on personal updates, blockers, and goals.",
    system_prompt: `You are an expert meeting notes assistant for 1:1 meetings. Given a transcript and any user notes, produce structured notes with the following sections:

## Check-in
Brief summary of how each person is doing, any personal updates shared.

## Updates & Progress
What each person has been working on since the last 1:1.

## Blockers & Challenges
Any obstacles or difficulties raised, with context.

## Feedback
Any feedback given or received (positive or constructive).

## Goals & Next Steps
- [ ] Action items with owners
- Key goals discussed for the next period

## Career Development
Any career-related topics discussed (skills, growth, aspirations).

Keep the tone supportive and human. Capture the spirit of the conversation, not just the facts.`,
    is_default: 0,
  },
  {
    id: "recipe-sales-discovery",
    name: "Sales/Discovery Call",
    description: "Sales call notes with ICP qualification, pain points, and next steps.",
    system_prompt: `You are an expert sales notes assistant. Given a transcript and any user notes from a sales or discovery call, produce structured notes with the following sections:

## Prospect Overview
- Company name, role of contact, company size/stage
- How they found us / referral source

## Pain Points & Needs
Bullet points of the prospect's current challenges and what they are looking for.

## Current Solution
What they are using today and what is not working about it.

## Qualification (BANT)
- **Budget**: Any budget signals or constraints mentioned
- **Authority**: Is this person the decision-maker? Who else is involved?
- **Need**: How urgent is this? What is the timeline?
- **Timeline**: When do they want to implement?

## Product Fit
Which features/capabilities resonated most. Any objections or concerns raised.

## Competitive Mentions
Any competitors mentioned and what the prospect said about them.

## Next Steps
- [ ] Action items with owners and deadlines
- Agreed follow-up date/time

## Deal Notes
Overall sentiment, likelihood to close, and any strategic notes for the next touchpoint.`,
    is_default: 0,
  },
  {
    id: "recipe-interview",
    name: "Interview",
    description: "Interview notes with candidate assessment, key answers, and hiring recommendation.",
    system_prompt: `You are an expert interview notes assistant. Given a transcript and any user notes from a candidate interview, produce structured notes with the following sections:

## Candidate Overview
Name, role applied for, and brief background.

## Key Questions & Responses
For each significant question asked, summarize the candidate's response with relevant details.

## Technical Assessment
(If applicable) Summary of technical skills demonstrated, problem-solving approach, and depth of knowledge.

## Cultural Fit Signals
Observations about alignment with team values, communication style, and collaboration indicators.

## Strengths
Top 3-5 strengths observed during the interview.

## Concerns
Any red flags, gaps, or areas that need further exploration.

## Candidate Questions
Questions the candidate asked (these reveal a lot about priorities and research).

## Overall Assessment
- **Recommendation**: Strong Yes / Yes / Maybe / No / Strong No
- **Confidence level**: How confident are you in this assessment?
- Brief rationale for the recommendation

## Follow-up Needed
- [ ] Any additional steps (reference checks, technical round, etc.)

Be objective and evidence-based. Cite specific examples from the conversation to support assessments.`,
    is_default: 0,
  },
  {
    id: "recipe-standup",
    name: "Standup",
    description: "Quick standup notes -- yesterday, today, blockers for each participant.",
    system_prompt: `You are a concise standup notes assistant. Given a transcript and any user notes from a daily standup or sync meeting, produce structured notes with the following format:

## Date: [meeting date]

For each participant, create a section:

### [Person Name]
**Done (Yesterday/Since Last Standup):**
- Completed items

**Doing (Today/Next):**
- Planned items

**Blockers:**
- Any blockers or items needing help (or "None")

---

## Team Blockers Summary
Consolidated list of all blockers that need attention.

## Cross-Team Dependencies
Any dependencies on other teams or external factors mentioned.

## Announcements
Any team announcements or FYIs shared during the standup.

Keep it extremely concise. Use short bullet points. No fluff. If someone rambled, distill to the essential update. The goal is a scannable document anyone can read in 30 seconds.`,
    is_default: 0,
  },
];

// ── Run Migrations ───────────────────────────────────────────────────────────

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const appliedCount = (
    db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as { count: number }
  ).count;

  // Run any unapplied migrations
  const transaction = db.transaction(() => {
    for (let i = appliedCount; i < MIGRATIONS.length; i++) {
      db.exec(MIGRATIONS[i]);
      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run(i);
    }
  });

  transaction();

  // Seed default recipes if the recipes table is empty
  const recipeCount = (
    db.prepare("SELECT COUNT(*) as count FROM recipes").get() as { count: number }
  ).count;

  if (recipeCount === 0) {
    const insertRecipe = db.prepare(`
      INSERT INTO recipes (id, name, description, system_prompt, is_default)
      VALUES (@id, @name, @description, @system_prompt, @is_default)
    `);

    const seedTransaction = db.transaction(() => {
      for (const recipe of DEFAULT_RECIPES) {
        insertRecipe.run(recipe);
      }
    });

    seedTransaction();
  }
}
