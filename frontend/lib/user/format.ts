// How a paddler is named anywhere their record is shown — crew lists, buddy rows,
// the float-plan manifest, the account menu. Surname is optional on the model, so a
// naive `${name} ${surname}` leaves a trailing space; username is the last resort
// for a record whose real name was never filled in.
export function formatPaddlerName(paddler: {
  name: string
  surname?: string | null
  username?: string | null
}): string {
  return [paddler.name, paddler.surname].filter(Boolean).join(" ") || (paddler.username ?? "")
}

export function formatVesselLength(cm: number | null | undefined): string | null {
  if (cm == null) return null
  return `${(cm / 100).toFixed(2)} m`
}
