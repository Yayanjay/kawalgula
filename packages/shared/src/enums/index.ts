export enum ConsentStatus {
  PENDING = "pending",
  OPTED_IN = "opted_in",
  OPTED_OUT = "opted_out",
}

export enum ReminderStatus {
  PENDING = "pending",
  SENT = "sent",
  CONFIRMED = "confirmed",
  MISSED = "missed",
  FAILED = "failed",
}

export enum ConsumptionStatus {
  TAKEN = "taken",
  SKIPPED = "skipped",
  MISSED = "missed",
}

export enum ConsumptionSource {
  BUTTON = "button",
  FREE_TEXT = "free_text",
  SYSTEM_MISSED = "system_missed",
}

export enum TemplateType {
  ENROLLMENT = "enrollment",
  REMINDER = "reminder",
  OPTIN_CONFIRM = "optin_confirm",
  USAGE_HINT = "usage_hint",
  ALREADY_OPTED_IN = "already_opted_in",
  CONFIRMATION = "confirmation",
}

export enum AdminRole {
  SUPERADMIN = "superadmin",
}

export enum OutboundKind {
  OPT_IN = "opt_in",
  REMINDER = "reminder",
  USAGE_HINT = "usage_hint",
  OPT_IN_CONFIRM = "opt_in_confirm",
}

export enum OutboundStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
}
