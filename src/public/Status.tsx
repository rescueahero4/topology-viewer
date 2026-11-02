import type { Lang } from "#engine";
import { t, UiIcon } from "#ui";
import type { TopologyLoadErrorKind } from "../../types/index";

export type StatusProps = {
  lang: Lang;
  embedded: boolean;
} & (
  | { state: "loading" }
  | { state: "empty" }
  | {
      state: "failed";
      kind: TopologyLoadErrorKind;
      status?: number;
      onRetry: () => void;
    }
);

const BODY = {
  network: "load.network",
  http: "load.http",
  parse: "load.parse",
  select: "load.select",
  load: "load.load",
} as const;

function Failed(props: Extract<StatusProps, { state: "failed" }>) {
  const { lang, kind, status, onRetry } = props;
  return (
    <div class="overlay" data-state="error" role="alert" aria-live="polite">
      <div class="notice">
        <span class="notice-ic ic">
          <UiIcon name="alert-triangle" />
        </span>
        <p class="overlay-title">{t(lang, "load.failed")}</p>
        <p class="notice-body">
          {t(lang, BODY[kind], status === undefined ? {} : { status })}
        </p>
        <div class="notice-actions">
          <button type="button" class="btn primary" onClick={onRetry}>
            {t(lang, "action.retry")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ lang, text }: { lang: Lang; text: "load.loading" | "load.empty" }) {
  return (
    <div class="overlay" data-state="empty" role="status" aria-live="polite">
      <div class="notice">
        <p class="overlay-title">{t(lang, text)}</p>
      </div>
    </div>
  );
}

/** The state of the viewer before a payload is there. It uses the same frame as a chart. */
export function Status(props: StatusProps) {
  const host = props.embedded
    ? { "data-host": "embedded", "data-display": "inline" }
    : {};
  return (
    <div class="shell" data-theme="light" {...host}>
      <main class="canvas" style={{ height: "100%" }}>
        {props.state === "failed" ? (
          <Failed {...props} />
        ) : (
          <Message
            lang={props.lang}
            text={props.state === "loading" ? "load.loading" : "load.empty"}
          />
        )}
      </main>
    </div>
  );
}
