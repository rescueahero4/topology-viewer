import { z } from "zod";
import { actions, copyMessage } from "./actions";
import {
  noticeCodeSchema,
  noticeMeta,
  noticeMetaSchema,
  noticeTextSchema,
  severitySchema,
  type NoticeCode,
  type NoticeText,
} from "./codes";
import { en, enValues } from "./en";
import { ja, jaValues } from "./ja";
import { valueTextsSchema } from "./values";

const noticeSchema = noticeMetaSchema.extend(noticeTextSchema.shape);
const noticeTableSchema = z.record(noticeCodeSchema, noticeSchema);

const codes = noticeCodeSchema.options;

function table(texts: Record<NoticeCode, NoticeText>) {
  return noticeTableSchema.parse(
    Object.fromEntries(
      codes.map((code) => [code, { ...noticeMeta[code], ...texts[code] }]),
    ),
  );
}

const values = {
  en: valueTextsSchema.parse(enValues),
  ja: valueTextsSchema.parse(jaValues),
};

export const notices = {
  codes,
  severity: z
    .record(noticeCodeSchema, severitySchema)
    .parse(
      Object.fromEntries(
        codes.map((code) => [code, noticeMeta[code].severity]),
      ),
    ),
  en: table(en),
  ja: table(ja),
  actions,
  copyMessage,
  got: { en: values.en.got, ja: values.ja.got },
  measure: { en: values.en.measure, ja: values.ja.measure },
  kind: { en: values.en.kind, ja: values.ja.kind },
};

export type Notice = z.infer<typeof noticeSchema>;
export type { ActionName } from "./actions";
export type { IssueCode, NoticeCode, Severity, WarningCode } from "./codes";
