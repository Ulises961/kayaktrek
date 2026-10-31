import { BrandMark } from "./brand-mark"
import { Row } from "./layout"
import { Text } from "./text"

// Minimal port of frontend/components/common/brand-lockup.tsx (the M9b2 plan WP5):
// mark + wordmark only, no `subtitle`/href — auth is mobile's only screen without
// a nav shell to hang a lockup in, and there is nowhere else yet to reuse this.
export function BrandLockup({
  size = 26,
  textClassName = "text-lg font-semibold tracking-tight",
}: {
  size?: number
  textClassName?: string
}) {
  return (
    <Row className="items-center gap-2.5">
      <BrandMark size={size} />
      <Text className={textClassName}>Kayaktrek</Text>
    </Row>
  )
}
