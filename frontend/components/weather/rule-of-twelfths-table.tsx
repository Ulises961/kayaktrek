import type { RuleOfTwelfthsEntry } from "@/lib/dtos/sea"

interface RuleOfTwelfthsTableProps {
  entries: RuleOfTwelfthsEntry[]
}

export function RuleOfTwelfthsTable({ entries }: RuleOfTwelfthsTableProps) {
  if (entries.length === 0) return null

  // A three-column table in a panel that is 288px wide at `md` and a phone-width
  // bottom sheet below it. The headers carry `whitespace-nowrap` so they set the
  // table's minimum width honestly instead of wrapping "Height above LW" over
  // three lines, and the wrapper turns whatever that leaves over into a scroll of
  // its own rather than a page that scrolls sideways.
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] tabular-nums" data-testid="rule-of-twelfths">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-0.5 pr-2 font-medium whitespace-nowrap">Hr from LW</th>
            <th className="py-0.5 pr-2 font-medium whitespace-nowrap">Fraction</th>
            <th className="py-0.5 font-medium whitespace-nowrap">Height above LW</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.hourFromLw} className="border-border/50 border-t">
              <td className="py-0.5 pr-2 whitespace-nowrap">+{e.hourFromLw} h</td>
              <td className="text-muted-foreground py-0.5 pr-2 whitespace-nowrap">
                {Math.round(e.cumulativeFraction * 100)}%
              </td>
              <td className="py-0.5 font-medium whitespace-nowrap">
                {e.estimatedHeightM.toFixed(2)} m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
