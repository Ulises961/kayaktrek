"use client"

import { useTransition, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ProfileFormSchema, type ProfileFormValues, type User } from "@/lib/dtos/user"
import { updateProfile, uploadAvatar, removeAvatar } from "@/lib/profile/actions"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { AnchorIcon, ShieldAlertIcon, UserIcon, CameraIcon, Trash2Icon } from "lucide-react"

interface EditProfileFormProps {
  user: User
}

export function EditProfileForm({ user }: EditProfileFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isUploading, startUpload] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(user.avatarUrl)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: {
      name: user.name ?? "",
      surname: user.surname ?? "",
      phone: user.phone ?? "",
      username: user.username ?? "",
      bio: user.bio ?? "",
      homeLocation: user.homeLocation ?? "",
      vesselMake: user.vesselMake ?? "",
      vesselModel: user.vesselModel ?? "",
      vesselLengthCm: user.vesselLengthCm != null ? String(user.vesselLengthCm) : "",
      vesselColorPrimary: user.vesselColorPrimary ?? "",
      vesselColorSecondary: user.vesselColorSecondary ?? "",
      emergencyContactName: user.emergencyContactName ?? "",
      emergencyContactPhone: user.emergencyContactPhone ?? "",
      emergencyContactRelationship: user.emergencyContactRelationship ?? "",
    },
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateProfile(data)
      if (result.success) {
        router.push("/profile")
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    startUpload(async () => {
      const result = await uploadAvatar(fd)
      if (result.success) {
        setAvatarUrl(result.avatarUrl)
      } else {
        setError("root", { message: result.error })
      }
    })
  }

  function handleRemoveAvatar() {
    startUpload(async () => {
      const result = await removeAvatar()
      if (result.success) {
        setAvatarUrl(null)
      } else {
        setError("root", { message: result.error })
      }
    })
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-8">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <UserAvatar name={user.name} surname={user.surname} imageUrl={avatarUrl} size="lg" />
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <CameraIcon className="size-4" />
              {isUploading ? "Uploading…" : "Upload photo"}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isUploading}
                onClick={handleRemoveAvatar}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Identity */}
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <UserIcon className="size-4" /> Identity
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">First name</Label>
              <Input id="name" disabled={isPending} {...register("name")} />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="surname">Last name</Label>
              <Input id="surname" disabled={isPending} {...register("surname")} />
              {errors.surname && (
                <p className="text-destructive text-xs">{errors.surname.message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" disabled={isPending} {...register("username")} />
            {errors.username && (
              <p className="text-destructive text-xs">{errors.username.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" disabled={isPending} {...register("phone")} />
            {errors.phone && <p className="text-destructive text-xs">{errors.phone.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="homeLocation">Home location</Label>
            <Input
              id="homeLocation"
              placeholder="e.g. Pembrokeshire, Wales"
              disabled={isPending}
              {...register("homeLocation")}
            />
            <p className="text-muted-foreground text-xs">
              Shown on your public profile if you make it public.
            </p>
            {errors.homeLocation && (
              <p className="text-destructive text-xs">{errors.homeLocation.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="A short introduction — paddling style, home waters, what you're into."
              disabled={isPending}
              {...register("bio")}
            />
            {errors.bio && <p className="text-destructive text-xs">{errors.bio.message}</p>}
          </div>
        </div>

        <Separator />

        {/* Vessel */}
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <AnchorIcon className="size-4" /> Vessel defaults
          </p>
          <p className="text-muted-foreground -mt-2 text-xs">
            These pre-fill your float plan whenever you join a trip.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vesselMake">Make</Label>
              <Input
                id="vesselMake"
                placeholder="e.g. Wilderness Systems"
                disabled={isPending}
                {...register("vesselMake")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vesselModel">Model</Label>
              <Input
                id="vesselModel"
                placeholder="e.g. Tempest 170"
                disabled={isPending}
                {...register("vesselModel")}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vesselLengthCm">Length (cm)</Label>
              <Input
                id="vesselLengthCm"
                type="number"
                min={1}
                disabled={isPending}
                {...register("vesselLengthCm")}
              />
              {errors.vesselLengthCm && (
                <p className="text-destructive text-xs">{errors.vesselLengthCm.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vesselColorPrimary">Primary colour</Label>
              <Input
                id="vesselColorPrimary"
                placeholder="e.g. Red"
                disabled={isPending}
                {...register("vesselColorPrimary")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vesselColorSecondary">Secondary colour</Label>
              <Input
                id="vesselColorSecondary"
                placeholder="e.g. White"
                disabled={isPending}
                {...register("vesselColorSecondary")}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Emergency contact */}
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <ShieldAlertIcon className="size-4" /> Emergency contact
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emergencyContactName">Name</Label>
              <Input
                id="emergencyContactName"
                disabled={isPending}
                {...register("emergencyContactName")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emergencyContactRelationship">Relationship</Label>
              <Input
                id="emergencyContactRelationship"
                placeholder="e.g. Partner"
                disabled={isPending}
                {...register("emergencyContactRelationship")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergencyContactPhone">Phone</Label>
            <Input
              id="emergencyContactPhone"
              type="tel"
              disabled={isPending}
              {...register("emergencyContactPhone")}
            />
          </div>
        </div>

        {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.push("/profile")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
