import { z } from "zod";

export const AttendanceTopicCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
});

export const AttendanceTopicUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const AttendanceTopicCreateCodec = z.codec(
  z.string(),
  AttendanceTopicCreateSchema,
  {
    decode: (json) =>
      JSON.parse(json) as z.infer<typeof AttendanceTopicCreateSchema>,
    encode: (value) => JSON.stringify(value),
  },
);

export const AttendanceTopicUpdateCodec = z.codec(
  z.string(),
  AttendanceTopicUpdateSchema,
  {
    decode: (json) =>
      JSON.parse(json) as z.infer<typeof AttendanceTopicUpdateSchema>,
    encode: (value) => JSON.stringify(value),
  },
);
