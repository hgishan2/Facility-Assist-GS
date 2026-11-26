# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Admin & Supervisor Hierarchy**: Only the Admin account (`admin@siteledger.internal` / active `admin` grant) can view ALL buildings across all supervisors and create, edit, or delete Supervisor accounts (`role == 'supervisor'`). Supervisors authenticate via username/password (`sign_in_provider == 'password'`) and can ONLY create, view, and manage their own buildings (`callerEmail() in supervisorEmails`), their own technician roster (`role == 'technician'`), and operational records scoped to their own buildings.
2. **Technician Portal Boundary**: An active technician signs in via Supervisor-provisioned Badge ID + Passcode (`sign_in_provider == 'password'` bound to a matching `authEmail` and `authUid` in `/access_grants`). Technicians can read only buildings they are assigned to, read their own roster/grant profile, create maintenance logs ONLY for buildings they belong to with `approvalStatus == 'pending_approval'` and `submittedByUid == request.auth.uid`, and resubmit ONLY their own logs that are currently in `'revision_requested'` status.
3. **Terminal State Locking**: Once a `MaintenanceLog` reaches `'approved'` or `'rejected'`, technicians cannot modify or delete it. Only supervisors (for their buildings) or Admin can edit or override terminal records.
4. **Relational Integrity**: Every `MaintenanceLog` must reference an existing `Building` document (`exists(/buildings/{buildingId})`) on creation.
5. **PII Isolation**: `/technicians` and `/access_grants` (containing emails, internal auth emails, and phone numbers) cannot be blanket-read by signed-in users; reads are strictly restricted to Admin, the owning supervisor (`callerEmail() in supervisorEmails`), or the owning user (`authEmail == callerEmail()`).
6. **Temporal Integrity & Immutability**: `createdAt` and `updatedAt` must equal `request.time`. `createdAt`, `submittedByUid`, `submittedByEmail`, and `submittedByRole` are immutable after creation.
7. **Size & Array Bounds**: Every string field has strict `.size()` caps, IDs match `^[a-zA-Z0-9_\\-]+$`, and arrays are bounded (`<= 50` for `memberEmails`, `<= 10` for `supervisorEmails`, `<= 6` for attachment ID arrays).
8. **Work Logs Lifecycle**: Technicians may create `work_logs` only for assigned buildings with `technicianUid == request.auth.uid`, and may update only their own non-Completed work logs on editable fields (`status`, `action`, `finishTime`, `durationHours`, `materials`, `pendingReason`, `remarks`, `updatedAt`). Once `status == 'Completed'`, only owning supervisors or Admin may edit or delete.
9. **Overtime Isolation**: `overtime_logs` contain payroll/shift data; reads (`get` and `list`) are strictly scoped to Admin, the building's supervisor, or the owning technician (`technicianUid == request.auth.uid`). Technicians cannot approve or edit submitted overtime; only owning supervisors or Admin can update or delete.
10. **Utility Meters & Readings**: Only owning supervisors or Admin manage `utility_meters`. Assigned technicians may read building meters and readings (to view previous meter figures) and create `utility_readings` for assigned buildings; only owning supervisors or Admin may edit or delete readings.
11. **Tenant Schedules Boundary**: Supervisors (for their buildings) and Admin may create/assign/edit/delete `tenant_schedules`. Technicians may create schedules assigned to themselves on assigned buildings and may update `status` and `completionNotes` on their own non-terminal schedules (`Pending` or `In Progress`).
12. **Maintenance Notifications Boundary**: Only owning supervisors or Admin may create, edit, resolve/reopen, or delete `maintenance_notifications` for existing buildings. Building team members (`callerEmail() in buildingMemberEmails`) may read notifications scoped to their buildings and may append ONLY their own email to `acknowledgedByEmails` while the notification is `'active'`.
13. **Asset Registry & QR Tagging**: Only owning supervisors or Admin may create, edit, or delete `/assets/{assetId}` records for existing buildings. Building team members (`callerEmail() in buildingMemberEmails`) may read assets scoped to their buildings for QR lookup.
14. **One-Time Admin Lock**: `/system_config/admin_lock` may be created only once, atomically alongside `/access_grants/admin_siteledger_internal` (`existsAfter`), by `admin@siteledger.internal`.


## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read `/buildings` or create `/maintenance_logs` with `request.auth == null`.
2. **Unverified Email Spoof**: Write `/buildings` as `gstower.maintenance@gmail.com` with `email_verified == false`.
3. **Technician Self-Approval on Create**: Technician creates `/maintenance_logs/{id}` with `approvalStatus: 'approved'`.
4. **Technician Privilege Escalation**: Technician creates or updates `/access_grants/{id}` with `role: 'supervisor'`.
5. **Cross-Tenant Building Injection**: Technician creates `/maintenance_logs/{id}` referencing a `buildingId` where their email is NOT in `building.memberEmails`.
6. **Shadow Field Attack**: Supervisor or Technician includes an undeclared ghost key `isBypassed: true` in `/maintenance_logs/{id}`.
7. **Terminal State Tampering**: Technician attempts to update their own `/maintenance_logs/{id}` after it is already `'approved'`.
8. **Identity Spoofing**: Technician sets `submittedByUid` to another user's UID when creating a log.
9. **ID Poisoning**: Client attempts to create `/buildings/bad..id$123` with invalid characters or >128 chars.
10. **PII Scraping**: Technician attempts to `list` all `/technicians` documents without filtering to their own email.
11. **Timestamp Forgery**: Client creates `/maintenance_logs/{id}` with a backdated `createdAt` timestamp not equal to `request.time`.
12. **Orphaned Log Creation**: Client creates `/maintenance_logs/{id}` referencing a non-existent `buildingId`.
