import { createContext, type ReactNode, useContext } from "react";

export type Tone = "default" | "ink";

const ToneContext = createContext<Tone>("default");

export const useTone = (override?: Tone) => {
  const inherited = useContext(ToneContext);
  return override ?? inherited;
};

export function ToneProvider({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <ToneContext value={tone}>{children}</ToneContext>;
}
