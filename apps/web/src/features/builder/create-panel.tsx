import { Circle, CircleAlert, CircleCheck } from "lucide-react";
import { useCallback } from "react";
import { anchorId } from "@/features/builder/parts";
import type { Problem } from "@/features/builder/problems";
import { useBuilder } from "@/features/builder/state";

function ProblemLink({ problem }: { problem: Problem }) {
  const jump = useCallback(() => {
    const target = document.getElementById(anchorId(problem.anchor));
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [problem.anchor]);
  return (
    <li>
      <button
        className="flex w-full items-start gap-2 rounded-chip px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-cladd-surface-hover"
        onClick={jump}
        type="button"
      >
        {problem.todo ? (
          <Circle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-cladd-fg-softer"
            size={15}
          />
        ) : (
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-pact-stop"
            size={15}
          />
        )}
        <span className={problem.todo ? undefined : "text-pact-stop"}>
          {problem.text}
        </span>
      </button>
    </li>
  );
}

export function CreatePanel() {
  const { validation, locked } = useBuilder();
  const count = validation.problems.length;
  const ordered = [
    ...validation.problems.filter((problem) => !problem.todo),
    ...validation.problems.filter((problem) => problem.todo),
  ];
  if (locked) {
    return null;
  }
  return (
    <section
      aria-label="Before you sign"
      className="flex flex-col gap-3 rounded-block bg-cladd-surface p-4 shadow-cladd-outline"
    >
      {count === 0 ? (
        <p className="flex items-start gap-2 text-sm">
          <CircleCheck
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-pact-money"
            size={16}
          />
          Every block is complete. The program will accept this deal.
        </p>
      ) : (
        <>
          <h2 className="font-display font-semibold text-base">
            {count === 1 ? "1 thing left" : `${count} things left`} before
            signing
          </h2>
          <ul className="-mx-2 flex flex-col">
            {ordered.map((problem) => (
              <ProblemLink key={problem.key} problem={problem} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
