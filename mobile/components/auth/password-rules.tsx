import { CheckIcon } from "lucide-react-native"

import { PASSWORD_RULES } from "@shared/auth/schemas"
import { palette } from "@shared/tokens"

import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// Always on screen and ticking as the user types — the same checklist web's register form shows,
// from the same rules, so the two cannot disagree about what a valid password is.
export function PasswordRules({ password }: { password: string }) {
  return (
    <Stack className="gap-1" accessibilityLabel="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <Row key={rule.label} className="gap-1.5" testID={`password-rule-${met ? "met" : "unmet"}`}>
            <CheckIcon size={12} color={met ? palette.green700 : palette.ocean500} opacity={met ? 1 : 0.3} />
            <Text className={met ? "text-[11px] text-foreground" : "text-[11px] text-muted-foreground"}>
              {rule.label}
            </Text>
          </Row>
        )
      })}
    </Stack>
  )
}
