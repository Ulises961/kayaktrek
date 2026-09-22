import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { UserMinusIcon, UsersIcon, XIcon } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import type { ConnectionUser } from "@shared/dtos/connection"
import type { Trip } from "@shared/dtos/trip"
import type { TripMember } from "@shared/dtos/trip-member"
import { formatPaddlerName } from "@shared/user/format"
import { lightTokens } from "@shared/tokens"

import { isOfflineError } from "@mobile/lib/api/client"
import { listConnections } from "@mobile/lib/connections/actions"
import { getSession } from "@mobile/lib/auth/session"
import {
  cancelInvitation,
  getTrip,
  inviteBuddy,
  removeMember,
} from "@mobile/lib/trips/actions"
import { Avatar } from "@mobile/components/ui/avatar"
import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { NeedsConnectionNotice } from "@mobile/components/ui/offline-notice"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"

const header = <RouterStack.Screen options={{ title: "Crew" }} />

// Mobile port of frontend/components/trips/tabs/crew-tab.tsx — member list with
// roles, leader-only invite (from accepted buddies, mirroring InviteBuddyPicker) and
// remove, pending invitations with cancel. Float plan (float-plan.tsx) already shows
// the vessel/emergency detail per member, so this screen deliberately stays to
// identity + role + trip-membership actions, matching CrewList's own scope on web.
export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [buddies, setBuddies] = useState<ConnectionUser[] | null>(null)
  const [term, setTerm] = useState("")

  const load = useCallback(async () => {
    setError(null)
    try {
      const [t, session] = await Promise.all([getTrip(id), getSession()])
      setTrip(t)
      setCurrentUserId(session?.userId ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const travellers = trip?.travellers ?? []
  const pendingTravellers = trip?.pendingTravellers ?? []
  const leader = travellers.find((m) => m.role === "leader")
  const isLeader = !!currentUserId && !!leader && leader.user.id === currentUserId

  async function loadBuddies() {
    setInviteOpen(true)
    if (buddies !== null) return
    const connections = await listConnections("accepted")
    const others = connections.map((c) => (c.requester.id === currentUserId ? c.addressee : c.requester))
    setBuddies(others)
  }

  const excluded = new Set([
    ...travellers.map((m) => m.user.id).filter((x): x is string => Boolean(x)),
    ...pendingTravellers.map((u) => u.id).filter((x): x is string => Boolean(x)),
  ])
  const available = (buddies ?? []).filter((b) => b.id && !excluded.has(b.id))
  const trimmedTerm = term.trim().toLowerCase()
  const filtered = trimmedTerm
    ? available.filter((b) =>
        [b.name, b.surname, b.username].filter(Boolean).join(" ").toLowerCase().includes(trimmedTerm),
      )
    : available

  async function invite(userId: string) {
    setActioningId(userId)
    try {
      await inviteBuddy(id, userId)
      setBuddies((prev) => (prev ? prev.filter((b) => b.id !== userId) : prev))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation.")
    } finally {
      setActioningId(null)
    }
  }

  async function cancel(inviteeId: string) {
    setActioningId(inviteeId)
    try {
      await cancelInvitation(id, inviteeId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invitation.")
    } finally {
      setActioningId(null)
    }
  }

  async function remove(userId: string) {
    setActioningId(userId)
    try {
      await removeMember(id, userId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member.")
    } finally {
      setActioningId(null)
    }
  }

  // Offline is the expected state at sea, not a fault: the banner says it, and
  // the raw network error stays out of the screen. With nothing ever loaded,
  // "No crew yet" below would be a false answer, so the body stays empty.
  const needsConnection = isOfflineError(error)
  const notice = <NeedsConnectionNotice visible={needsConnection}>Crew needs a connection.</NeedsConnectionNotice>

  if (!trip && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!trip && needsConnection) {
    return (
      <Screen edges={["bottom"]}>
        {header}
        {notice}
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      {notice}
      <ScrollView contentContainerClassName="gap-5 p-4">
        {error && !needsConnection && <Text className="text-center text-destructive">{error}</Text>}

        <Stack className="gap-3">
          <SectionLabel>Crew ({travellers.length})</SectionLabel>
          {travellers.length === 0 ? (
            <EmptyPanel
              icon={UsersIcon}
              title="No crew yet"
              description="Paddlers who accept an invitation appear here."
            />
          ) : (
            <Stack className="gap-2">
              {travellers.map((member: TripMember) => {
                const displayName = formatPaddlerName(member.user)
                const canRemove = isLeader && member.user.id && member.user.id !== leader?.user.id
                return (
                  <Card key={member.id}>
                    <CardContent>
                      <Row className="items-center gap-3">
                        <Avatar name={member.user.name} surname={member.user.surname} size={36} />
                        <Text className="flex-1 font-medium" numberOfLines={1}>
                          {displayName}
                        </Text>
                        <Badge variant={member.role === "leader" ? "default" : "secondary"}>
                          {member.role === "leader" ? "Leader" : "Crew"}
                        </Badge>
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            accessibilityLabel={`Remove ${displayName}`}
                            disabled={actioningId === member.user.id}
                            onPress={() => member.user.id && void remove(member.user.id)}
                          >
                            <UserMinusIcon size={16} color={lightTokens.destructive} />
                          </Button>
                        )}
                      </Row>
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}
        </Stack>

        {isLeader && (
          <Stack className="gap-3">
            <SectionLabel>Invite member</SectionLabel>
            {!inviteOpen ? (
              <Button variant="outline" onPress={() => void loadBuddies()}>
                Invite a buddy
              </Button>
            ) : (
              <Stack className="gap-2">
                <Input
                  value={term}
                  onChangeText={setTerm}
                  placeholder="Search your buddies…"
                />
                {buddies === null ? (
                  <ActivityIndicator />
                ) : filtered.length === 0 ? (
                  <Text className="text-sm text-muted-foreground">
                    No buddies available to invite.
                  </Text>
                ) : (
                  filtered.map((buddy) => (
                    <Card key={buddy.id}>
                      <CardContent>
                        <Row className="items-center gap-3">
                          <Avatar name={buddy.name} surname={buddy.surname} imageUrl={buddy.avatarUrl} size={32} />
                          <Text className="flex-1" numberOfLines={1}>
                            {[buddy.name, buddy.surname].filter(Boolean).join(" ")}
                          </Text>
                          <Button
                            size="sm"
                            disabled={actioningId === buddy.id}
                            onPress={() => buddy.id && void invite(buddy.id)}
                          >
                            Invite
                          </Button>
                        </Row>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Stack>
            )}
          </Stack>
        )}

        {isLeader && (
          <Stack className="gap-3">
            <SectionLabel>
              {pendingTravellers.length > 0
                ? `Pending invitations (${pendingTravellers.length})`
                : "Pending invitations"}
            </SectionLabel>
            {pendingTravellers.length === 0 ? (
              <Text className="text-sm text-muted-foreground">No pending invitations.</Text>
            ) : (
              pendingTravellers.map((user) => (
                <Card key={user.id}>
                  <CardContent>
                    <Row className="items-center gap-3">
                      <Avatar name={user.name} surname={user.surname} size={32} />
                      <Text className="flex-1 font-medium" numberOfLines={1}>
                        {[user.name, user.surname].filter(Boolean).join(" ")}
                      </Text>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        accessibilityLabel="Cancel invitation"
                        disabled={actioningId === user.id}
                        onPress={() => user.id && void cancel(user.id)}
                      >
                        <XIcon size={16} color={lightTokens.mutedForeground} />
                      </Button>
                    </Row>
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        )}
      </ScrollView>
    </Screen>
  )
}
