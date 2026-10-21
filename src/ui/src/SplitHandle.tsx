import {
  dragging,
  ratio,
  saveRatio,
  setRatio,
  stepRatio,
  tableShare,
} from "./split";
import { MAX_RATIO, MIN_RATIO } from "./splitRatio";
import { lang } from "./state";
import { t } from "./strings/index";

// why: rule 10 (mockup app.js lines 1274-1296) — the handle shows the table share in %; a drag with
// pointer capture and ArrowUp (table larger) or ArrowDown (table smaller) set the canvas share,
// which is stored after the drag or the key step
export function SplitHandle({ controls }: { controls: string }) {
  const onPointerDown = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    const box = handle.parentElement?.getBoundingClientRect();
    if (box === undefined || box.height <= 0) return;
    handle.setPointerCapture(event.pointerId);
    dragging.value = true;
    const move = (e: PointerEvent) =>
      setRatio((e.clientY - box.top) / box.height);
    const up = () => {
      dragging.value = false;
      handle.removeEventListener("pointermove", move);
      saveRatio();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  };
  return (
    <div
      class="wb-handle"
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-controls={controls}
      aria-label={t(lang.value, "wb.resize")}
      aria-valuenow={tableShare(ratio.value)}
      aria-valuemin={tableShare(MAX_RATIO)}
      aria-valuemax={tableShare(MIN_RATIO)}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        stepRatio(event.key === "ArrowUp");
      }}
    />
  );
}
