# AICTE FlowGuard — Intelligent Approval Workflow & Compliance Governance Platform

> **Smart India Hackathon (SIH 2026) Prototype**  
> *A secure, configurable full-stack platform for managing AICTE approval workflows, institutional compliance undertakings, statutory document validity, automated SLA tracking, and multi-tier escalations.*

---

## 🏛 Executive Overview

**AICTE FlowGuard** transforms institutional approval processes across technical and management education institutes throughout India. It introduces end-to-end transparency, strict role-based data isolation, automated SLA tracking with hierarchical escalations, Expert Visit Committee (EVC) lifecycle management, tamper-evident audit trails, and human-in-the-loop AI case summaries.

The platform is backed by a persistent **SQLite Database Engine** (`node:sqlite`) with relational constraints, foreign keys, and indexes, coordinated by a full-stack Node.js server with REST API endpoints, background cron-style SLA schedulers, and a rich, accessible governance user interface.

---

## ✨ System Architecture & Key Capabilities

```
                  ┌────────────────────────────────────────┐
                  │   AICTE FlowGuard Web Application      │
                  │  HTML5 + Responsive CSS3 + Vanilla JS  │
                  └──────────────────┬─────────────────────┘
                                     │ REST API / JWT
                  ┌──────────────────▼─────────────────────┐
                  │       Node.js Full-Stack Server        │
                  │              (Port 5500)               │
                  ├──────────────────┬─────────────────────┤
                  │  Workflow Engine │ Automated Scheduler │
                  │  Auth & RBAC     │ AI Case Briefs      │
                  └──────────────────┬─────────────────────┘
                                     │ Native SQLite Driver
                  ┌──────────────────▼─────────────────────┐
                  │     SQLite Relational Database         │
                  │       (data/flowguard.db)              │
                  └────────────────────────────────────────┘
```

### 1. Persistent Relational Database (SQLite)
- Built using native Node.js SQLite (`node:sqlite`) in WAL journal mode with foreign key enforcement.
- Tables: `users`, `institutions`, `regions`, `workflow_templates`, `applications`, `stage_history`, `evc_events`, `undertakings`, `undertaking_submissions`, `documents`, `escalation_rules`, `notifications`, `audit_trail`.
- Automatically migrates and seeds on first launch.

### 2. Multi-Stage Configurable Approval Workflows
- **Configurable Workflow Templates**: Pipeline definitions (`Scrutiny + EVC + SAC`, `Scrutiny Only`, `EVC + SHC`, etc.) stored in the database.
- **Interactive Visual Pipeline**: Step-by-step progress nodes with SLA countdowns and overdue badges.
- **Stage Operations**: Authorized officers can **Advance Stage**, **Return with Reasons**, **Approve**, or **Reject** with audit logging.

### 3. Automated SLA Scheduler & Deduplication Engine
- Runs periodically in the background (and triggerable via `POST /api/scheduler/run` or UI button).
- Scans active applications, undertakings, documents, and pending EVCs.
- **Multi-Tier Escalations**: Level 1 (Bureau Officer) and Level 2 (Competent Authority) triggers.
- **Deduplication Safeguard**: Prevents alert spamming by checking a 24-hour delivery window. Repeated runs generate zero duplicate alerts.

### 4. Expert Visit Committee (EVC) Inspection Hub
- Inspection lifecycle tracking: `Pending Schedule` ➔ `Scheduled` ➔ `Completed`.
- Schedule visits, assign committee leads, track physical campus inspections, and file formal recommendation reports (Favorable, Deficiencies Noted, Unfavorable).

### 5. Institutional Undertakings & Evidence Verification
- Track time-bound conditional requirements (e.g. 15:1 Student-Faculty Ratio, Fire Safety NOCs, permanent affiliation proofs).
- Institutional document upload interface with review notes.
- Regional Officer verification workflow: `Verified`, `Returned for Clarification`, or `Rejected`.

### 6. Statutory Document Validity Monitor
- Tracks land ownership certificates, 30-year lease deeds, municipal building completion certificates, and Fire NOCs.
- Dynamic status tracking: **Valid**, **Expiring Soon (within 60 days)**, **Expired**, and **Renewal Pending**.

### 7. AI-Assisted Case Briefs (Safe Human-in-the-Loop)
- **Executive Summaries**: Synthesizes application status, SLA countdowns, and deficiencies.
- **APH Compliance Checklists**: Generates statutory criteria checklists for new institutes and intake expansions.
- **Regulatory Search**: Resolves workflow concepts (EVC, SAC, SHC, Cadre Ratios).
- **Strict Safeguard**: Clearly labeled as AI-generated guidance. All decisions remain strictly with authorized human officials.

### 8. Role-Based Access Control (RBAC) & Data Scoping
Server-enforced least-privilege scoping across 6 distinct user roles:
- **Institution**: Restricted strictly to own institutional applications and documents.
- **Regional Officer**: Scoped by geographic jurisdiction (NR, SR, WR, ER).
- **Bureau Officer**: Cross-regional oversight for assigned bureaus and escalated files.
- **Committee / EVC Expert**: Scoped to assigned inspection visits.
- **Competent Authority**: National oversight with final approval and rejection discretion.
- **System Administrator**: Full system configuration, template definitions, user management, and seed resetting.

---

## 👥 Demo Accounts & Credentials

All demo accounts share the password: `demo123`

| Role | Username | Password | Full Name | Primary Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Regional Officer (North)** | `ro_north` | `demo123` | Dr. Priya Mehta | Northern Region Office |
| **Regional Officer (South)** | `ro_south` | `demo123` | Dr. Suresh Kumar | Southern Region Office |
| **Institution User** | `inst_demotech`| `demo123` | Rajesh Sharma | Demo Technical Institute (North) |
| **Institution User** | `inst_southeng`| `demo123` | Lakshmi Venkatesh | Southern Engineering College (South) |
| **Bureau Officer** | `bo_bureau1` | `demo123` | Ananya Gupta | Engineering Bureau / Escalations |
| **EVC Expert** | `evc_expert1` | `demo123` | Prof. K. Ramachandran | Expert Visit Committee Lead |
| **Competent Authority** | `ca_authority` | `demo123` | Dr. Meera Joshi | Final Approval Authority |
| **Administrator** | `admin` | `demo123` | System Administrator | Full Configuration & User Control |

*(Tip: On the login screen, click **"View Demo Accounts"** to see quick one-click login buttons for instant role switching!)*

---

## 🚀 Running the Platform Locally

### Prerequisites
- Node.js v22+ (Native SQLite `node:sqlite` support)
- Modern web browser (Chrome, Edge, Firefox, Safari)

### Option 1: Start Full-Stack Server (Recommended)
```bash
# Start the full-stack server
node server.js
```
The server will output:
```
==============================================================
 🛡️  AICTE FlowGuard Full-Stack Platform Active!
 --------------------------------------------------------------
 🌐 Web Application URL : http://localhost:5500
 🏥 API Health Check    : http://localhost:5500/api/health
 🗄️ Database Engine     : Native node:sqlite (data/flowguard.db)
 ⏱️ SLA Scheduler       : Active (Due date checks & escalations)
==============================================================
```
Open **`http://localhost:5500`** in your browser.

> **Note on Browser Access**: Always access the platform via `http://localhost:5500` rather than opening `index.html` directly as a file (`file:///...`). Accessing through the local server ensures the frontend connects directly to the native SQLite database, REST API endpoints, background SLA scheduler, and file upload system. All layout modal overlays are configured with strict `[hidden]` priority rules to prevent visual bleeding.

### Option 2: Running with Docker
```bash
# Build and run container with persistent volumes
docker compose up --build -d

# Check health
curl http://localhost:5500/api/health
```

---

## 🧪 Automated Testing & Verification

A comprehensive automated test suite verifies database schema, password hashing, JWT signatures, table-aware RBAC data scoping, cross-institution isolation, regional jurisdiction boundaries, workflow transitions, scheduler deduplication, AI services, file upload extension allowlists, and path traversal guards:

```bash
npm test
# or
node tests/run-tests.js
```

### Verified Test Battery (34 Passed, 0 Failed):
- `✓ All core tables and indexes are created in SQLite`
- `✓ Database seeded with realistic demo fixtures`
- `✓ Password hashing generates valid salt and PBKDF2 hash`
- `✓ User authentication returns signed JWT token`
- `✓ Tampered token is rejected`
- `✓ Role permissions enforced correctly`
- `✓ SQL data scoping filters records by institution and region`
- `✓ Table-aware SQL scoping prevents non-existent column errors across all entities`
- `✓ Cross-institution isolation is strictly enforced`
- `✓ All 8 demo accounts authenticate successfully and have assigned roles`
- `✓ Authorized officer can advance application stage`
- `✓ Regional officer cannot advance application outside their jurisdiction`
- `✓ Unauthorized user is blocked from advancing workflow`
- `✓ Returning application records mandatory reason and changes status`
- `✓ Competent Authority can approve application`
- `✓ Scheduler runs pass 1: detects overdue and triggers alerts`
- `✓ Scheduler runs pass 2: deduplication prevents repeated alert spamming`
- `✓ AI Service generates application summary with human-in-the-loop disclaimers`
- `✓ AI Service generates APH compliance checklist for program types`
- `✓ AI Regulatory query helper resolves workflow terminology`
- `✓ Upload extension validation accepts valid formats and blocks dangerous formats`
- `✓ Path traversal attempts are detected and prevented`
- `✓ Admin endpoints are restricted to admin role only`
- `✓ Repeated failed logins are rate-limited`
- `✓ Valid HTTP login returns signed JWT, user payload, and HttpOnly cookie`
- `✓ Missing or invalid credentials return 400 Bad Request or 401 Unauthorized`
- `✓ JWT algorithm verification, expiration, and tampering guards`
- `✓ Session restoration via /api/auth/me with Bearer token and Cookie`
- `✓ Logout clears session cookie and records audit trail`
- `✓ All eight seeded demo accounts authenticate and return correct roles and scopes`
- `✓ Disabled accounts cannot authenticate or access protected endpoints`
- `✓ Institutional registration assigns least privilege role and rejects role escalation`
- `✓ Registration validates inputs and prevents duplicate username or email`
- `✓ Administrator user provisioning, role validation, and disable toggle`
- **Result: 34 Passed, 0 Failed**

---

## 📂 Project Structure

```
26262/
├── server.js                    # Full-stack HTTP server, REST API & file handlers
├── server/
│   ├── db.js                    # Native SQLite database, schema, migrations & seed
│   ├── auth.js                  # Authentication, RBAC, constant-time crypto & table-aware scoping
│   ├── workflow-engine.js       # Workflow state machine & regional jurisdiction checks
│   ├── scheduler.js             # Automated SLA due-date scanner & escalation engine
│   └── ai-service.js            # AI Case Briefs, checklists & regulatory search
├── tests/
│   ├── run-tests.js             # Automated regression test suite (34 tests)
│   └── auth-lifecycle.test.js   # Full-stack authentication lifecycle integration tests
├── data/
│   └── flowguard.db             # Persistent SQLite database file
├── uploads/                     # Document storage repository (protected by router)
├── Dockerfile                   # Production container definition
├── docker-compose.yml           # Container orchestration with volume mounts
├── .env.example                 # Environment configuration template
├── package.json                 # Project configuration & npm scripts
├── index.html                   # Single-Page Application interface
├── css/
│   ├── variables.css            # Design tokens, color schemes & dark mode
│   ├── base.css                 # Base resets, [hidden] rules, and typography
│   ├── components.css           # Badges, cards, tables, SVG charts, modals
│   ├── layout.css               # App shell, navigation, grids
│   ├── pages.css                # Page-specific views and stage timelines
│   └── responsive.css           # Breakpoints for mobile, tablet, and desktop
└── js/
    ├── api.js                   # REST API client bridge with RFC 7807 problem details
    ├── utils.js                 # Formatting, XSS prevention, pagination
    ├── store.js                 # Synchronized SQLite bridge & repository cache
    ├── seed.js                  # Client fixture normalizers & fallback seeds
    ├── auth.js                  # Client session & server authentication
    ├── router.js                # Protected async SPA routing & error boundary
    ├── components.js            # Shared UI components, charts & loading feedback
    ├── app.js                   # Client lifecycle bootstrap
    └── pages/
        ├── dashboard.js         # Real-time metrics & pendency overview
        ├── applications.js      # Scoped application registry & submission
        ├── application-detail.js# Stage timeline, actions, and AI Case Brief
        ├── evc.js               # EVC scheduling, visits, and reports
        ├── undertakings.js      # Compliance tracking & evidence verification
        ├── documents.js         # Statutory validity & renewal tracking
        ├── notifications-page.js# Real-time alert center & escalations
        ├── reports.js           # Regional SLA benchmarks & CSV export
        ├── audit.js             # Provenance audit stream & JSON export
        └── admin.js             # Workflow templates & escalation rules
```

---

*AICTE FlowGuard — Empowering Institutional Excellence through Transparent, Automated Governance.*
