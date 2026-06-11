import { useEffect, useState } from "react";
import type { Step } from "../sim/simEngine";

export function StepPlayer({
  steps,
  index,
  onIndexChange,
}: {
  steps: Step[];
  index: number;
  onIndexChange: (i: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onIndexChange(index + 1), 900);
    return () => clearTimeout(t);
  }, [playing, index, steps.length, onIndexChange]);

  // a new run's steps mean any in-flight autoplay belongs to the old run
  useEffect(() => {
    setPlaying(false);
  }, [steps]);

  const current = index > 0 ? steps[index - 1] : null;
  const btn =
    "border border-line-strong rounded px-2.5 py-1 text-[12px] font-medium hover:border-ink-faint disabled:opacity-40 disabled:cursor-default";
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <button aria-label="Reset" className={btn} onClick={() => { setPlaying(false); onIndexChange(0); }} disabled={index === 0}>
          ⏮ reset
        </button>
        <button
          aria-label="Step back"
          className={btn}
          onClick={() => { setPlaying(false); onIndexChange(Math.max(0, index - 1)); }}
          disabled={index === 0}
        >
          ◀
        </button>
        <button
          aria-label="Step forward"
          className={btn}
          onClick={() => { setPlaying(false); onIndexChange(Math.min(steps.length, index + 1)); }}
          disabled={index >= steps.length}
        >
          step ▶
        </button>
        <button className={btn} onClick={() => setPlaying(!playing)} disabled={index >= steps.length}>
          {playing ? "❚❚ pause" : "▶ play"}
        </button>
        <span className="font-mono text-[11.5px] text-ink-faint ml-auto">
          {index} / {steps.length}
        </span>
      </div>
      <div role="status" aria-live="polite" className="mt-2 min-h-[20px] text-[12.5px] text-ink-soft font-mono">
        {current ? current.caption : steps.length ? "press play to run both passes" : ""}
      </div>
    </div>
  );
}
