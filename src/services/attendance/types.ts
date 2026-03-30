export type AttendanceTopicSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  count: number;
};

export type AttendanceTopicCreateInput = {
  name: string;
  description?: string | null;
};

export type AttendanceTopicUpdateInput = {
  name?: string;
  description?: string | null;
};
