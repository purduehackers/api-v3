import type { Context } from "hono";
import { Hono } from "hono";

import { AttendanceTopicCreateCodec, AttendanceTopicUpdateCodec } from "../../protocol/attendance";
import {
  AttendanceNegativeCountError,
  AttendanceService,
  AttendanceTopicNameConflictError,
  AttendanceTopicNotFoundError,
} from "../../services/attendance";

type Ctx = Context<{ Bindings: Env }>;

const router = new Hono<{ Bindings: Env }>();

async function listTopics(c: Ctx) {
  const attendance = new AttendanceService(c.env);
  return c.json({ topics: await attendance.listTopics() });
}

async function createTopic(c: Ctx) {
  const input = AttendanceTopicCreateCodec.safeDecode(await c.req.text());
  if (!input.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    const attendance = new AttendanceService(c.env);
    return c.json({ topic: await attendance.createTopic(input.data) }, 201);
  } catch (error) {
    if (error instanceof AttendanceTopicNameConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
}

async function getTopic(c: Ctx) {
  try {
    const attendance = new AttendanceService(c.env);
    return c.json({ topic: await attendance.getTopic(c.req.param("topicId")!) });
  } catch (error) {
    if (error instanceof AttendanceTopicNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
}

async function updateTopic(c: Ctx) {
  const input = AttendanceTopicUpdateCodec.safeDecode(await c.req.text());
  if (!input.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    const attendance = new AttendanceService(c.env);
    return c.json({
      topic: await attendance.updateTopic(c.req.param("topicId")!, input.data),
    });
  } catch (error) {
    if (error instanceof AttendanceTopicNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof AttendanceTopicNameConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
}

async function deleteTopic(c: Ctx) {
  try {
    const attendance = new AttendanceService(c.env);
    const topicId = c.req.param("topicId")!;
    await attendance.deleteTopic(topicId);
    return c.json({ ok: true, topicId });
  } catch (error) {
    if (error instanceof AttendanceTopicNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
}

async function incrementTopic(c: Ctx) {
  try {
    const attendance = new AttendanceService(c.env);
    const result = await attendance.incrementTopic(c.req.param("topicId")!);
    return c.json({ ok: true, topicId: result.topicId, count: result.count });
  } catch (error) {
    if (error instanceof AttendanceTopicNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
}

async function decrementTopic(c: Ctx) {
  try {
    const attendance = new AttendanceService(c.env);
    const result = await attendance.decrementTopic(c.req.param("topicId")!);
    return c.json({ ok: true, topicId: result.topicId, count: result.count });
  } catch (error) {
    if (error instanceof AttendanceTopicNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof AttendanceNegativeCountError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
}

router.get("/", listTopics);
router.get("/topics", listTopics);

router.post("/", createTopic);
router.post("/topics", createTopic);

router.get("/topics/:topicId", getTopic);

router.on(["PATCH", "PUT"], "/topics/:topicId", updateTopic);

router.delete("/topics/:topicId", deleteTopic);

router.on(["GET", "POST"], "/topics/:topicId/increment", incrementTopic);
router.on(["GET", "POST"], "/topics/:topicId/decrement", decrementTopic);

export default router;
