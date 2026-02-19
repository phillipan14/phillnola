# Phillnola — Design Doc

**Date:** 2026-02-19
**Status:** Approved
**Tone:** Professional open-source project. Clean, minimal, Granola-inspired.

## Overview

An open-source Electron desktop app that captures system audio during meetings (no bot), transcribes it via OpenAI Whisper, and uses AI (GPT-4o or Claude) to merge your typed notes with the transcript into structured meeting summaries. BYOK (bring your own API key). Local-first, no backend required.

**Name:** Phillnola (Phillip + Granola)
**Positioning:** "The open-source AI meeting notepad. No bot. No server. Your keys. Your data."

## Architecture

- **Format:** Electron desktop app (macOS first, Windows second)
- **Frontend:** React 19 + Tailwind CSS 4
- **Editor:** TipTap (ProseMirror-based rich text editor)
- **Audio capture:** Electron `desktopCapturer` API + `getUserMedia` for mic
- **Transcription:** OpenAI Whisper API (user's key)
- **Note generation:** OpenAI GPT-4o OR Anthropic Claude (user chooses provider)
- **Storage:** SQLite via better-sqlite3 (local, no server)
- **Calendar:** Google Calendar API (OAuth 2.0)

## Core Product Loop

1. App sits in system tray, watches Google Calendar for upcoming meetings
2. Meeting starts → auto-captures system audio + mic
3. User types rough notes in the TipTap editor during the meeting
4. Meeting ends → audio chunks sent to Whisper for transcription
5. Transcript + user notes sent to GPT-4o or Claude with a "recipe" prompt
6. Structured notes appear in the editor — action items, decisions, summary
7. One-click export to Markdown, copy to clipboard

## Screens & UX

### 1. Onboarding (first launch)
- Paste API key (OpenAI required for Whisper; optionally add Anthropic for Claude)
- Connect Google Calendar (OAuth)
- Choose default recipe (General Meeting, 1:1, Sales Call)

### 2. Main Window — Meeting Notepad
- Clean, minimal TipTap editor (Notion-like)
- Top bar: meeting title (from calendar), attendees, recording indicator
- Left sidebar: upcoming meetings from calendar, past notes (searchable)
- Bottom bar: "Recording..." with waveform visualizer, timer, stop button
- User types rough notes during the meeting

### 3. Post-Meeting — AI Enhancement
- Meeting ends → processing spinner ("Transcribing... Structuring...")
- Notes transform in-place: user's rough notes merged with AI structure
- Sections: Summary, Key Decisions, Action Items (with assignees), Discussion Notes
- User can edit everything after — it's just a rich text doc
- "Regenerate with different recipe" button

### 4. System Tray
- Phillnola icon in menu bar/system tray
- Shows next meeting countdown
- Click to start/stop recording manually
- Right-click: Settings, Quit

### 5. Settings
- API key management (OpenAI key for Whisper, choose GPT-4o or Claude for structuring)
- Google Calendar connection
- Default recipe selection
- Audio input/output device selection
- Export preferences (Markdown, JSON)
- Storage location

## Audio Capture Architecture

```
System Audio (desktopCapturer) ──┐
                                  ├── MediaRecorder → WebM chunks (30s each)
Microphone (getUserMedia) ───────┘
                                        │
                                        ▼
                              Local temp storage (~/.phillnola/recordings/)
                                        │
                                        ▼ (meeting ends)
                              Send chunks to Whisper API (parallel)
                                        │
                                        ▼
                              Transcript text (with timestamps)
                                        │
                                        ▼
                              Merge with user's typed notes
                                        │
                                        ▼
                              Send to GPT-4o or Claude with recipe prompt
                                        │
                                        ▼
                              Structured meeting notes in editor
```

- Audio chunked into 30-second WebM segments during recording
- Chunks stored locally in temp dir, deleted after transcription
- Whisper API called per-chunk in parallel for speed
- Transcript segments reassembled with timestamps

## Recipes (Customizable AI Prompts)

Pre-built templates that shape how the AI structures the output:

| Recipe | Output Format |
|--------|---------------|
| General Meeting | Summary, decisions, action items, notes |
| 1:1 | Wins, challenges, action items, follow-ups |
| Sales/Discovery Call | Pain points, budget signals, next steps, objections |
| Interview | Candidate strengths, concerns, recommendation, key quotes |
| Standup | Yesterday, today, blockers per person |

Users can create custom recipes — just a saved system prompt.

## Data Model (SQLite)

```sql
meetings: id, title, date, duration_seconds, calendar_event_id, attendees (JSON), recipe_id, created_at
notes: id, meeting_id, content (TipTap JSON), raw_user_notes, transcript_text, ai_output, created_at, updated_at
recipes: id, name, description, system_prompt, is_default, created_at
settings: key, value (openai_key, anthropic_key, ai_provider, calendar_token, audio_device, etc.)
```

## AI Provider Support

| Provider | Transcription | Note Structuring |
|----------|--------------|------------------|
| OpenAI | Whisper API (required) | GPT-4o (optional) |
| Anthropic | — | Claude (optional) |

OpenAI key is always required (for Whisper). User chooses GPT-4o or Claude for the note structuring step in Settings.

## v1 MVP Scope

- Electron app with system tray (macOS)
- TipTap notepad editor
- System audio + mic capture
- Whisper transcription (BYOK)
- AI note structuring (GPT-4o or Claude, BYOK)
- 5 built-in recipes + custom recipe editor
- Google Calendar integration
- Local SQLite storage
- Search across past meetings
- Markdown export + clipboard copy
- Clean README with screenshots and badges

## Non-Goals for v1

- No collaboration/sharing
- No mobile app
- No Slack/Notion/CRM integrations
- No team features
- No server/backend
- No Windows support (macOS first)

## Visual Design

- Light + dark theme (follows system preference)
- Clean, minimal — Notion/Linear inspired
- Monospace for timestamps, sans-serif for content
- Accent color: warm amber/gold (granola theme)
- Subtle animations for recording state, processing
