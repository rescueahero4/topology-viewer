import type { Lang } from "#engine";
import { t, UiIcon } from "#ui";
import type { CoreView } from "./core";

type Props = Exclude<CoreView, { state: "data" }> & {
  lang: Lang;
  embedded: boolean;
};

function Failed(props: Extract<Props, { state: "failed" }>) {
  const { lang, kind, status, onRetry } = props;
  return (
    <div class="overlay" data-state="error" role="alert" aria-live="polite">
      <div class="notice">
        <span class="notice-ic ic">
          <UiIcon name="alert-triangle" />
        </span>
        <p class="overlay-title">{t(lang, "load.failed")}</p>
        <p class="notice-body">
          {t(lang, `load.${kind}`, status === undefined ? {} : { status })}
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

/** The viewer before a payload is there, in the same frame as a chart. */
export function Status(props: Props) {
  const host = props.embedded
    ? { "data-host": "embedded", "data-display": "inline" }
    : {};
  return (
    <div class="shell" data-theme="light" {...host}>
      <main class="canvas" style={{ height: "100%" }}>
        {props.state === "failed" ? (
          <Failed {...props} />
        ) : (
          <div class="overlay" data-state="empty" role="status">
            <div class="notice">
              <p class="overlay-title">
                {t(props.lang, props.state === "loading" ? "load.loading" : "load.empty")}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
