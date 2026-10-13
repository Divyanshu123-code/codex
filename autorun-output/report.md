# AegisOS Full-System Autorun Report

**Executed:** 2026-10-12T18:22:50.541Z  
**Total Checks:** 42/42 Passed  
**Total Duration:** 1.76s  

| Stage | Check | Expected | Actual | Status | Duration |
| :--- | :--- | :--- | :--- | :---: | :---: |
| a. Auth/RBAC | No token -> 401 Unauthorized | 401 Unauthorized | 401 Unauthorized | ✅ PASS | 1ms |
| a. Auth/RBAC | Auditor write attempt -> 403 Forbidden | 403 Forbidden | 403 Forbidden | ✅ PASS | 1ms |
| a. Auth/RBAC | Reviewer cannot resume agent -> 403 Forbidden | 403 Forbidden | 403 Forbidden | ✅ PASS | 1ms |
| a. Auth/RBAC | Reviewer cannot reopen approval -> 403 Forbidden | 403 Forbidden | 403 Forbidden | ✅ PASS | 1ms |
| b. Gateway + Evaluator | Requisition 4000 <= 5000 -> ALLOW | ALLOW | ALLOW | ✅ PASS | 3ms |
| b. Gateway + Evaluator | Requisition 6000 > 5000 -> REQUIRE_APPROVAL | REQUIRE_APPROVAL | REQUIRE_APPROVAL | ✅ PASS | 3ms |
| b. Gateway + Evaluator | Prohibited delete_file -> BLOCK (Zero side effects) | BLOCK (NOT_EXECUTED) | BLOCK (NOT_EXECUTED) | ✅ PASS | 3ms |
| c. Cumulative Limits | Sequential requisition #1 ($2,000) -> ALLOW | ALLOW | ALLOW | ✅ PASS | 3ms |
| c. Cumulative Limits | Sequential requisition #2 ($2,000) -> ALLOW | ALLOW | ALLOW | ✅ PASS | 2ms |
| c. Cumulative Limits | Sequential requisition #3 ($2,000) -> ALLOW | ALLOW | ALLOW | ✅ PASS | 4ms |
| c. Cumulative Limits | Sequential requisition #4 ($2,000) -> ALLOW | ALLOW | ALLOW | ✅ PASS | 2ms |
| c. Cumulative Limits | 5th requisition ($2,000) breaches $8,000 cap -> HELD | REQUIRE_APPROVAL (CUMULATIVE_CAP_EXCEEDED) | REQUIRE_APPROVAL (CUMULATIVE_CAP_EXCEEDED) | ✅ PASS | 2ms |
| d. Defence Checks | Stale telemetry (>3600s age) -> HELD for human | REQUIRE_APPROVAL (STALE_TELEMETRY) | REQUIRE_APPROVAL (STALE_TELEMETRY) | ✅ PASS | 3ms |
| d. Defence Checks | Out-of-range sensor vibration (28.5 RMS) -> BLOCK | BLOCK (OUT_OF_BOUNDS_TELEMETRY) | BLOCK (OUT_OF_BOUNDS_TELEMETRY) | ✅ PASS | 2ms |
| d. Defence Checks | Conflicting equal-grade reports (A1 vs A1) -> HELD | REQUIRE_APPROVAL (CONFLICT_HELD) | REQUIRE_APPROVAL (CONFLICT_HELD) | ✅ PASS | 3ms |
| d. Defence Checks | Out-of-scope operation access attempt -> BLOCK | BLOCK (OPERATION_NOT_ALLOWED) | BLOCK (OPERATION_NOT_ALLOWED) | ✅ PASS | 3ms |
| e. Approvals | Duty Officer approves requisition within $15k limit | APPROVED | APPROVED | ✅ PASS | 6ms |
| e. Approvals | Own-request approval blocked (SoD violation) | 403 Forbidden (SEPARATION_OF_DUTIES_VIOLATION) | 403 Forbidden (SEPARATION_OF_DUTIES_VIOLATION) | ✅ PASS | 3ms |
| e. Approvals | Two-Person Integrity: 1st reviewer, 2nd admin required | PENDING_SECOND -> APPROVED | PENDING_SECOND -> APPROVED | ✅ PASS | 7ms |
| e. Approvals | Double-approve race executes exactly once | Exactly 1 execution recorded | Exactly 1 execution recorded | ✅ PASS | 7ms |
| f. Backup/Reopen | Admin mistakenly rejects, admin2 reopens & approves | REJECTED -> REOPENED -> APPROVED | REJECTED -> REOPENED -> APPROVED | ✅ PASS | 9ms |
| f. Backup/Reopen | Original rejection row preserved unchanged in DB | REJECTED (Immutable row) | REJECTED (Immutable row) | ✅ PASS | 0ms |
| f. Backup/Reopen | DECISION_OVERTURNED recorded in cryptographic audit ledger | DECISION_OVERTURNED event logged | DECISION_OVERTURNED event logged | ✅ PASS | 0ms |
| g. Debug Agent | Trigger policy violation -> opens incident & pauses agent | OPEN incident & paused agent | OPEN incident & paused agent | ✅ PASS | 3ms |
| g. Debug Agent | Incident signature diagnostics categorizes root cause | Signature diagnosed | Signature: SIG-DISALLOWED-OP (Operation Outside Permitted Capabilities) | ✅ PASS | 1ms |
| g. Debug Agent | Run Debug Agent (offline deterministic + multi-attempt path) | Sandbox checks PASSED, proposal PENDING | Sandbox checks PASSED, proposal PENDING (Agent safely paused) | ✅ PASS | 8ms |
| g. Debug Agent | Admin approves and applies correction | Correction APPLIED | Correction APPLIED | ✅ PASS | 2ms |
| g. Debug Agent | Resume Gate R1-R9 passes -> agent active | active (All gates passed) | active (All gates passed) | ✅ PASS | 2ms |
| h. Live Agent Console | Preset 1: Spares 4,000 -> ALLOW | ALLOW (stepCount <= 6) | ALLOW (stepCount: 1) | ✅ PASS | 11ms |
| h. Live Agent Console | Preset 2: Requisition 6,000 -> REQUIRE_APPROVAL | REQUIRE_APPROVAL (stepCount <= 6) | REQUIRE_APPROVAL (stepCount: 1) | ✅ PASS | 3ms |
| h. Live Agent Console | Preset 3: Split Requisitions 5x 2,000 -> REQUIRE_APPROVAL | REQUIRE_APPROVAL (stepCount <= 6) | REQUIRE_APPROVAL (stepCount: 3) | ✅ PASS | 7ms |
| h. Live Agent Console | Preset 4: Maintenance Prompt Injection -> REQUIRE_APPROVAL | REQUIRE_APPROVAL (stepCount <= 6) | REQUIRE_APPROVAL (stepCount: 1) | ✅ PASS | 2ms |
| h. Live Agent Console | Preset 5: Cyber Credential Wipe -> BLOCK | BLOCK (stepCount <= 6) | BLOCK (stepCount: 1) | ✅ PASS | 4ms |
| h. Live Agent Console | Preset 6: Conflicting Equal-Grade Sensors -> REQUIRE_APPROVAL | REQUIRE_APPROVAL (stepCount <= 6) | REQUIRE_APPROVAL (stepCount: 1) | ✅ PASS | 3ms |
| h. Live Agent Console | No tokens or secrets leaked in responses | Zero tokens/secrets exposed | Zero tokens/secrets exposed | ✅ PASS | 0ms |
| i. Audit Integrity | Initial cryptographic hash chain is valid | valid: true | valid: true (All hash links intact) | ✅ PASS | 0ms |
| i. Audit Integrity | Corrupt demo tamper detected & identifies broken block | valid: false (Tamper flagged) | valid: false (Tamper caught at block evt-inc-demo-001) | ✅ PASS | 1ms |
| i. Audit Integrity | Reset restores cryptographic chain validity | valid: true | valid: true (Ledger restored) | ✅ PASS | 49ms |
| j. Reports & Exports | 11+ section After-Action Report with authority levels | 11+ sections confirmed | 12 sections confirmed (incl. authority & overturns) | ✅ PASS | 1ms |
| j. Reports & Exports | Audit CSV compliance export is non-empty | text/csv (Non-empty stream) | text/csv (852 bytes) | ✅ PASS | 0ms |
| j. Reports & Exports | Audit JSON compliance export is non-empty | application/json (Non-empty array) | application/json (3 audit blocks) | ✅ PASS | 1ms |
| k. Leadership Dashboard | Metrics aggregate holds, blocks, overturns & breaches | Aggregated telemetry metrics verified | Holds: 0, Violations: 1 | ✅ PASS | 1ms |
