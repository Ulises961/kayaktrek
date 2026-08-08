/**
 * Attribution for the Reinel rose, rendered wherever the rose is.
 *
 * A licence term, not decoration: the artwork is CC BY 2.5, which requires
 * credit reasonable to the medium, and a note in `docs/brand/licences.md`
 * doesn't reach anyone looking at the running app. Moving the rose means moving
 * this with it.
 */
export function RoseCredit() {
  return (
    // Full-opacity muted-foreground: an attribution that can't be read isn't one.
    <p className="text-muted-foreground max-w-xs text-center text-[0.48rem] leading-relaxed">
      Compass rose after Pedro Reinel, 1504 · drawn by{" "}
      <a
        href="https://commons.wikimedia.org/wiki/User:Alvesgaspar"
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2"
      >
        Joaquim Alves Gaspar
      </a>
      ,{" "}
      <a
        href="https://creativecommons.org/licenses/by/2.5/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2"
      >
        CC BY 2.5
      </a>
    </p>
  )
}
