import z from 'zod';

const searchParserOffsetValidator = z.union([
  z.object({
    keyword: z.string(),
    value: z.string().optional(),
    offsetStart: z.number(),
    offsetEnd: z.number()
  }),
  z.object({
    text: z.string(),
    offsetStart: z.number(),
    offsetEnd: z.number()
  })
]);
const searchParserRangeValidator = z.object({
  from: z.string(),
  to: z.string().optional()
});
export const searchParserResultValidator = z
  .object({
    text: z.union([z.string(), z.array(z.string())]).optional(),
    offsets: z.array(searchParserOffsetValidator).optional(),
    exclude: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
  })
  .catchall(z.union([z.string(), z.array(z.string()), searchParserRangeValidator]));

export const searchRangeValidator = z.object({ from: z.string(), to: z.string().optional() });
export const searchKeywordValidator = z.array(z.string());
