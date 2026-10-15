import { z } from "zod";
import { renderInputSchema } from "./input";

export const renderInputJsonSchema = z.toJSONSchema(renderInputSchema, {
  target: "draft-2020-12",
});
