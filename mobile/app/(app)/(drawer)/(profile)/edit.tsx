import { Stack as RouterStack, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator } from "react-native"

import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getMe, updateProfile, type ProfileEditFields } from "../../../../lib/profile/actions"

const header = <RouterStack.Screen options={{ title: "Edit profile" }} />

const EMPTY: ProfileEditFields = { name: "", surname: "", username: "", bio: "", homeLocation: "" }

export default function EditProfileScreen() {
  const router = useRouter()
  const [values, setValues] = useState<ProfileEditFields | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const me = await getMe()
      setValues({
        name: me.name,
        surname: me.surname ?? "",
        username: me.username,
        bio: me.bio ?? "",
        homeLocation: me.homeLocation ?? "",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  function set<K extends keyof ProfileEditFields>(key: K, value: ProfileEditFields[K]) {
    setValues((prev) => ({ ...(prev ?? EMPTY), [key]: value }))
  }

  async function handleSubmit() {
    if (!values) return
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile(values)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!values && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!values) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
        <Button onPress={() => void load()}>Try again</Button>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]} className="gap-4 p-4">
      {header}
      <Stack className="gap-1.5">
        <Label>Name</Label>
        <Input value={values.name} onChangeText={(v) => set("name", v)} />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Surname</Label>
        <Input value={values.surname ?? ""} onChangeText={(v) => set("surname", v)} />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Username</Label>
        <Input
          value={values.username}
          onChangeText={(v) => set("username", v)}
          autoCapitalize="none"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Bio</Label>
        <Input
          value={values.bio ?? ""}
          onChangeText={(v) => set("bio", v)}
          multiline
          numberOfLines={4}
          className="h-24 py-2"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Home location</Label>
        <Input value={values.homeLocation ?? ""} onChangeText={(v) => set("homeLocation", v)} />
      </Stack>
      {error && <Text className="text-sm text-destructive">{error}</Text>}
      <Button disabled={submitting} onPress={() => void handleSubmit()}>
        {submitting ? "Saving…" : "Save changes"}
      </Button>
    </Screen>
  )
}
