import type { RuleOfTwelfthsEntry } from "@/lib/dtos/sea"

interface RuleOfTwelfthsTableProps {
  entries: RuleOfTwelfthsEntry[]
}

export function RuleOfTwelfthsTable({ entries }: RuleOfTwelfthsTableProps) {
  if (entries.length === 0) return null

  return (
    <table className="w-full text-[11px] tabular-nums" data-testid="rule-of-twelfths">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="py-0.5 pr-2 font-medium">Hr from LW</th>
          <th className="py-0.5 pr-2 font-medium">Fraction</th>
          <th className="py-0.5 font-medium">Height above LW</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.hourFromLw} className="border-border/50 border-t">
            <td className="py-0.5 pr-2">+{e.hourFromLw} h</td>
            <td className="text-muted-foreground py-0.5 pr-2">
              {Math.round(e.cumulativeFraction * 100)}%
            </td>
            <td className="py-0.5 font-medium">{e.estimatedHeightM.toFixed(2)} m</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
