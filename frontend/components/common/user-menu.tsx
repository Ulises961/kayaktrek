"use client"

import Link from "next/link"
import { useTransition } from "react"
import {
  LogInIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UserPlusIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/common/user-avatar"
import { formatPaddlerName } from "@/lib/user/format"
import { logout } from "@/lib/auth/actions"

interface UserMenuAccount {
  name: string
  surname?: string | null
  username?: string | null
  mail: string
  avatarUrl?: string | null
  // Only offers the entry; the Admin page and every admin endpoint check for themselves.
  isAdmin?: boolean
}

interface UserMenuProps {
  // Null when /api/user/me did not resolve. The menu still renders: the sign-out
  // path must not depend on a fetch that can fail.
  account: UserMenuAccount | null
  // Separate from `account` because a null account covers two opposite visitors: an
  // anonymous one, and a signed-in one whose user record failed to load. The second
  // still needs Sign out, so only this may switch the menu to Sign in.
  isAuthenticated?: boolean
}

export function UserMenu({ account, isAuthenticated = true }: UserMenuProps) {
  const [isSigningOut, startSignOut] = useTransition()
  const displayName = account ? formatPaddlerName(account) : ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          {account ? (
            <UserAvatar
              name={account.name || account.username || ""}
              surname={account.surname}
              imageUrl={account.avatarUrl}
              size="sm"
            />
          ) : (
            <UserIcon className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {!isAuthenticated && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogInIcon />
                Sign in
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/register">
                <UserPlusIcon />
                Create account
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {isAuthenticated && account && (
          <>
            <div className="flex min-w-0 flex-col px-2 py-1.5">
              <span className="truncate text-sm font-medium">{displayName}</span>
              <span className="text-muted-foreground truncate text-xs">{account.mail}</span>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {isAuthenticated && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserIcon />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            {account?.isAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <ShieldCheckIcon />
                  Admin
                </Link>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Keeping the menu open (`preventDefault`) is what makes the pending label
                visible — sign-out is a round trip, and a menu that vanished on click
                would leave nothing on screen saying it had started. */}
            <DropdownMenuItem
              disabled={isSigningOut}
              onSelect={(event) => {
                event.preventDefault()
                startSignOut(() => logout())
              }}
            >
              <LogOutIcon />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
