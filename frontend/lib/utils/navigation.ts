// A real, full-page navigation — for the rare case where Next's client router
// treats a `<Link>` to the current URL as a no-op and something the URL doesn't
// track (client-only component state) genuinely needs the destination to remount
// fresh. Isolated in its own module so callers can mock it directly; jsdom's
// `window.location` is non-configurable and can't be stubbed in place.
export function forceNavigate(href: string) {
  window.location.assign(href)
}
