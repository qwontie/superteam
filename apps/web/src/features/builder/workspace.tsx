import {
  Button,
  cn,
  Segmented,
  SegmentedButton,
  useDialog,
} from "@cladd-ui/react";
import { LIMITS } from "@pact/sdk";
import { Pencil, Play, RotateCcw } from "lucide-react";
import { LayoutGroup } from "motion/react";
import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useCallback,
} from "react";
import { PAGE } from "@/components/shell/app-shell";
import { ArrivalProvider } from "@/features/builder/arrive";
import { Checks } from "@/features/builder/checks";
import { CreatePanel } from "@/features/builder/create-panel";
import { anchorId, ProblemLines } from "@/features/builder/parts";
import { People } from "@/features/builder/people";
import { anchors } from "@/features/builder/problems";
import { Rules } from "@/features/builder/rules";
import { SimulationProvider, useSim } from "@/features/builder/simulation";
import { Simulator } from "@/features/builder/simulator";
import { useBuilder, useDraft } from "@/features/builder/state";
import { useWide } from "@/features/builder/use-wide";
import { VaultBlock } from "@/features/builder/vault-block";

const encoder = new TextEncoder();

function TitleField() {
  const { edit, locked } = useBuilder();
  const draft = useDraft();
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const title = event.target.value;
      if (encoder.encode(title).length <= LIMITS.titleBytes) {
        edit((d) => ({ ...d, title }));
      }
    },
    [edit]
  );
  return (
    <div className="flex min-w-0 flex-1 basis-full flex-col gap-2 sm:basis-0">
      <h1 className="sr-only">New deal</h1>
      <input
        aria-label="Name of the deal"
        autoComplete="off"
        className="w-full min-w-0 border-transparent border-b bg-transparent pb-1 font-display font-semibold text-3xl text-cladd-fg tracking-[-0.02em] outline-none transition-colors duration-200 placeholder:text-cladd-fg-softer hover:border-cladd-outline focus:border-cladd-fg sm:text-4xl"
        disabled={locked}
        id={anchorId(anchors.title)}
        onChange={change}
        placeholder="Name this deal"
        value={draft.title}
      />
      <ProblemLines anchor={anchors.title} />
    </div>
  );
}

function StartOver() {
  const { replace, locked } = useBuilder();
  const dialog = useDialog();
  const ask = useCallback(() => {
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
  return (
    <Button disabled={locked} onClick={ask} size="xl" variant="transparent">
      <RotateCcw aria-hidden="true" size={15} />
      Start over
    </Button>
  );
}

function ModeSwitch() {
  const { locked, mode, setMode } = useBuilder();
  const build = useCallback(() => setMode("build"), [setMode]);
  const play = useCallback(() => setMode("play"), [setMode]);
  return (
    <Segmented
      activeColor="neutral"
      aria-label="Build or play the deal"
      color="neutral"
      disabled={locked}
      size="xl"
    >
      <SegmentedButton active={mode === "build"} onClick={build}>
        <Pencil aria-hidden="true" size={15} />
        Build
      </SegmentedButton>
      <SegmentedButton active={mode === "play"} onClick={play}>
        <Play aria-hidden="true" size={15} />
        Play
      </SegmentedButton>
    </Segmented>
  );
}

function SideTop({ children }: { children: ReactNode }) {
  const { mode } = useBuilder();
  return mode === "play" ? <Simulator /> : children;
}

function Canvas() {
  const { mode } = useBuilder();
  const { fired } = useSim();
  const playing = mode === "play";
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <VaultBlock settled={playing && fired !== null} />
      {playing ? null : <People />}
      {playing ? null : <Checks />}
      <Rules />
      <ProblemLines anchor={anchors.deal} />
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
  const { mode } = useBuilder();
  const draft = useDraft();
  const wide = useWide();
  const playing = mode === "play";
  return (
    <ArrivalProvider origin={origin} streaming={streaming}>
      <SimulationProvider draft={draft}>
        <LayoutGroup>
          <main className={cn(PAGE, "flex flex-col gap-8 pt-8 sm:pt-12")}>
            <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <TitleField />
              <ModeSwitch />
              <StartOver />
            </header>
            {wide ? (
              <div className="grid grid-cols-[minmax(0,1fr)_22.5rem] items-start gap-10">
                <Canvas />
                <aside className="sticky top-24 flex max-h-[calc(100dvh-7rem)] flex-col gap-4 overflow-y-auto">
                  <SideTop>{prompt}</SideTop>
                  {playing ? null : <CreatePanel />}
                </aside>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <SideTop>{prompt}</SideTop>
                <Canvas />
                {playing ? null : <CreatePanel />}
              </div>
            )}
          </main>
        </LayoutGroup>
      </SimulationProvider>
    </ArrivalProvider>
  );
}
