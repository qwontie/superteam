import {
  Button,
  cn,
  List,
  ListButton,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
  useDialog,
} from "@cladd-ui/react";
import { LIMITS } from "@pact/sdk";
import { Ellipsis, LockOpen, Pencil, Play, RotateCcw } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useCallback,
} from "react";
import { PAGE } from "@/components/shell/app-shell";
import { ArrivalProvider } from "@/features/builder/arrive";
import {
  CreateFailure,
  CreateProvider,
  PrimaryButton,
  useCreate,
} from "@/features/builder/create";
import { useGateSync } from "@/features/builder/gate";
import { MoneyLine } from "@/features/builder/money-line";
import { anchorId, ProblemLines } from "@/features/builder/parts";
import { PlayBar } from "@/features/builder/play-bar";
import { anchors, type Problem } from "@/features/builder/problems";
import { Rules } from "@/features/builder/rules";
import { SimulationProvider, useSim } from "@/features/builder/simulation";
import { useBuilder, useDraft } from "@/features/builder/state";

const encoder = new TextEncoder();
const COLUMN = "mx-auto w-full max-w-[47.5rem]";

function TitleField() {
  const { edit, locked } = useBuilder();
  const draft = useDraft();
  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const title = event.target.value.replaceAll("\n", " ");
      if (encoder.encode(title).length <= LIMITS.titleBytes) {
        edit((d) => ({ ...d, title }));
      }
    },
    [edit]
  );
  return (
    <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
      <h1 className="sr-only">New deal</h1>
      <textarea
        aria-label="Name of the deal"
        autoComplete="off"
        className={cn(
          "field-sizing-content block w-full min-w-0 resize-none border-b bg-transparent pb-1 font-display font-semibold text-2xl text-cladd-fg leading-tight tracking-[-0.02em] outline-none transition-colors duration-200 placeholder:text-cladd-fg-softer focus:border-cladd-fg focus-visible:outline-none! sm:text-4xl",
          draft.title.trim() === ""
            ? "border-cladd-fg-softer border-dashed"
            : "border-transparent hover:border-cladd-outline"
        )}
        disabled={locked}
        id={anchorId(anchors.title)}
        onChange={change}
        placeholder="Name this deal"
        rows={1}
        value={draft.title}
      />
    </div>
  );
}

function PlayToggle() {
  const { locked, mode, setMode } = useBuilder();
  const playing = mode === "play";
  const toggle = useCallback(
    () => setMode(playing ? "build" : "play"),
    [playing, setMode]
  );
  return (
    <Button
      aria-label={playing ? "Edit" : "Play"}
      aria-pressed={playing}
      className="max-sm:w-10 max-sm:px-0"
      disabled={locked}
      onClick={toggle}
      pressed={playing}
      size="xl"
      title={
        playing
          ? "Back to the blocks"
          : "Try the deal: press the chips, move time. Nothing touches the chain."
      }
    >
      {playing ? (
        <Pencil aria-hidden="true" size={15} />
      ) : (
        <Play aria-hidden="true" size={15} />
      )}
      <span className="hidden sm:inline">{playing ? "Edit" : "Play"}</span>
    </Button>
  );
}

function MoreMenu() {
  const { locked, replace } = useBuilder();
  const { canLockLater, create } = useCreate();
  const dialog = useDialog();
  const startOver = useCallback(() => {
    dialog.confirm({
      cancelButtonText: "Keep the draft",
      confirmButtonColor: "stop",
      confirmButtonText: "Start over",
      onConfirm: (confirmed) => {
        if (confirmed) {
          replace(null);
        }
      },
      text: "The blocks on this canvas are removed from this browser. Nothing on chain is touched.",
      title: "Start over?",
    });
  }, [dialog, replace]);
  const lockLater = useCallback(() => create(false), [create]);
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button
          aria-label="More actions"
          disabled={locked}
          size="xl"
          square
          variant="transparent"
        >
          <Ellipsis aria-hidden="true" size={18} />
        </Button>
      </PopoverTrigger>
      <Popover className="w-64" offset={8} position="bottom-end">
        <List className="p-1.5">
          <PopoverClose>
            <ListButton
              disabled={!canLockLater}
              icon={<LockOpen aria-hidden="true" size={16} />}
              onClick={lockLater}
              size="xl"
            >
              Create now, lock later
            </ListButton>
          </PopoverClose>
          <PopoverClose>
            <ListButton
              icon={<RotateCcw aria-hidden="true" size={16} />}
              onClick={startOver}
              size="xl"
            >
              Start over
            </ListButton>
          </PopoverClose>
        </List>
      </Popover>
    </PopoverRoot>
  );
}

const LOCAL = new Set([anchors.amount, anchors.title, anchors.deal]);

const elsewhere = (problem: Problem) =>
  !(
    problem.todo ||
    LOCAL.has(problem.anchor) ||
    problem.anchor.startsWith("rule:")
  );

function LooseProblems() {
  const { validation } = useBuilder();
  const loose = [
    ...new Set(validation.problems.filter(elsewhere).map((p) => p.anchor)),
  ];
  return (
    <>
      {[...LOCAL, ...loose].map((anchor) => (
        <ProblemLines anchor={anchor} key={anchor} />
      ))}
    </>
  );
}

function Money() {
  const { mode } = useBuilder();
  const { fired } = useSim();
  return <MoneyLine settled={mode === "play" && fired !== null} />;
}

function Canvas() {
  useGateSync();
  return (
    <>
      <LooseProblems />
      <Rules />
    </>
  );
}

function Dock({ prompt }: { prompt: ReactNode }) {
  const { mode } = useBuilder();
  return (
    <div className="sticky bottom-0 z-30 mt-auto bg-linear-to-t from-55% from-cladd-bg to-transparent pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className={cn(COLUMN, "flex flex-col gap-2")}>
        <CreateFailure />
        {mode === "play" ? (
          <PlayBar />
        ) : (
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            {prompt}
            <PrimaryButton className="shrink-0 justify-center px-5 font-semibold" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Workspace({
  origin,
  prompt,
  streaming,
}: {
  origin: RefObject<HTMLElement | null>;
  prompt: ReactNode;
  streaming: boolean;
}) {
  const draft = useDraft();
  return (
    <ArrivalProvider origin={origin} streaming={streaming}>
      <SimulationProvider draft={draft}>
        <CreateProvider>
          <main className={cn(PAGE, "flex flex-1 flex-col pt-6 sm:pt-10")}>
            <div className={cn(COLUMN, "flex flex-col gap-4")}>
              <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
                <TitleField />
                <div className="order-last ml-auto flex items-center gap-2 sm:order-none">
                  <PlayToggle />
                  <MoreMenu />
                </div>
                <div className="min-w-0 flex-1 sm:basis-full">
                  <Money />
                </div>
              </header>
              <Canvas />
            </div>
            <Dock prompt={prompt} />
          </main>
        </CreateProvider>
      </SimulationProvider>
    </ArrivalProvider>
  );
}
