import { Undo2Icon } from "lucide-react-native"
import { useEffect } from "react"

import { lightTokens } from "@shared/tokens"

import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"

// M34: a dragged point is committed the instant the finger lifts, and a pan
// that caught a marker looks exactly like a deliberate drag — so the move can
// be taken back for a few seconds afterwards. Dismisses itself after
// `durationMs`; the parent owns what "undo" restores, this only offers it.
export function UndoSnackbar({
  message,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
  durationMs?: number
}) {
  // Re-armed whenever the message or callbacks change, so a second move
  // restarts the window instead of inheriting what was left of the first.
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, onDismiss, durationMs])

  return (
    <Card className="self-center px-3 py-2">
      <Row className="items-center gap-4">
        <Text className="text-sm text-card-foreground">{message}</Text>
        <Button
          variant="outline"
          size="sm"
          onPress={onUndo}
          accessibilityLabel="Undo move"
          icon={<Undo2Icon size={16} color={lightTokens.foreground} />}
        >
          Undo
        </Button>
      </Row>
    </Card>
  )
}
