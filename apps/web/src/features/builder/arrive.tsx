import { cn } from "@cladd-ui/react";
import { animate, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FLIGHT, QUICK, SNAP } from "@/components/pact/motion";

type Entrance = "none" | "manual" | "stream";

interface ArrivalValue {
  origin: RefObject<HTMLElement | null>;
  parent: Entrance;
  ready: boolean;
  streaming: boolean;
}

const NO_ORIGIN: RefObject<HTMLElement | null> = { current: null };
const START_SCALE = 0.4;
const FALLBACK_DROP = -28;
const FOLLOW_MARGIN = 120;
const PIECE_DELAY = 0.26;
const PIECE_STEP = 0.09;
const FLASH_SECONDS = 1.1;
const FLASH_TIMES = [0, 0.3, 1];
const EXIT = { opacity: 0, scale: 0.94 };

const ArrivalContext = createContext<ArrivalValue>({
  origin: NO_ORIGIN,
  parent: "none",
  ready: false,
  streaming: false,
});

export function ArrivalProvider({
  children,
  origin,
  streaming,
}: {
  children: ReactNode;
  origin: RefObject<HTMLElement | null>;
  streaming: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const value = useMemo<ArrivalValue>(
    () => ({ origin, parent: "none", ready, streaming }),
    [origin, ready, streaming]
  );
  return <ArrivalContext value={value}>{children}</ArrivalContext>;
}

const useEntrance = (inherit = false): Entrance => {
  const { parent, ready, streaming } = useContext(ArrivalContext);
  const [entrance] = useState<Entrance>(() => {
    if (!ready) {
      return inherit && parent === "stream" ? "stream" : "none";
    }
    return streaming && !inherit ? "stream" : "manual";
  });
  return entrance;
};

const centerOf = (rect: DOMRect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

export function Arrive({
  children,
  className,
  flash = false,
  follow = false,
}: {
  children: ReactNode;
  className?: string;
  flash?: boolean;
  follow?: boolean;
}) {
  const outer = useContext(ArrivalContext);
  const { origin } = outer;
  const entrance = useEntrance();
  const reduced = useReducedMotion();
  const node = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => setSettled(true), []);
  const inner = useMemo<ArrivalValue>(
    () => ({ ...outer, parent: entrance, ready: settled }),
    [entrance, outer, settled]
  );

  useLayoutEffect(() => {
    const element = node.current;
    if (!element || entrance === "none") {
      return;
    }
    element.style.opacity = "0";
    if (reduced) {
      const fade = animate(element, { opacity: [0, 1] }, QUICK);
      return () => fade.stop();
    }
    if (entrance === "manual") {
      const pop = animate(
        element,
        { opacity: [0, 1], scale: [EXIT.scale, 1] },
        SNAP
      );
      return () => pop.stop();
    }
    const landing = element.getBoundingClientRect();
    const to = centerOf(landing);
    const below = landing.bottom + FOLLOW_MARGIN - window.innerHeight;
    if (follow && below > 0) {
      window.scrollBy({ behavior: "smooth", top: below });
    }
    const source = origin.current?.getBoundingClientRect();
    const from = source
      ? centerOf(source)
      : { x: to.x, y: to.y + FALLBACK_DROP };
    const flight = animate(
      element,
      {
        filter: ["blur(10px)", "blur(0px)"],
        opacity: [0, 1],
        scale: [START_SCALE, 1],
        x: [from.x - to.x, 0],
        y: [from.y - to.y, 0],
      },
      { ...FLIGHT, filter: QUICK, opacity: QUICK }
    );
    return () => flight.stop();
  }, [entrance, follow, origin, reduced]);

  return (
    <motion.div
      className={cn("relative", className)}
      exit={reduced ? { opacity: 0 } : EXIT}
      ref={node}
      transition={QUICK}
    >
      <ArrivalContext value={inner}>{children}</ArrivalContext>
      {flash ? <LandingFlash own={entrance} /> : null}
    </motion.div>
  );
}

export function LandingFlash({ own }: { own?: Entrance }) {
  const inherited = useEntrance(true);
  const reduced = useReducedMotion();
  if ((own ?? inherited) !== "stream" || reduced) {
    return null;
  }
  return (
    <motion.span
      animate={{ opacity: [0, 1, 0] }}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-block shadow-[inset_0_0_0_1.5px_var(--color-cladd-fg)]"
      initial={{ opacity: 0 }}
      transition={{
        delay: PIECE_DELAY,
        duration: FLASH_SECONDS,
        times: FLASH_TIMES,
      }}
    />
  );
}

export function ArrivePiece({
  children,
  className,
  position = 0,
}: {
  children: ReactNode;
  className?: string;
  position?: number;
}) {
  const entrance = useEntrance(true);
  const reduced = useReducedMotion();
  if (entrance === "none" || reduced) {
    return <span className={className}>{children}</span>;
  }
  const delay = entrance === "stream" ? PIECE_DELAY + position * PIECE_STEP : 0;
  return (
    <motion.span
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, scale: 0.6, y: -8 }}
      transition={{ ...SNAP, delay }}
    >
      {children}
    </motion.span>
  );
}
