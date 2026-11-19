/**
 * Human Resources and approval-rule resources (module `people` and `approvals`).
 * Same engine as the other resources (see resources.ts). Server-side only: the browser never chooses a table or column.
 * Sensitive pay, payroll and review data is gated by its own permission in the database (RLS), not only by these menus.
 * Do not add ID numbers, tax PINs, bank details or health information to any field here.
 */
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { ResourceDef } from "./resources";

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));
const EMP: { table: string; labelCol: string; orderBy: string; filter: [string, unknown] } = { table: "employees", labelCol: "full_name", orderBy: "full_name", filter: ["deleted_at", null] };
const CONTRACT_TONE = { draft: "grey", active: "green", expired: "amber", terminated: "red" } as const;
const OPENING_TONE = { draft: "grey", open: "teal", on_hold: "amber", filled: "green", closed: "grey" } as const;
const STAGE_TONE = { applied: "grey", screening: "amber", interview: "amber", offer: "teal", hired: "green", rejected: "red", withdrawn: "grey" } as const;
const ATT_TONE = { present: "green", late: "amber", absent: "red", remote: "teal", half_day: "amber", on_leave: "grey" } as const;
const EMP_TONE = { active: "green", on_notice: "amber", left: "grey" } as const;
const PERMISSION_OPTIONS = Object.entries(PERMISSIONS).map(([value, label]) => ({ value, label: `${value} (${label.split(" ").slice(0, 8).join(" ")}...)` }));

export const PEOPLE_RESOURCES: Record<string, ResourceDef> = {
  departments: {
    key: "departments", base: "/admin/people", route: "departments", table: "departments", label: "Departments", singular: "Department", pk: "id",
    description: "Your organisation structure. The department head can be used as an approver in approval rules.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, orderBy: "name", activeColumn: "is_active", newLabel: "Add department",
    columns: [{ key: "name", label: "Department" }, { key: "code", label: "Code" }, { key: "head_employee_id", label: "Head", lookup: { table: "employees", labelCol: "full_name" } }],
    fields: [
      { type: "text", name: "name", label: "Department name", required: true, max: 120 },
      { type: "text", name: "code", label: "Short code", max: 12, pattern: /^[A-Z0-9-]{1,12}$/, patternMessage: "Use capital letters, digits and dashes only.", placeholder: "e.g. OPS" },
      { type: "relation", name: "head_employee_id", label: "Department head", ...EMP },
      { type: "checkbox", name: "is_active", label: "Active", default: true },
    ],
  },

  employees: {
    key: "employees", base: "/admin/people", route: "employees", table: "employees", label: "Employees", singular: "Employee", pk: "id",
    description: "Employee directory. Keep it to work details. Do not record ID numbers, tax PINs, bank details or health information here. Pay is kept separately under Salary records, for authorised staff only.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, createdBy: "created_by", restrictedDocs: "employee",
    softDelete: "deleted_at", orderBy: "full_name", newLabel: "Add employee", filterStatus: true, statusOptions: opt(["active", "on_notice", "left"]),
    columns: [{ key: "employee_no", label: "No." }, { key: "full_name", label: "Name" }, { key: "job_title", label: "Job title" }, { key: "department_id", label: "Department", lookup: { table: "departments", labelCol: "name" } }, { key: "status", label: "Status", badge: EMP_TONE }],
    fields: [
      { type: "text", name: "full_name", label: "Full name", required: true, max: 160 },
      { type: "email", name: "work_email", label: "Work email" },
      { type: "text", name: "phone", label: "Work telephone", max: 40 },
      { type: "relation", name: "department_id", label: "Department", table: "departments", labelCol: "name", orderBy: "name" },
      { type: "text", name: "job_title", label: "Job title", max: 120 },
      { type: "relation", name: "manager_id", label: "Line manager", ...EMP, help: "Leave approvals and reviews go to this person. A reporting loop is refused." },
      { type: "select", name: "employment_type", label: "Employment type", required: true, default: "permanent", options: opt(["permanent", "fixed_term", "casual", "intern", "consultant"]) },
      { type: "select", name: "status", label: "Status", required: true, default: "active", options: opt(["active", "on_notice", "left"]) },
      { type: "date", name: "hire_date", label: "Start date" },
      { type: "date", name: "end_date", label: "End date" },
      { type: "text", name: "location", label: "Work location", max: 120 },
      { type: "relation", name: "profile_id", label: "Sign-in account (optional)", table: "profiles", labelCol: "full_name", orderBy: "full_name", help: "Link this person to their admin login so they can use My HR. One account per employee." },
      { type: "textarea", name: "notes", label: "Notes", max: 2000, rows: 3 },
    ],
  },

  employee_compensation: {
    key: "employee_compensation", base: "/admin/people", route: "compensation", table: "employee_compensation", label: "Salary records", singular: "Salary record", pk: "employee_id",
    description: "SENSITIVE. Visible only to people granted the salary permission, and every change is logged (field names only, never amounts). Payroll runs are filled from these records. Deductions are not calculated here.",
    permission: "people.compensation", viewPermission: "people.compensation", module: "people", publicSite: false, orderBy: "updated_at", noDelete: true, newLabel: "Add salary record",
    columns: [{ key: "employee_id", label: "Employee", lookup: { table: "employees", labelCol: "full_name" } }, { key: "currency", label: "Currency" }, { key: "basic_salary", label: "Basic" }, { key: "allowances", label: "Allowances" }, { key: "pay_frequency", label: "Paid" }],
    fields: [
      { type: "relation", name: "employee_id", label: "Employee", required: true, ...EMP, help: "One salary record per employee." },
      { type: "text", name: "currency", label: "Currency", required: true, max: 3, pattern: /^[A-Z]{3}$/, patternMessage: "Use a 3-letter code such as KES." },
      { type: "number", name: "basic_salary", label: "Basic salary per period", required: true, min: 0, max: 100000000, decimal: true },
      { type: "number", name: "allowances", label: "Allowances per period", min: 0, max: 100000000, decimal: true, default: 0 },
      { type: "select", name: "pay_frequency", label: "Pay frequency", required: true, default: "monthly", options: opt(["monthly", "weekly", "daily"]) },
      { type: "date", name: "effective_from", label: "Effective from" },
      { type: "textarea", name: "notes", label: "Notes", max: 1000, rows: 2 },
    ],
  },

  employment_contracts: {
    key: "employment_contracts", base: "/admin/people", route: "contracts", table: "employment_contracts", label: "Contracts", singular: "Contract", pk: "id",
    description: "Contract dates and status. HR is reminded automatically before a contract or probation ends. Keep the signed document in restricted document storage (below, when editing).",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, createdBy: "created_by", restrictedDocs: "contract",
    softDelete: "deleted_at", orderBy: "end_date", newLabel: "Add contract", filterStatus: true, statusOptions: opt(["draft", "active", "expired", "terminated"]),
    columns: [{ key: "employee_id", label: "Employee", lookup: { table: "employees", labelCol: "full_name" } }, { key: "contract_type", label: "Type" }, { key: "start_date", label: "Start" }, { key: "end_date", label: "End" }, { key: "status", label: "Status", badge: CONTRACT_TONE }],
    fields: [
      { type: "relation", name: "employee_id", label: "Employee", required: true, ...EMP },
      { type: "select", name: "contract_type", label: "Contract type", required: true, default: "permanent", options: opt(["permanent", "fixed_term", "casual", "internship", "consultancy"]) },
      { type: "text", name: "title", label: "Title or reference", max: 160 },
      { type: "date", name: "start_date", label: "Start date", required: true },
      { type: "date", name: "end_date", label: "End date", help: "Leave empty for open-ended contracts." },
      { type: "date", name: "probation_end_date", label: "Probation ends" },
      { type: "select", name: "status", label: "Status", required: true, default: "active", options: opt(["draft", "active", "expired", "terminated"]) },
      { type: "textarea", name: "notes", label: "Notes", max: 2000, rows: 3 },
    ],
  },

  leave_types: {
    key: "leave_types", base: "/admin/people", route: "leave-types", table: "leave_types", label: "Leave types", singular: "Leave type", pk: "id",
    description: "Types of leave and the yearly allowance for each. Set these to match your employment contracts and the law, and have your adviser confirm them. Leave only needs approval if you tick that box.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, orderBy: "name", activeColumn: "is_active", noDelete: true, newLabel: "Add leave type",
    columns: [{ key: "name", label: "Leave type" }, { key: "days_per_year", label: "Days a year (0 = no limit)" }, { key: "is_paid", label: "Paid" }, { key: "requires_approval", label: "Needs approval" }],
    fields: [
      { type: "text", name: "name", label: "Leave type", required: true, max: 80 },
      { type: "number", name: "days_per_year", label: "Working days allowed per year", min: 0, max: 366, default: 0, decimal: true, help: "0 means no fixed limit." },
      { type: "checkbox", name: "is_paid", label: "Paid leave", default: true },
      { type: "checkbox", name: "requires_approval", label: "Needs approval", default: true },
      { type: "checkbox", name: "is_active", label: "Available to request", default: true },
    ],
  },

  attendance_records: {
    key: "attendance_records", base: "/admin/people", route: "attendance", table: "attendance_records", label: "Attendance", singular: "Attendance record", pk: "id",
    description: "Daily attendance. Staff can check themselves in from My HR; HR can add or correct records here. Attendance alerts only start once check-ins are in use.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, createdBy: "recorded_by", orderBy: "work_date", noDelete: true, newLabel: "Add attendance record", filterStatus: true, statusOptions: opt(["present", "late", "absent", "remote", "half_day", "on_leave"]),
    columns: [{ key: "work_date", label: "Date" }, { key: "employee_id", label: "Employee", lookup: { table: "employees", labelCol: "full_name" } }, { key: "status", label: "Status", badge: ATT_TONE }, { key: "source", label: "Source" }],
    fields: [
      { type: "relation", name: "employee_id", label: "Employee", required: true, ...EMP },
      { type: "date", name: "work_date", label: "Date", required: true },
      { type: "select", name: "status", label: "Status", required: true, default: "present", options: opt(["present", "late", "absent", "remote", "half_day", "on_leave"]) },
      { type: "datetime", name: "check_in", label: "Checked in" },
      { type: "datetime", name: "check_out", label: "Checked out" },
      { type: "text", name: "note", label: "Note", max: 500 },
    ],
  },

  onboarding_templates: {
    key: "onboarding_templates", base: "/admin/people", route: "onboarding-template", table: "onboarding_templates", label: "Onboarding template", singular: "Onboarding step", pk: "id",
    description: "The starting checklist created for every new employee, with a due date counted from their start date. Edit it to match how you really onboard people.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, orderBy: "sort_order", activeColumn: "is_active", newLabel: "Add step",
    columns: [{ key: "label", label: "Step" }, { key: "due_days", label: "Due (days after start)" }, { key: "sort_order", label: "Order" }],
    fields: [
      { type: "text", name: "label", label: "Step", required: true, max: 200 },
      { type: "number", name: "due_days", label: "Due this many days after start", min: 0, max: 365, default: 7 },
      { type: "number", name: "sort_order", label: "Order", min: 0, max: 1000, default: 100 },
      { type: "checkbox", name: "is_active", label: "Use for new employees", default: true },
    ],
  },

  onboarding_tasks: {
    key: "onboarding_tasks", base: "/admin/people", route: "onboarding", table: "onboarding_tasks", label: "Onboarding tasks", singular: "Onboarding task", pk: "id",
    description: "Tasks for new employees. Tick a task as done when it is complete. Tasks are created automatically when an employee is added.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, orderBy: "due_date", noDelete: true, newLabel: "Add task",
    columns: [{ key: "employee_id", label: "Employee", lookup: { table: "employees", labelCol: "full_name" } }, { key: "label", label: "Task" }, { key: "due_date", label: "Due" }, { key: "is_done", label: "Done" }],
    fields: [
      { type: "relation", name: "employee_id", label: "Employee", required: true, ...EMP },
      { type: "text", name: "label", label: "Task", required: true, max: 300 },
      { type: "date", name: "due_date", label: "Due date" },
      { type: "checkbox", name: "is_done", label: "Done", default: false },
    ],
  },

  job_openings: {
    key: "job_openings", base: "/admin/people", route: "vacancies", table: "job_openings", label: "Vacancies", singular: "Vacancy", pk: "id",
    description: "Your own hiring. (Staffing for clients is under HR Outsourcing.)",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Add vacancy", filterStatus: true, statusOptions: opt(["draft", "open", "on_hold", "filled", "closed"]),
    columns: [{ key: "reference", label: "Reference" }, { key: "title", label: "Role" }, { key: "department_id", label: "Department", lookup: { table: "departments", labelCol: "name" } }, { key: "headcount", label: "Positions" }, { key: "status", label: "Status", badge: OPENING_TONE }],
    fields: [
      { type: "text", name: "title", label: "Role", required: true, max: 160 },
      { type: "relation", name: "department_id", label: "Department", table: "departments", labelCol: "name", orderBy: "name" },
      { type: "number", name: "headcount", label: "Positions to fill", min: 1, max: 1000, default: 1 },
      { type: "select", name: "status", label: "Status", required: true, default: "draft", options: opt(["draft", "open", "on_hold", "filled", "closed"]) },
      { type: "date", name: "closing_date", label: "Closing date" },
      { type: "textarea", name: "description", label: "Description", max: 4000, rows: 5 },
    ],
  },

  job_applicants: {
    key: "job_applicants", base: "/admin/people", route: "applicants", table: "job_applicants", label: "Applicants", singular: "Applicant", pk: "id",
    description: "People who applied. Keep personal data to a minimum and record their consent. Do not store ID numbers, bank details or health information. To hire someone, record consent first, then use Hire on the Applicants page.",
    permission: "people.manage", viewPermission: "people.view", module: "people", publicSite: false, createdBy: "created_by", restrictedDocs: "job_applicant",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Add applicant", filterStatus: true, statusOptions: opt(["applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn"]),
    columns: [{ key: "full_name", label: "Name" }, { key: "opening_id", label: "Vacancy", lookup: { table: "job_openings", labelCol: "reference" } }, { key: "stage", label: "Stage", badge: STAGE_TONE }, { key: "consent_recorded", label: "Consent recorded" }],
    fields: [
      { type: "relation", name: "opening_id", label: "Vacancy", required: true, table: "job_openings", labelCol: "reference", orderBy: "created_at", filter: ["deleted_at", null] },
      { type: "text", name: "full_name", label: "Full name", required: true, max: 160 },
      { type: "email", name: "email", label: "Email" },
      { type: "text", name: "phone", label: "Telephone", max: 40 },
      { type: "select", name: "stage", label: "Stage", required: true, default: "applied", options: opt(["applied", "screening", "interview", "offer", "rejected", "withdrawn"]), help: "'Hired' is set by the Hire button, which creates the employee record." },
      { type: "text", name: "source", label: "How they applied", max: 200 },
      { type: "checkbox", name: "consent_recorded", label: "The applicant has agreed to us holding their details", default: false },
      { type: "date", name: "consent_date", label: "Date consent was given", help: "Required when consent is ticked." },
      { type: "date", name: "retention_review_date", label: "Review or delete by" },
      { type: "textarea", name: "notes", label: "Notes", max: 3000, rows: 3 },
    ],
  },

  performance_reviews: {
    key: "performance_reviews", base: "/admin/people", route: "reviews", table: "performance_reviews", label: "Performance reviews", singular: "Review", pk: "id",
    description: "SENSITIVE. A review is a draft until the reviewer submits it; after that it is locked and the employee can read and acknowledge it.",
    permission: "people.reviews", viewPermission: "people.reviews", module: "people", publicSite: false, orderBy: "created_at", noDelete: true, newLabel: "Start a review", filterStatus: true, statusOptions: opt(["draft", "submitted", "acknowledged"]),
    columns: [{ key: "employee_id", label: "Employee", lookup: { table: "employees", labelCol: "full_name" } }, { key: "period_label", label: "Period" }, { key: "rating", label: "Rating" }, { key: "status", label: "Status", badge: { draft: "grey", submitted: "amber", acknowledged: "green" } }],
    fields: [
      { type: "relation", name: "employee_id", label: "Employee", required: true, ...EMP },
      { type: "text", name: "period_label", label: "Review period", required: true, max: 60, placeholder: "e.g. 2027 H1" },
      { type: "date", name: "review_date", label: "Review date" },
      { type: "number", name: "rating", label: "Overall rating (1 to 5)", min: 1, max: 5 },
      { type: "textarea", name: "strengths", label: "Strengths", max: 3000, rows: 4 },
      { type: "textarea", name: "improvements", label: "Areas to improve", max: 3000, rows: 4 },
      { type: "textarea", name: "goals", label: "Goals for next period", max: 3000, rows: 4 },
      { type: "select", name: "status", label: "Status", required: true, default: "draft", options: [{ value: "draft", label: "Draft" }, { value: "submitted", label: "Submitted (locks the review)" }] },
    ],
  },

  approval_policies: {
    key: "approval_policies", base: "/admin/approvals", route: "policies", table: "approval_policies", label: "Approval rules", singular: "Approval rule", pk: "id",
    description: "Who must approve what. A rule applies by subject and amount range (leave has no amount: it uses days). Add the approval steps after saving. If no rule is active for a subject, requests of that kind are refused rather than approved automatically. Nobody can approve their own request, and nobody can approve the same request twice.",
    permission: "approvals.manage", viewPermission: "approvals.manage", module: "approvals", publicSite: false, orderBy: "subject", activeColumn: "is_active", newLabel: "Add approval rule", filterStatus: false,
    columns: [{ key: "subject", label: "Applies to", badge: { leave: "teal", expense: "amber", bill: "amber", payroll: "red" } }, { key: "name", label: "Rule" }, { key: "min_amount", label: "From amount" }, { key: "max_amount", label: "Up to amount" }],
    fields: [
      { type: "select", name: "subject", label: "Applies to", required: true, default: "expense", options: opt(["leave", "expense", "bill", "payroll"]) },
      { type: "text", name: "name", label: "Rule name", required: true, max: 160 },
      { type: "number", name: "min_amount", label: "Applies from this amount (KES)", min: 0, max: 1000000000, default: 0, decimal: true },
      { type: "number", name: "max_amount", label: "Up to this amount (empty = no upper limit)", min: 0, max: 1000000000, decimal: true },
      { type: "checkbox", name: "is_active", label: "Active", default: true },
    ],
  },

  approval_policy_steps: {
    key: "approval_policy_steps", base: "/admin/approvals", route: "steps", table: "approval_policy_steps", label: "Approval steps", singular: "Approval step", pk: "id",
    description: "The people who must approve, in order. Step 1 approves first. A step can be the requester's line manager, the department head, or anyone holding a chosen permission. Changing a step affects new requests only: requests already waiting keep the steps they started with.",
    permission: "approvals.manage", viewPermission: "approvals.manage", module: "approvals", publicSite: false, orderBy: "step_no", newLabel: "Add approval step",
    columns: [{ key: "policy_id", label: "Rule", lookup: { table: "approval_policies", labelCol: "name" } }, { key: "step_no", label: "Step" }, { key: "label", label: "Label" }, { key: "approver_type", label: "Approver" }, { key: "permission_key", label: "Permission" }],
    beforeSave: (v) => { if (v.approver_type !== "permission") v.permission_key = null; },
    fields: [
      { type: "relation", name: "policy_id", label: "Approval rule", required: true, table: "approval_policies", labelCol: "name", orderBy: "subject" },
      { type: "number", name: "step_no", label: "Step number (1 to 5)", required: true, min: 1, max: 5, default: 1 },
      { type: "text", name: "label", label: "Step label", required: true, max: 120, placeholder: "e.g. Finance approval" },
      { type: "select", name: "approver_type", label: "Who approves", required: true, default: "permission", options: [{ value: "manager", label: "The requester's line manager" }, { value: "department_head", label: "The requester's department head" }, { value: "permission", label: "Anyone holding the permission below" }] },
      { type: "select", name: "permission_key", label: "Permission (for 'anyone holding')", options: PERMISSION_OPTIONS },
    ],
  },
};
