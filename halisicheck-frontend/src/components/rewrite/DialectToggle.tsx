import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Dialect } from "@/types/detection.types"
import { DIALECTS } from "@/utils/constants"

/**
 * British / Kenyan switch. Dialect is a prompt concern on the backend, so the
 * UI only ever states which variant is on screen.
 */
export function DialectToggle({
  dialect,
  onDialectChange,
}: {
  dialect: Dialect
  onDialectChange: (dialect: Dialect) => void
}) {
  const active = DIALECTS.find((d) => d.value === dialect)

  return (
    <div className="space-y-1.5">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[dialect]}
        onValueChange={(value) => {
          const next = value[0] as Dialect | undefined
          if (next) onDialectChange(next)
        }}
        aria-label="Rewrite dialect"
      >
        {DIALECTS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {active ? (
        <p className="text-[11px] text-muted-foreground">{active.hint}</p>
      ) : null}
    </div>
  )
}
