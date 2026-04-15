export const REALTIME_EVENTS = {
  NEW_LEAD_ASSIGNED: "new-lead-assigned",
  LEAD_REASSIGNED: "lead-reassigned",
  AI_ALERT: "ai-alert",
  NOTIFICATION: "notification",
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
