import { ThemeProvider as NextThemes } from "next-themes";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Palette = "blue" | "enzyme-green" | "peptide-purple" | "amber-helix";

export const PALETTES: { id: Palette; label: string; swatch: string; hint: string }[] = [
  { id: "blue", label: "Calming Blue", swatch: "#3b82f6", hint: "Default — focused, neutral" },
  { id: "enzyme-green", label: "Enzyme Green", swatch: "#16a34a", hint: "Biochem · calm focus" },
  { id: "peptide-purple", label: "Peptide Purple", swatch: "#8b5cf6", hint: "Macromolecule · creative" },
  { id: "amber-helix", label: "Amber Helix", swatch: "#d97706", hint: "Warm · long reading sessions" },
];

const PaletteCtx = createContext<{ palette: Palette; setPalette: (p: Palette) => void }>({
  palette: "blue",
  setPalette: () => {},
});

export function usePalette() {
  return useContext(PaletteCtx);
}

function PaletteApplier({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<Palette>("blue");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem("palette") as Palette | null)) || "blue";
    setPaletteState(stored);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-palette", palette);
  }, [palette]);

  function setPalette(p: Palette) {
    setPaletteState(p);
    if (typeof window !== "undefined") localStorage.setItem("palette", p);
  }

  return <PaletteCtx.Provider value={{ palette, setPalette }}>{children}</PaletteCtx.Provider>;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <PaletteApplier>{children}</PaletteApplier>
    </NextThemes>
  );
}