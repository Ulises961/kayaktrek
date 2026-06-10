import type { RuleOfTwelfthsEntry } from "@/lib/dtos/sea"

interface RuleOfTwelfthsTableProps {
  entries: RuleOfTwelfthsEntry[]
}

export function RuleOfTwelfthsTable({ entries }: RuleOfTwelfthsTableProps) {
  if (entries.length === 0) return null

  return (
    <table className="w-full text-[11px] tabular-nums" data-testid="rule-of-twelfths">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="font-medium py-0.5 pr-2">Hr from LW</th>
          <th className="font-medium py-0.5 pr-2">Fraction</th>
          <th className="font-medium py-0.5">Height above LW</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.hourFromLw} className="border-t border-border/50">
            <td className="py-0.5 pr-2">+{e.hourFromLw} h</td>
            <td className="py-0.5 pr-2 text-muted-foreground">
              {Math.round(e.cumulativeFraction * 100)}%
            </td>
            <td className="py-0.5 font-medium">{e.estimatedHeightM.toFixed(2)} m</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
