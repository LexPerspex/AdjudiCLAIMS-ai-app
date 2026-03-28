# Google Stitch 2.0 Prompt — AdjudiCLAIMS Full Frontend

## Context
AdjudiCLAIMS has a complete backend (76 test files, 2927 tests, 92 API endpoints) but only a scaffold frontend (3 files: root.tsx, routes.ts, home.tsx). This prompt generates the full production frontend as a "cousin" platform to Adjudica (the attorney product by the same company), sharing architectural DNA but diverging for the claims examiner domain.

## Plan
1. Commit current backend work
2. Use the Stitch prompt below to generate the frontend

---

# STITCH 2.0 PROMPT — BEGIN

## Product Identity

**Product:** AdjudiCLAIMS by Glass Box Solutions
**Tagline:** "From Black Box to Glass Box" — Augmented Intelligence for CA Workers' Compensation Claims Professionals
**Users:** Claims examiners, claims supervisors, claims administrators at insurance carriers, TPAs, and self-insured employers
**Core philosophy:** The product IS the training program. Every deadline cited. Every regulation explained. Every decision transparent. Human in the loop, always.

## Architecture & Framework

Build a full production React frontend using:
- **React 19** with **React Router 7** (file-based routing, SSR enabled)
- **Vite 6** build tool
- **Tailwind CSS 4** with a custom design system
- **shadcn/ui** (Radix UI primitives + Tailwind styling)
- **TanStack Query v5** (React Query) for server state
- **Zustand** for client UI state
- **React Hook Form + Zod v4** for forms
- **Lucide React** for icons
- **Framer Motion** for animations
- **TipTap** for rich text editing (draft generation/refinement)

The app is a sibling/cousin to an attorney product (Adjudica) built on the same stack. Share the same architectural patterns but diverge on domain, UX, and compliance constraints.

## Design System

### Color Palette
- **Primary:** `#1E40AF` (Royal Blue — authoritative, trustworthy, claims-professional)
- **Primary-light:** `#3B82F6`
- **Secondary:** `#059669` (Emerald — compliance, progress, success)
- **Warning:** `#D97706` (Amber — deadlines approaching, attention needed)
- **Danger:** `#DC2626` (Red — overdue, blocked, UPL violation)
- **Neutral:** Slate scale (`#0F172A` to `#F8FAFC`)
- **Background:** `#F8FAFC` (slightly warm white)
- **Sidebar:** `#0F172A` (near-black navy)

### UPL Zone Colors (CRITICAL — used throughout)
- **GREEN zone:** `#059669` background badge — factual, safe
- **YELLOW zone:** `#D97706` background badge — statistical, requires disclaimer
- **RED zone:** `#DC2626` background badge — blocked, attorney referral

### Typography
- Font: Inter (system fallback: -apple-system, BlinkMacSystemFont, sans-serif)
- Scale: xs(12), sm(14), base(16), lg(18), xl(20), 2xl(24), 3xl(30)

### Spacing
- Use Tailwind's default 4px grid (p-1 = 4px, p-2 = 8px, etc.)
- Standard page padding: `px-6 py-4`
- Card padding: `p-4` or `p-6`
- Section gaps: `gap-6`

### Component Tokens
- Border radius: `rounded-lg` (8px) for cards, `rounded-md` (6px) for inputs
- Shadows: `shadow-sm` for cards, `shadow-md` for modals, `shadow-lg` for dropdowns
- Transitions: `transition-all duration-200`

## Layout Architecture

### Shell
```
┌──────────────────────────────────────────────────────────┐
│ Sidebar (240px / 64px collapsed)  │  Main Content Area   │
│                                   │                      │
│ [Logo]                            │  [Breadcrumb]        │
│ [Org Switcher]                    │  [Page Header]       │
│                                   │  [Page Content]      │
│ ── Navigation ──                  │                      │
│ Dashboard                         │                      │
│ My Claims                         │                      │
│ Deadlines                         │                      │
│ Documents                         │                      │
│ Calculators                       │                      │
│ Education                         │                      │
│ Compliance                        │                      │
│                                   │                      │
│ ── Tools ──                       │                      │
│ MTUS Lookup                       │                      │
│ Lien Management                   │                      │
│                                   │                      │
│ [User Profile]                    │  [Chat Panel (right)] │
│ [Settings]                        │                      │
└──────────────────────────────────────────────────────────┘
```

### Sidebar
- Dark navy background (`#0F172A`)
- Collapsible (240px → 64px) with chevron toggle
- Logo at top: "AdjudiCLAIMS" + Glass Box icon
- Organization switcher (if user belongs to multiple orgs)
- Navigation sections: Main, Tools, Admin (role-gated)
- Active link: blue highlight bar on left + blue text
- Collapsed: icon-only with tooltips
- User avatar + name at bottom, dropdown for settings/logout

### Main Content
- Dynamic left margin based on sidebar state
- Breadcrumb navigation at top
- Page header with title + action buttons
- Scrollable content area

### Chat Panel
- Right-side slide-out panel (Sheet component)
- Claim-scoped (only appears on claim detail pages)
- Resizable width
- Persistent across tab navigation within a claim

## Route Structure

```
/                          → Redirect to /dashboard or /login
/login                     → Login page (email-based auth)
/training                  → Onboarding training modules (required before app access)
/dashboard                 → Claims queue + deadline summary + compliance score
/claims                    → Claims list (data table)
/claims/:claimId           → Claim detail (tabbed layout)
  /claims/:claimId/overview    → Claim overview + metadata
  /claims/:claimId/documents   → Document library + upload
  /claims/:claimId/deadlines   → Deadline tracker
  /claims/:claimId/investigation → Investigation checklist
  /claims/:claimId/workflows   → Decision workflows
  /claims/:claimId/chat        → Full-page chat (alternative to panel)
  /claims/:claimId/letters     → Generated letters + drafts
  /claims/:claimId/liens       → Lien management
  /claims/:claimId/timeline    → Timeline events
  /claims/:claimId/referrals   → Counsel referrals
/deadlines                 → All deadlines across claims (unified view)
/calculator                → Benefit calculator (TD/PD/death benefit)
/education                 → Education hub (terms, monthly review, refreshers)
/compliance                → Compliance dashboard
/reports                   → Audit reports (role-gated)
/mtus                      → MTUS guideline lookup
/profile                   → User settings
/settings                  → Admin settings (role-gated: ADMIN only)
  /settings/members        → User management
  /settings/organization   → Org settings
```

## Page Specifications

### Dashboard (`/dashboard`)
**Purpose:** Single-pane-of-glass for the examiner's daily work.

**Layout:** 3-column grid on desktop, stacked on mobile.

**Sections:**
1. **Claims Queue** (2/3 width) — Data table of assigned claims
   - Columns: Claim #, Claimant, DOI, Status, Next Deadline (color-coded), Days Open
   - Sort by urgency (overdue deadlines first)
   - Quick filters: Status (Open/Investigation/Accepted), My Claims / All
   - Click row → navigate to claim detail
   - "New Claim" button (top-right)

2. **Deadline Summary** (1/3 width, top) — Card with:
   - Count of OVERDUE (red badge), DUE THIS WEEK (amber badge), UPCOMING (green badge)
   - List of top 5 most urgent deadlines with claim #, type, due date
   - Click → navigate to deadline

3. **Compliance Score** (1/3 width, bottom) — Card with:
   - Circular progress chart (0-100 score)
   - Breakdown: Deadline adherence %, Training completion %, UPL compliance %
   - "View Details" link to /compliance

4. **Education Banner** (full width, top, conditionally shown) — Alert banner:
   - "Monthly compliance review due" or "Regulatory change requires acknowledgment"
   - Dismissible after action taken
   - Links to /education

### Claim Detail (`/claims/:claimId`)
**Purpose:** The examiner's primary workspace for a single claim.

**Layout:** Header + tab navigation + content area + optional chat panel.

**Header:**
- Claim number (large, bold)
- Claimant name
- Status badge (color-coded: OPEN=blue, INVESTIGATION=amber, ACCEPTED=green, DENIED=red)
- Date of injury
- Employer name
- Quick actions: "Start Workflow", "Generate Letter", "Refer to Counsel"
- Graph maturity badge (NASCENT/GROWING/MATURE/COMPLETE) with icon

**Tabs:**
- Overview | Documents | Deadlines | Investigation | Workflows | Chat | Letters | Liens | Timeline | Referrals

**Tab: Overview**
- Claim metadata card (all claim fields, editable inline)
- Body parts (tag chips, editable)
- Reserve amounts (editable, currency formatted)
- Key entities from knowledge graph (if maturity ≥ GROWING):
  - People involved (applicant, physicians, attorneys) with confidence badges
  - Organizations (employer, carrier)
  - Key relationships (TREATS, EVALUATES, EMPLOYED_BY)
- Recent activity feed (last 5 audit events)

**Tab: Documents**
- Data table: Filename, Type, Subtype, Date, OCR Status, Confidence
- Upload button (drag-drop zone)
- OCR status badges: PENDING (gray), PROCESSING (blue spinner), COMPLETE (green), FAILED (red)
- Click row → document viewer (full text with field highlighting)
- Document type filter chips
- Access control: ATTORNEY_ONLY documents hidden from examiners, show "[Restricted]" placeholder

**Tab: Deadlines**
- Timeline-style layout (vertical)
- Each deadline card: Type, Due Date, Days Remaining, Status, Statutory Citation
- Color coding: OVERDUE=red border, DUE_SOON=amber border, ON_TRACK=green border, MET=green fill, WAIVED=gray
- "Mark as Met" / "Waive" action buttons per deadline (with reason modal for waive)
- Statutory authority sidebar: Tier 2 education — show the LC/CCR citation and explanation for each deadline type

**Tab: Investigation**
- Checklist UI (checkboxes with labels)
- Categories: Initial Contact, Documentation, Medical, Employment, Benefits
- Auto-completed items show green check + "Auto-completed by [DocumentType]" badge
- Manual completion with optional notes field
- Progress bar at top (X of Y items complete)
- Each item shows satisfied-by document link (if auto-completed)

**Tab: Workflows**
- List of active workflows for this claim
- Each workflow: title, progress bar (X/Y steps), urgency badge, UPL zone badge
- Click to expand: step-by-step view with:
  - Step number, title, description
  - Status: PENDING (gray), COMPLETED (green check), SKIPPED (yellow, with reason)
  - Action buttons: "Complete" / "Skip" (skip requires reason in modal)
  - Tier 2 education: regulatory citation for each step
  - Auto-completed steps show "Auto-advanced by [DocumentType]" badge
- "Start New Workflow" button → dropdown of available workflows

**Tab: Chat**
- Full-page chat interface (also available as right-side panel)
- Message history (scrollable, newest at bottom)
- Input field with send button
- Each AI response shows:
  - UPL zone badge (GREEN/YELLOW/RED)
  - Citation links (click to open document)
  - YELLOW disclaimer banner (when applicable)
  - RED zone: blocked message with attorney referral CTA
- Tool-use indicators: when AI uses tools (search, graph, calculator), show expandable "Sources" section with:
  - Which tools were called
  - What data was retrieved
  - Confidence of graph entities used
- "Refer to Counsel" button (generates factual summary)
- Session selector (switch between chat sessions)

**Tab: Letters**
- List of generated letters/drafts with status (Draft/Final)
- "Generate New" button → template picker modal:
  - 5 templates: Employer Notification, TD Explanation, Delay Notice, Payment Schedule, Counsel Referral
  - Each shows required fields and estimated completion
- Click letter → full-text viewer with:
  - "Refine with AI" button → opens refinement chat panel
  - "Download PDF" button
  - Revision history timeline
  - Missing fields highlighted in red with "[PENDING]" markers
- AI draft indicator: "AI-Generated" badge with confidence score

**Tab: Liens**
- Lien list table: Claimant, Type, Amount Claimed, Filing Date, Status
- "Add Lien" button → form modal
- Click row → lien detail:
  - Line items table with CPT codes
  - "Compare to OMFS" button → shows fee schedule comparison with discrepancy %
  - OMFS report card with disclaimer
  - Status update dropdown (FILED → RESOLVED / DENIED)

**Tab: Timeline**
- Vertical timeline with event cards
- Each event: date, type badge, description, source document link
- Filter by event type
- Chronological or reverse-chronological toggle

**Tab: Referrals**
- List of counsel referrals with status (PENDING/SENT/RESPONDED)
- Each referral: legal issue, factual summary (collapsible), status badge
- "New Referral" button → form with legal issue description

### Education Hub (`/education`)
**Purpose:** The product IS the training program.

**Sections:**
1. **Regulatory Changes** — Alert cards for recent changes requiring acknowledgment
2. **Monthly Review** — Monthly compliance quiz when due
3. **Quarterly Refreshers** — Quarterly knowledge assessment
4. **Term Glossary** — Searchable list of WC terms with Tier 1 dismiss capability
5. **Regulatory Content** — Tier 2 always-present citations and explanations

**Tier 1 (Dismissible):** Term definition popover/tooltip that can be permanently dismissed. Show a small "?" icon next to technical terms throughout the app. Once dismissed, the icon disappears for that user.

**Tier 2 (Always Present):** Blue info cards with statutory authority + explanation. These appear contextually on every page where regulatory requirements apply (e.g., deadline page shows LC 4650 for TD deadlines). NEVER hidden — this is the Glass Box foundation.

### Benefit Calculator (`/calculator`)
- Three calculator cards: TD Rate, TD Benefit Schedule, Death Benefit
- Each card: input form (AWE, DOI, dates) + result card
- Results show: rate, min/max, statutory caps, injury year schedule
- Tier 2 education: LC 4650, 4653, 4654 citations inline
- Results include a disclaimer: "Calculations based on statutory rates. Verify with defense counsel for complex scenarios."

### Compliance Dashboard (`/compliance`)
- **Examiner view:** Personal compliance metrics (deadline adherence %, UPL compliance %, training completion %)
- **Supervisor view (role-gated):** Team metrics aggregated + individual examiner breakdown
- **Admin view (role-gated):** Organization-wide metrics + DOI audit readiness score
- UPL monitoring section: zone distribution chart (GREEN/YELLOW/RED pie chart), blocked query count, false positive rate

### Training Gate
**CRITICAL:** Before accessing any app feature (except /login and /training), users must complete all 4 training modules. Show a full-screen training gate with:
- Progress indicator (Module 1 of 4)
- Module content (text + questions)
- Quiz at end of each module (passing score required)
- "Continue to App" only after all modules passed

### Login
- Clean centered card
- Email input + "Sign In" button (dev mode: email-only)
- Glass Box branding (logo, tagline)
- Legal disclaimer footer

## Component Patterns

### Data Table
Use TanStack Table with:
- Sortable columns (click header)
- Pagination (10/25/50/100 per page)
- Column visibility toggle
- Row selection (checkbox, for bulk actions)
- Loading skeleton
- Empty state with illustration

### Badges
- Status badges: `<Badge variant="outline|default|destructive">`
- UPL zone badges: custom colors per zone
- Confidence badges: Verified (green shield), Confident (blue), Suggested (amber), AI Generated (gray)

### Cards
- Standard card with header, content, footer
- Metric card with number, label, trend arrow
- Timeline card with date, icon, content

### Modals/Dialogs
- Confirmation dialogs for destructive actions
- Form modals for creation (claim, lien, letter, etc.)
- Full-screen modals for document viewer

### Toast Notifications
- Success (green), Error (red), Warning (amber), Info (blue)
- Auto-dismiss after 5s
- Action buttons (e.g., "Undo", "View")

### Loading States
- Skeleton loaders for data tables and cards
- Spinner for async operations
- Progress bar for document upload/OCR

## API Integration

The backend exposes 92 endpoints across 20 route files. Key patterns:

### Authentication
```typescript
// Login
POST /api/auth/login { email } → { id, email, name, role, organizationId }
// Session check
GET /api/auth/session → user object or 401
// Logout
POST /api/auth/logout → { ok: true }
```

### Data Fetching (React Query hooks)
Create hooks in `app/hooks/api/`:
```typescript
// Example pattern
export function useClaims(params?: { take?: number; skip?: number }) {
  return useQuery({
    queryKey: ['claims', params],
    queryFn: () => fetch(`/api/claims?${new URLSearchParams(params)}`).then(r => r.json()),
  });
}

export function useClaim(claimId: string) {
  return useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => fetch(`/api/claims/${claimId}`).then(r => r.json()),
  });
}
```

### Key Endpoints to Consume
- Claims: GET/POST /api/claims, GET/PATCH /api/claims/:id
- Documents: GET/POST /api/claims/:claimId/documents
- Chat: POST /api/claims/:claimId/chat (returns zone, content, citations, wasBlocked)
- Deadlines: GET /api/claims/:claimId/deadlines, GET /api/deadlines (all)
- Investigation: GET/PATCH /api/claims/:claimId/investigation
- Workflows: GET/POST/PATCH workflow start/step completion
- Calculator: POST /api/calculator/td-rate, /td-benefit, /death-benefit
- Education: GET/POST all /api/education/* endpoints
- Training: GET/POST /api/training/* endpoints
- Letters: GET/POST letter generation + draft refinement
- Liens: Full CRUD + OMFS comparison
- Compliance: GET /api/compliance/examiner, /team, /admin
- Audit: GET /api/audit/claim/:claimId

### Response Patterns
- Lists: `{ items: [], total, take, skip }`
- Single: `{ id, ...fields }`
- Errors: `{ error: string, details?: [] }`
- Status codes: 200 (success), 201 (created), 204 (deleted), 400/401/403/404/409/422

## RBAC (Role-Based Access Control)

| Feature | CLAIMS_EXAMINER | CLAIMS_SUPERVISOR | CLAIMS_ADMIN |
|---------|----------------|-------------------|--------------|
| View own claims | Yes | Yes | Yes |
| View team claims | No | Yes | Yes |
| View all claims | No | No | Yes |
| Create claims | Yes | Yes | Yes |
| Edit claims | Own only | Team | All |
| Delete documents | No | Yes | Yes |
| Chat | Yes | Yes | Yes |
| Team compliance | No | Yes | Yes |
| Org compliance | No | No | Yes |
| Audit export | No | No | Yes |
| User management | No | No | Yes |
| Deadline adherence report | No | Yes | Yes |
| Audit readiness report | No | No | Yes |

Implement RBAC checks in:
1. Sidebar: hide menu items user can't access
2. Route loaders: redirect to /forbidden if unauthorized
3. UI: disable/hide buttons user can't use

## UPL Compliance (NON-NEGOTIABLE)

Every AI-generated response must display its UPL zone:
- **GREEN:** Small green badge, no disclaimer
- **YELLOW:** Amber badge + full disclaimer: "This information includes statistical/comparative data. Consult defense counsel before making legal determinations."
- **RED:** Red badge + full block: "This question requires legal analysis. Please contact defense counsel." + "Refer to Counsel" button

The chat endpoint returns `zone`, `wasBlocked`, `disclaimer` fields. The frontend MUST:
1. Display the zone badge on every AI message
2. Show the disclaimer text when `disclaimer` is non-null
3. Show a blocked message (not the AI content) when `wasBlocked` is true
4. Show a "Refer to Counsel" CTA on RED zone blocks

## Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation for all interactive elements
- Screen reader support via Radix UI primitives
- Focus management on modals and dialogs
- Color contrast ratios ≥ 4.5:1
- aria-labels on icon-only buttons

## Responsive Design
- Sidebar collapses to 64px on smaller screens
- Data tables: horizontal scroll on mobile
- Cards: stack vertically on mobile
- Chat panel: full-screen on mobile (not side panel)
- Breakpoints: sm(640), md(768), lg(1024), xl(1280), 2xl(1536)

## File Organization
```
app/
├── root.tsx                      # Root layout
├── app.css                       # Tailwind imports + custom CSS
├── routes.ts                     # Route definitions
├── routes/                       # Page components (React Router 7 convention)
│   ├── _auth.tsx                 # Auth layout (no sidebar)
│   ├── _auth.login.tsx
│   ├── _app.tsx                  # App layout (with sidebar)
│   ├── _app.dashboard.tsx
│   ├── _app.claims.tsx
│   ├── _app.claims.$claimId.tsx  # Claim detail (tabs)
│   ├── _app.claims.$claimId.overview.tsx
│   ├── _app.claims.$claimId.documents.tsx
│   ├── _app.claims.$claimId.deadlines.tsx
│   ├── _app.claims.$claimId.investigation.tsx
│   ├── _app.claims.$claimId.workflows.tsx
│   ├── _app.claims.$claimId.chat.tsx
│   ├── _app.claims.$claimId.letters.tsx
│   ├── _app.claims.$claimId.liens.tsx
│   ├── _app.claims.$claimId.timeline.tsx
│   ├── _app.claims.$claimId.referrals.tsx
│   ├── _app.deadlines.tsx
│   ├── _app.calculator.tsx
│   ├── _app.education.tsx
│   ├── _app.compliance.tsx
│   ├── _app.reports.tsx
│   ├── _app.mtus.tsx
│   ├── _app.profile.tsx
│   ├── _app.settings.tsx
│   ├── _app.settings.members.tsx
│   ├── _app.settings.organization.tsx
│   └── training.tsx              # Training gate (no app layout)
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── layout/                   # Sidebar, header, breadcrumb
│   ├── claims/                   # Claim-specific components
│   ├── documents/                # Document viewer, upload
│   ├── chat/                     # Chat panel, messages, citations
│   ├── deadlines/                # Deadline cards, timeline
│   ├── workflows/                # Workflow steps, progress
│   ├── education/                # Tier 1/Tier 2 components
│   ├── calculator/               # Calculator forms + results
│   ├── compliance/               # Dashboard charts
│   ├── letters/                  # Letter viewer, draft editor
│   ├── liens/                    # Lien management
│   ├── investigation/            # Checklist UI
│   └── graph/                    # Entity panel, confidence badges
├── hooks/
│   ├── api/                      # React Query hooks per domain
│   └── use-*.ts                  # UI hooks
├── services/                     # API client functions
├── stores/                       # Zustand stores
├── lib/                          # Utilities (cn, formatDate, etc.)
├── constants/                    # Route paths, config values
├── types/                        # TypeScript interfaces
└── schemas/                      # Zod validation schemas
```

## Key Interactions

### Document Upload Flow
1. User drops file on upload zone
2. Frontend calls POST /api/claims/:claimId/documents (multipart)
3. Response returns document with `ocrStatus: 'PENDING'`
4. Frontend polls document status every 3s
5. When status → 'COMPLETE': show document in list, refresh claim data (workflows may have been triggered)

### Chat Flow
1. User types message, clicks send
2. Frontend calls POST /api/claims/:claimId/chat { message, sessionId }
3. Show loading state (typing indicator)
4. Response includes: zone, content, citations, wasBlocked, disclaimer, graphContextIncluded
5. Display message with zone badge, citation links, disclaimer (if YELLOW), block message (if RED)
6. If graphContextIncluded: show "Graph context used" indicator

### Workflow Completion Flow
1. User clicks "Complete" on a workflow step
2. Frontend calls PATCH /api/claims/:claimId/workflows/:workflowId/steps/:stepId { action: 'complete' }
3. Update progress bar, check if workflow is now complete
4. If complete: show celebration animation + "Workflow Complete" banner

### Letter Refinement Flow
1. User generates initial draft (POST /api/claims/:claimId/drafts/generate)
2. Reads draft in viewer
3. Types refinement instruction (e.g., "Add the WPI rating to the medical section")
4. Frontend calls POST /api/drafts/:draftId/refine { instruction }
5. Shows diff or new version with "Changes" summary
6. User can refine again (up to N iterations)

# STITCH 2.0 PROMPT — END
