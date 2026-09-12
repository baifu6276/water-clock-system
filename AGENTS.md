# AGENTS.md

## Project purpose

This repository is the frontend for a plumbing/electrical construction management system. The current production architecture is intentionally simple and must be preserved unless a migration is explicitly approved:

- Frontend: GitHub Pages + plain HTML/CSS/JavaScript
- Mobile identity/UI: LINE LIFF
- Backend/API: Google Apps Script (GAS)
- Data store: Google Sheets

The system is already in active use and contains completed attendance, payroll, daily report, and site daily report workflows. Changes must be incremental and must not break existing production behavior.

## Working language and user experience

- User-facing text should use Traditional Chinese unless there is a clear technical reason not to.
- The primary user is not a programmer. Keep UI labels human-readable and avoid exposing internal identifiers such as `SITE001`, `LOC-*`, `PRG-*`, or item codes in formal production UI unless needed for diagnostics.
- Prefer simple, mobile-friendly interactions suitable for use inside LINE LIFF.

## Git and release rules

These rules are mandatory:

1. Never make feature changes directly on `main`.
2. Work on a feature branch. For the current progress module, use `feature/progress-v1` unless explicitly instructed otherwise.
3. Never merge into `main` without explicit user approval.
4. Never create or merge a production Pull Request without explicit user approval.
5. Before proposing a PR, inspect the diff and run practical checks appropriate to the changed files.
6. Do not rewrite or remove working completed modules as part of unrelated cleanup.
7. Do not silently delete existing test artifacts or historical files. If cleanup is recommended, report it separately.
8. Do not expose secrets, credentials, tokens, private keys, or personal data in commits.

## Existing frontend architecture

The formal frontend uses plain global JavaScript loaded from `index.html`.

Important files:

- `index.html` — production page and admin panels
- `css/style.css` — shared production styles
- `js/config.js` — LIFF ID and GAS endpoint configuration
- `js/app.js` — shared runtime state and common helpers
- `js/api.js` — shared API transport
- `js/auth.js` — LIFF/bootstrap startup flow
- `js/attendance.js` — attendance/GPS/clocking
- `js/daily-report.js` — employee daily reports and report review
- `js/admin-attendance.js` — makeup punches, attendance review, daily settlement, shared helpers
- `js/payroll.js` — payroll V1
- `js/site-daily-report.js` — site daily report V1

Do not convert the application to a framework, module bundler, SPA router, TypeScript, npm build, or other large architecture change unless explicitly approved.

## API transport contract

Preserve the existing GAS request pattern unless an intentional backend migration is approved:

- HTTP method: `POST`
- `Content-Type: text/plain;charset=utf-8`
- JSON serialized request body
- `redirect: "follow"`
- `action` field used by GAS to dispatch operations

The current frontend sends LINE user ID to the backend. This is a known security limitation. Do not make the client trust model worse. A future security hardening task should validate LINE-issued identity/token server-side.

## Roles and authorization

System roles are separate from employee grade:

- `OWNER`
- `ADMIN`
- `SITE_MANAGER`
- `EMPLOYEE`

Business-critical rules:

- `OWNER` / `ADMIN`: company-wide management.
- `SITE_MANAGER`: meaningful management authority, but only for sites they are permitted to manage.
- `EMPLOYEE`: own operational functions only unless otherwise authorized.
- Frontend visibility is not sufficient security. Backend actions must enforce authorization and site scope.
- Never broaden `SITE_MANAGER` access to unrelated sites.

Employee grade is separate from system role and may include 老闆、領班、師傅、半技、學徒. Do not infer permissions solely from grade.

## Auditability and record integrity

The project is being designed so it can later support stronger ISO 9001-style traceability. The software itself must never be described as making the company ISO certified.

For critical records:

- Do not silently overwrite finalized/confirmed historical records.
- Prefer correction, return-for-edit, void, version, or append-only audit records.
- Preserve who changed a record, when, and why when the business flow requires it.
- Do not silently delete historical business data.
- Treat locks/finalization rules as server-side rules, not UI-only behavior.

## Attendance and payroll invariants

Attendance V2 and Payroll V1 are already working core modules. Avoid breaking these rules:

- Employees may work at multiple sites in one day.
- An open work segment blocks a new clock-in.
- Payroll source is `出勤日結`, not raw site review rows, to avoid double counting multi-site work.
- `出勤日結` is one row per employee per date.
- `薪資結算` is one row per employee per month.
- Finalized payroll must not be silently recalculated/overwritten.
- Daily-wage base pay is workdays × salary rate.
- Overtime day values are already day-equivalent; do not multiply them by the overtime rate again unless the payroll model is intentionally redesigned.

Required future payroll work must not be forgotten:

- Add `薪資明細` for expandable earning/deduction line items.
- Add `薪資項目設定` for configurable item definitions.
- Labor/health insurance, bonuses, allowances, and deductions must be configurable rather than hard-coded columns.
- Distinguish gross pay (應發) and net pay (實發).
- Add individual and later batch payslip PDF/print support.
- Preserve finalized payroll history and correction audit trail.

## Daily report and site daily report invariants

Daily report flow is already complete and should remain compatible:

- Employee submits daily report items.
- Management can confirm or return for correction.
- A returned report is edited/resubmitted using the same report ID and audit history.
- Existing fields include site, work area, floor, unit, category, work item, completed content, quantity, unit, progress percentage, issue/help/tomorrow plan.

Site daily report V1 is already production-ready:

- One row per date × site.
- Aggregates only confirmed daily reports.
- Confirmed site daily reports are locked from normal refresh.
- Current flow is effectively `待確認 → 已確認`.

Do not change these workflows as part of progress-module work unless explicitly required.

## Engineering progress module — current design

The progress module is the current feature under development.

### Google Sheets data model already created

The production spreadsheet already contains these sheets:

- `工程位置設定`
- `工程項目設定`
- `工程進度`
- `工程進度異動紀錄`

Do not recreate them or invent a parallel schema without approval.

### Core hierarchy

Use this hierarchy conceptually:

`工地 → 棟別／區域 → 樓層 → 戶別 → 工程類別／工作項目`

The UI should present human-readable names. Internal IDs exist for stable joins and traceability but should normally remain hidden.

### Current-state uniqueness

The current progress state is unique by:

`siteId + locationId + itemCode`

For the same unique key, saving progress updates the existing current-state row rather than creating another current-state row.

### Audit model

- `工程進度` = current state.
- `工程進度異動紀錄` = append-only history.
- Meaningful changes should append an audit row.
- A no-op save where values are identical must NOT create a meaningless audit row.
- Confirmation must remain traceable.

### Percentage semantics

Never add or sum progress percentages across days. Example:

- Day 1: 90%
- Day 2: 100%

The current progress becomes 100%, not 190%.

If planned quantity is available, progress percentage may be calculated from completed quantity / planned quantity. Do not invent cross-item project total formulas until weighting/business rules are explicitly defined.

### Existing backend V1 actions

The deployed GAS backend already supports these progress actions:

- `adminProgressBootstrap`
- `adminProgressLocationSave`
- `adminProgressItemSave`
- `adminProgressList`
- `adminProgressUpsert`
- `adminProgressConfirm`

Assume these actions exist in production unless live testing proves otherwise. The GAS source is not currently version-controlled in this repository. Do not invent replacement backend code merely because `.gs` files are absent here.

### Permissions for progress

- `OWNER` / `ADMIN`: manage all sites, location master data, item master data, progress, and confirmation.
- `SITE_MANAGER`: manage/update/confirm progress only for sites they are allowed to manage.
- `SITE_MANAGER` must not edit global location/item master settings unless explicitly approved.

### Known backend behavior already validated

A live test has already validated the intended current-state pattern:

- 10 planned / 5 completed → 50%
- Same key changed to 9 completed → same current row becomes 90%, no duplicate current row
- Confirmation marks that current row confirmed
- Audit history recorded create, update, and confirm events

A known issue to fix in formal work: identical/no-op updates currently may create an unnecessary audit entry.

### Formal progress UI goals

The formal production progress module should eventually provide:

1. OWNER/ADMIN master setup UI for progress locations and progress items.
2. OWNER/ADMIN/SITE_MANAGER progress management with proper site scope.
3. Human-readable labels only in normal UI.
4. Current progress list/dashboard with clear progress bars/status.
5. No-op audit suppression.
6. Monthly calendar/Gantt-style planning and progress view.
7. Later mapping/sync from confirmed daily reports so workers do not enter the same work twice.

Do not implement daily-report auto-sync until stable mapping exists between free-text daily report locations/items and standardized progress location/item master data.

## UI and JavaScript change rules

- Preserve existing completed functions unless there is a demonstrated defect.
- Prefer adding a dedicated `js/progress.js` rather than placing new progress logic into unrelated modules.
- Keep progress CSS scoped to progress containers/classes so shared form/card styles are not accidentally changed.
- Avoid creating another `window.onload` handler that overwrites existing startup logic.
- Be careful with `openAdminPanel()` and script load order because the current app uses global functions and wrappers.
- Do not copy unsafe inline `onclick` string-building patterns into new code. Prefer event listeners/data attributes when practical.
- Do not make progress availability depend on successful GPS acquisition.
- Avoid adding heavy work to initial LIFF startup. Load progress data when the user opens the progress area where practical.

## Performance guidance

Major performance optimization is intentionally deferred until core modules are complete unless current performance blocks usage.

When performance work is later authorized, prioritize:

- load essential startup data first
- lazy-load module data
- API timeout/retry where appropriate
- request timing logs
- GAS Cache where useful
- reduce full-sheet scans

Do not perform broad performance rewrites as a side effect of progress-module work.

## Test and validation expectations

Before presenting progress changes for review:

- Confirm the branch is not `main`.
- Inspect changed files/diff.
- Check JavaScript syntax.
- Confirm existing attendance, daily-report, payroll, and site-daily-report entry points were not removed.
- Validate OWNER/ADMIN/SITE_MANAGER visibility and site scoping in code paths touched.
- Validate progress create/update/list/confirm behavior against the existing GAS contract.
- Confirm formal UI does not expose raw internal IDs in normal use.
- Confirm identical progress save does not create a no-op audit event when that backend fix is introduced.
- Do not claim a test passed if it was not actually executed.

## Testing and production data caution

Some old test pages in repository history have used the same production LIFF ID and GAS endpoint as the formal app. A folder named `test` does not imply an isolated backend. Treat actions against the configured GAS URL as potentially production-affecting.

Do not perform destructive or bulk test writes to production data. Use small, reversible test cases and report exactly what was changed.

## Backend source control recommendation

The GAS backend should eventually be version-controlled under a dedicated directory such as `gas/`, but do not fabricate or reconstruct it from assumptions. Add it only from the real deployed source or an explicitly approved replacement. GAS deployment remains a manual step until a supported Apps Script deployment tool is available.

## Decision authority

Codex may analyze, implement, refactor narrowly, test, and prepare a PR within the rules above.

Codex must NOT independently decide or change business rules involving:

- payroll calculations
- attendance counting
- approval authority
- site access scope
- progress aggregation/weighting
- audit/lock semantics
- destructive data migration

When a business rule is ambiguous, stop and report the ambiguity rather than inventing a rule.
