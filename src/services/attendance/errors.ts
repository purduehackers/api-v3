export class AttendanceTopicNotFoundError extends Error {
  constructor() {
    super("Topic not found");
  }
}

export class AttendanceTopicNameConflictError extends Error {
  constructor() {
    super("Topic name already exists");
  }
}

export class AttendanceNegativeCountError extends Error {
  constructor() {
    super("Attendance cannot be negative");
  }
}
