import Constants from "expo-constants"
import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import {
  DownloadIcon,
  LockIcon,
  MailIcon,
  RulerIcon,
  ScaleIcon,
  ShieldIcon,
} from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, Linking, ScrollView } from "react-native"

import type { Session } from "@shared/dtos/session"
import type { User } from "@shared/dtos/user"
import { formatDayDate } from "@shared/utils/date"
import { DISTANCE_UNIT, type DistanceUnit } from "@shared/itinerary/distance"
import { palette } from "@shared/tokens"

import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { Input } from "@mobile/components/ui/input"
import { Label } from "@mobile/components/ui/label"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { logoutEverywhere } from "@mobile/lib/auth/actions"
import {
  changePassword,
  getMe,
  reAuthenticate,
  requestAccountDeletion,
  requestDataExport,
  requestEmailChange,
  setPhone,
  setUnitPreference,
} from "@mobile/lib/profile/actions"
import { listSessions, revokeSession } from "@mobile/lib/sessions/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Settings" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Settings", headerLeft: () => <DrawerToggleButton /> }} />
)

const WEB_ORIGIN = "https://kayaktrek.app"

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export default function SettingsScreen() {
  const [me, setMe] = useState<User | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setMe(await getMe())
      setError(null)
    } catch (err) {
      setError(message(err, "Something went wrong. Please try again."))
    }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await listSessions())
      setSessionsError(null)
    } catch {
      // Best effort, matching web: a failed device lookup degrades to a message in the
      // Security card rather than taking the whole screen down with it.
      setSessionsError("Could not load your devices.")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    void loadSessions()
  }, [load, loadSessions])

  return (
    <Screen edges={["bottom"]}>
      {header}

      {!me && !error ? (
        <Stack className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </Stack>
      ) : (
        <ScrollView contentContainerClassName="gap-4 p-4">
          {error && <Text className="text-sm text-destructive">{error}</Text>}
          {notice && <Text className="text-sm text-muted-foreground">{notice}</Text>}

          {me && (
            <>
              <AccountCard me={me} onSaved={setMe} onNotice={setNotice} />
              <PreferencesCard me={me} onSaved={setMe} />
            </>
          )}

          <SecurityCard
            sessions={sessions}
            loadError={sessionsError}
            onRevoked={loadSessions}
          />

          <DataCard onNotice={setNotice} />
          <LegalCard />

          <Stack className="items-center pt-2">
            <Text className="text-xs text-muted-foreground">
              Kayaktrek v{Constants.expoConfig?.version ?? "—"}
            </Text>
          </Stack>
        </ScrollView>
      )}
    </Screen>
  )
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MailIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <Row className="items-center gap-2">
          <Icon size={16} color={palette.ocean700} />
          <CardTitle className="text-base">{title}</CardTitle>
        </Row>
      </CardHeader>
      <CardContent className="gap-4">{children}</CardContent>
    </Card>
  )
}

function AccountCard({
  me,
  onSaved,
  onNotice,
}: {
  me: User
  onSaved: (user: User) => void
  onNotice: (notice: string) => void
}) {
  const [phone, setPhoneValue] = useState(me.phone ?? "")
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const [emailOpen, setEmailOpen] = useState(false)
  const [newMail, setNewMail] = useState("")
  const [emailPassword, setEmailPassword] = useState("")
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function savePhone() {
    setPhoneBusy(true)
    setPhoneError(null)
    try {
      onSaved(await setPhone(phone))
      onNotice("Phone number saved.")
    } catch (err) {
      setPhoneError(message(err, "Failed to update phone number."))
    } finally {
      setPhoneBusy(false)
    }
  }

  async function submitEmailChange() {
    setEmailBusy(true)
    setEmailError(null)
    try {
      // Re-authenticate first: the endpoint wants an elevated token, so a wrong password
      // must fail here rather than after the change has been attempted.
      const elevatedToken = await reAuthenticate(emailPassword)
      await requestEmailChange(elevatedToken, newMail.trim())
      setEmailOpen(false)
      setEmailPassword("")
      onNotice(`Confirmation sent to ${newMail.trim()}. The address changes once you follow it.`)
    } catch (err) {
      setEmailError(message(err, "Failed to request the email change."))
    } finally {
      setEmailBusy(false)
    }
  }

  async function submitPasswordChange() {
    if (newPwd !== confirmPwd) {
      setPasswordError("The new passwords do not match.")
      return
    }
    setPasswordBusy(true)
    setPasswordError(null)
    try {
      await changePassword(currentPwd, newPwd)
      setPasswordOpen(false)
      setCurrentPwd("")
      setNewPwd("")
      setConfirmPwd("")
      onNotice("Password changed.")
    } catch (err) {
      setPasswordError(message(err, "Failed to change password."))
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <SectionCard icon={MailIcon} title="Account">
      <Stack className="gap-1">
        <Label>Email</Label>
        <Text className="text-sm">{me.mail}</Text>
        {me.pendingMail && (
          <Text className="text-[11px] text-muted-foreground">
            Waiting for confirmation at {me.pendingMail}
          </Text>
        )}
        {emailOpen ? (
          <Stack className="gap-2 pt-2">
            <Input
              value={newMail}
              onChangeText={setNewMail}
              placeholder="new@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              testID="email-new"
            />
            <Input
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Current password"
              secureTextEntry
              testID="email-password"
            />
            {emailError && <Text className="text-sm text-destructive">{emailError}</Text>}
            <Row className="gap-2">
              <Button
                onPress={() => void submitEmailChange()}
                disabled={emailBusy}
                testID="email-submit"
              >
                {emailBusy ? "Sending…" : "Send confirmation"}
              </Button>
              <Button variant="outline" onPress={() => setEmailOpen(false)}>
                Cancel
              </Button>
            </Row>
          </Stack>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            onPress={() => setEmailOpen(true)}
            testID="email-open"
          >
            Change email
          </Button>
        )}
      </Stack>

      <Stack className="gap-1">
        <Label>Phone</Label>
        <Input
          value={phone}
          onChangeText={setPhoneValue}
          placeholder="Not set"
          keyboardType="phone-pad"
          testID="phone-input"
        />
        {phoneError && <Text className="text-sm text-destructive">{phoneError}</Text>}
        <Button
          variant="outline"
          className="self-start"
          onPress={() => void savePhone()}
          disabled={phoneBusy}
          testID="phone-save"
        >
          {phoneBusy ? "Saving…" : "Save phone"}
        </Button>
      </Stack>

      <Stack className="gap-1">
        <Label>Password</Label>
        {passwordOpen ? (
          <Stack className="gap-2">
            <Input
              value={currentPwd}
              onChangeText={setCurrentPwd}
              placeholder="Current password"
              secureTextEntry
              testID="password-current"
            />
            <Input
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="New password"
              secureTextEntry
              testID="password-new"
            />
            <Input
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              placeholder="Confirm new password"
              secureTextEntry
              testID="password-confirm"
            />
            {passwordError && <Text className="text-sm text-destructive">{passwordError}</Text>}
            <Row className="gap-2">
              <Button
                onPress={() => void submitPasswordChange()}
                disabled={passwordBusy}
                testID="password-submit"
              >
                {passwordBusy ? "Changing…" : "Change password"}
              </Button>
              <Button variant="outline" onPress={() => setPasswordOpen(false)}>
                Cancel
              </Button>
            </Row>
          </Stack>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            onPress={() => setPasswordOpen(true)}
            testID="password-open"
            icon={<LockIcon size={14} color={palette.ocean700} />}
          >
            Change password
          </Button>
        )}
      </Stack>
    </SectionCard>
  )
}

function PreferencesCard({ me, onSaved }: { me: User; onSaved: (user: User) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: DistanceUnit) {
    if (me.unitPreference === next) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await setUnitPreference(next))
    } catch {
      setError("Failed to update unit preference.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={RulerIcon} title="Preferences">
      <Stack className="gap-2">
        <Label>Distance unit</Label>
        <Row className="gap-2">
          <Chip
            active={me.unitPreference === DISTANCE_UNIT.NM}
            disabled={busy}
            onPress={() => void change(DISTANCE_UNIT.NM)}
            testID={`unit-${DISTANCE_UNIT.NM}`}
          >
            Nautical miles
          </Chip>
          <Chip
            active={me.unitPreference === DISTANCE_UNIT.KM}
            disabled={busy}
            onPress={() => void change(DISTANCE_UNIT.KM)}
            testID={`unit-${DISTANCE_UNIT.KM}`}
          >
            Kilometres
          </Chip>
        </Row>
        <Text className="text-xs text-muted-foreground">
          Used across the planner, logbook, and stats.
        </Text>
        {error && <Text className="text-sm text-destructive">{error}</Text>}
      </Stack>
    </SectionCard>
  )
}

function SecurityCard({
  sessions,
  loadError,
  onRevoked,
}: {
  sessions: Session[]
  loadError: string | null
  onRevoked: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  function confirmRevoke(session: Session) {
    Alert.alert(
      "Sign out this device?",
      `${session.deviceLabel ?? "Unknown device"} will need to sign in again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void revokeSession(session.id)
              .then(onRevoked)
              .catch((err) => setError(message(err, "Could not sign out that device.")))
          },
        },
      ],
    )
  }

  function confirmSignOutEverywhere() {
    Alert.alert(
      "Sign out everywhere?",
      "Ends every session at once, including this one. You will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out everywhere",
          style: "destructive",
          onPress: () => void logoutEverywhere(),
        },
      ],
    )
  }

  return (
    <SectionCard icon={ShieldIcon} title="Security">
      <Stack className="gap-2">
        <Label>Your devices</Label>
        <Text className="text-sm text-muted-foreground">
          Where your account is signed in. Locations are approximate. If you do not recognise a
          device, sign it out and change your password.
        </Text>

        {loadError ? (
          <Text className="text-sm text-muted-foreground">{loadError}</Text>
        ) : (
          sessions.map((session) => (
            <Stack key={session.id} className="gap-1 border-t border-border pt-2">
              <Row className="justify-between gap-2">
                <Text className="flex-1 text-sm" numberOfLines={1}>
                  {session.deviceLabel ?? "Unknown device"}
                </Text>
                {session.isCurrent && <Badge variant="secondary">This device</Badge>}
              </Row>
              <Text className="text-[11px] text-muted-foreground">
                {session.locationLabel ?? "Location unknown"} · last used{" "}
                {formatDayDate(session.lastUsedAt)}
              </Text>
              {!session.isCurrent && (
                <Button
                  variant="outline"
                  className="self-start"
                  onPress={() => confirmRevoke(session)}
                  testID={`revoke-${session.id}`}
                >
                  Sign out
                </Button>
              )}
            </Stack>
          ))
        )}
        {error && <Text className="text-sm text-destructive">{error}</Text>}
      </Stack>

      <Stack className="gap-2 border-t border-border pt-3">
        <Text className="text-sm text-muted-foreground">
          Ends every session at once, including this one.
        </Text>
        <Button
          variant="outline"
          className="self-start"
          onPress={confirmSignOutEverywhere}
          testID="sign-out-everywhere"
        >
          Sign out everywhere
        </Button>
      </Stack>
    </SectionCard>
  )
}

function DataCard({ onNotice }: { onNotice: (notice: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportData() {
    setBusy(true)
    setError(null)
    try {
      await requestDataExport()
      onNotice("Data export requested. You will get an email when it is ready.")
    } catch (err) {
      setError(message(err, "Failed to request data export."))
    } finally {
      setBusy(false)
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "You will have 30 days to cancel before all your personal data is permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            void requestAccountDeletion()
              .then(() => onNotice("Account deletion requested."))
              .catch((err) => setError(message(err, "Failed to request account deletion.")))
          },
        },
      ],
    )
  }

  return (
    <SectionCard icon={DownloadIcon} title="Privacy & data">
      <Button
        variant="outline"
        className="self-start"
        onPress={() => void exportData()}
        disabled={busy}
        testID="data-export"
      >
        {busy ? "Requesting…" : "Request data export"}
      </Button>

      <Stack className="gap-2 rounded-lg border border-destructive/30 p-4">
        <Text className="text-sm font-medium text-destructive">Danger zone</Text>
        <Text className="text-sm text-muted-foreground">
          Request deletion of your account. You will have 30 days to cancel before all your
          personal data is permanently removed.
        </Text>
        <Button
          variant="destructive"
          className="self-start"
          onPress={confirmDelete}
          testID="delete-account"
        >
          Delete account
        </Button>
      </Stack>

      {error && <Text className="text-sm text-destructive">{error}</Text>}
    </SectionCard>
  )
}

function LegalCard() {
  // Linked out rather than ported: the policy text has to be the one actually in force,
  // and a copy bundled in an app binary goes stale the moment the hosted one changes.
  return (
    <SectionCard icon={ScaleIcon} title="Legal">
      <Stack className="items-start gap-1">
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onPress={() => void Linking.openURL(`${WEB_ORIGIN}/terms`)}
          testID="legal-terms"
        >
          Terms of Use
        </Button>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onPress={() => void Linking.openURL(`${WEB_ORIGIN}/privacy`)}
          testID="legal-privacy"
        >
          Privacy Policy
        </Button>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onPress={() => void Linking.openURL("mailto:support@kayaktrek.app")}
          testID="legal-contact"
        >
          Contact
        </Button>
      </Stack>
    </SectionCard>
  )
}
