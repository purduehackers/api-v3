import { eq, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { attendanceEvents, attendanceTopics } from "../../db/schema";
import {
  AttendanceNegativeCountError,
  AttendanceTopicNameConflictError,
  AttendanceTopicNotFoundError,
} from "./errors";
import { isUniqueConstraintError, mapAttendanceTopicSummary } from "./lib";
import type {
  AttendanceTopicCreateInput,
  AttendanceTopicSummary,
  AttendanceTopicUpdateInput,
} from "./types";

export {
  AttendanceNegativeCountError,
  AttendanceTopicNameConflictError,
  AttendanceTopicNotFoundError,
} from "./errors";

export class AttendanceService {
  private readonly db;

  constructor(private readonly env: Env) {
    this.db = getDb(env);
  }

  async listTopics(): Promise<AttendanceTopicSummary[]> {
    const rows = await this.db
      .select({
        id: attendanceTopics.id,
        name: attendanceTopics.name,
        description: attendanceTopics.description,
        createdAtMs: attendanceTopics.createdAtMs,
        updatedAtMs: attendanceTopics.updatedAtMs,
        count: sql<number>`coalesce(sum(${attendanceEvents.delta}), 0)`,
      })
      .from(attendanceTopics)
      .leftJoin(attendanceEvents, eq(attendanceEvents.topicId, attendanceTopics.id))
      .groupBy(
        attendanceTopics.id,
        attendanceTopics.name,
        attendanceTopics.description,
        attendanceTopics.createdAtMs,
        attendanceTopics.updatedAtMs,
      )
      .orderBy(attendanceTopics.createdAtMs);

    return rows.map(mapAttendanceTopicSummary);
  }

  async createTopic(input: AttendanceTopicCreateInput): Promise<AttendanceTopicSummary> {
    const now = Date.now();
    const id = crypto.randomUUID();

    try {
      await this.db.insert(attendanceTopics).values({
        id,
        name: input.name,
        description: input.description ?? null,
        createdAtMs: now,
        updatedAtMs: now,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AttendanceTopicNameConflictError();
      }

      throw error;
    }

    const topic = await this.readTopicSummary(id);
    if (!topic) {
      throw new Error("Failed to load created topic");
    }

    return topic;
  }

  async getTopic(topicId: string): Promise<AttendanceTopicSummary> {
    const topic = await this.readTopicSummary(topicId);
    if (!topic) {
      throw new AttendanceTopicNotFoundError();
    }

    return topic;
  }

  async updateTopic(
    topicId: string,
    input: AttendanceTopicUpdateInput,
  ): Promise<AttendanceTopicSummary> {
    const current = await this.readTopicSummary(topicId);
    if (!current) {
      throw new AttendanceTopicNotFoundError();
    }

    try {
      await this.db
        .update(attendanceTopics)
        .set({
          name: input.name ?? current.name,
          description: input.description !== undefined ? input.description : current.description,
          updatedAtMs: Date.now(),
        })
        .where(eq(attendanceTopics.id, topicId));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AttendanceTopicNameConflictError();
      }

      throw error;
    }

    const topic = await this.readTopicSummary(topicId);
    if (!topic) {
      throw new Error("Failed to load updated topic");
    }

    return topic;
  }

  async deleteTopic(topicId: string): Promise<void> {
    await this.getTopic(topicId);
    await this.db.delete(attendanceTopics).where(eq(attendanceTopics.id, topicId));
  }

  async incrementTopic(topicId: string): Promise<{ topicId: string; count: number }> {
    await this.getTopic(topicId);

    await this.db.insert(attendanceEvents).values({
      id: crypto.randomUUID(),
      topicId,
      delta: 1,
      occurredAtMs: Date.now(),
    });

    return {
      topicId,
      count: await this.readCurrentCount(topicId),
    };
  }

  async decrementTopic(topicId: string): Promise<{ topicId: string; count: number }> {
    await this.getTopic(topicId);

    const result = await this.env.ATTENDANCE_DB.prepare(
      `
        INSERT INTO attendance_events (id, topic_id, delta, occurred_at_ms)
        SELECT ?, ?, -1, ?
        WHERE (
          SELECT COALESCE(SUM(delta), 0)
          FROM attendance_events
          WHERE topic_id = ?
        ) > 0
      `,
    )
      .bind(crypto.randomUUID(), topicId, Date.now(), topicId)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      throw new AttendanceNegativeCountError();
    }

    return {
      topicId,
      count: await this.readCurrentCount(topicId),
    };
  }

  private async readCurrentCount(topicId: string): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`coalesce(sum(${attendanceEvents.delta}), 0)`,
      })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.topicId, topicId));

    return Number(row?.count ?? 0);
  }

  private async readTopicSummary(topicId: string): Promise<AttendanceTopicSummary | null> {
    const [row] = await this.db
      .select({
        id: attendanceTopics.id,
        name: attendanceTopics.name,
        description: attendanceTopics.description,
        createdAtMs: attendanceTopics.createdAtMs,
        updatedAtMs: attendanceTopics.updatedAtMs,
        count: sql<number>`coalesce(sum(${attendanceEvents.delta}), 0)`,
      })
      .from(attendanceTopics)
      .leftJoin(attendanceEvents, eq(attendanceEvents.topicId, attendanceTopics.id))
      .where(eq(attendanceTopics.id, topicId))
      .groupBy(
        attendanceTopics.id,
        attendanceTopics.name,
        attendanceTopics.description,
        attendanceTopics.createdAtMs,
        attendanceTopics.updatedAtMs,
      );

    if (!row) {
      return null;
    }

    return mapAttendanceTopicSummary(row);
  }
}
