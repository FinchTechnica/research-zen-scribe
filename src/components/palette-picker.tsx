import { Palette as PaletteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PALETTES, usePalette } from "@/components/theme-provider";

export function PalettePicker() {
  const { palette, setPalette } = usePalette();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Choose palette">
          <PaletteIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Theme palette</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PALETTES.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => setPalette(p.id)}
            className={palette === p.id ? "bg-accent" : ""}
          >
            <span
              className="h-4 w-4 rounded-full mr-2 border"
              style={{ background: p.swatch }}
              aria-hidden
            />
            <span className="flex-1">
              <span className="block text-sm">{p.label}</span>
              <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}