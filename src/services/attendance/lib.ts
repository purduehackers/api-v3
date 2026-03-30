import type { AttendanceTopicSummary } from "./types";

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /unique/i.test(error.message) &&
    /attendance_topics\.name|UNIQUE constraint failed/i.test(error.message)
  );
}

export function mapAttendanceTopicSummary(row: AttendanceTopicSummary): AttendanceTopicSummary {
  return {
    ...row,
    count: Number(row.count ?? 0),
    description: row.description ?? null,
  };
}
