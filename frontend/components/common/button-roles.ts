/**
 * Button role classes, for the two roles the `Button` primitive has no variant for.
 *
 * `/design` §3 states the rule — each role has one colour, no exceptions — with four
 * roles: CTA on sunset, live/motion on foam, structure on ocean (the default variant),
 * destructive on red (the `destructive` variant). The primitive covers structure and
 * destructive; these cover the other two without editing a shadcn file by hand.
 *
 * Exported as class strings rather than wrapper components because the call sites need
 * `asChild` (a `Link` inside a `Button`, an `AlertDialogTrigger` around one), which a
 * wrapper would have to re-plumb. Same precedent as `fieldLabelClass`.
 */

/**
 * Bringing something into existence, or into effect.
 *
 * Creating a trip, a log, a checklist item brings it into existence. The auth submits
 * create nothing, but bring a session into effect. One idea, so there are no special
 * cases to remember.
 *
 * This replaced an earlier "the one action a surface exists to produce" rule, which asked
 * what a surface was *for* — a judgement that has to be re-made every time someone adds a
 * section, and which stranded the checklist's own Add as structure because the tab was
 * nominally about something else. A property of the action is stable; a property of the
 * surface is not.
 *
 * Rare by arithmetic rather than by restraint: ~11 creation actions exist against 178
 * buttons, so this is about 6% of them.
 *
 * Not for: saving edits to something that already exists (it exists already); dialog
 * confirms, where opening the dialog was the commitment and the button only completes it;
 * navigation; or toggles and switches, which report a state rather than take an action.
 */
export const ctaButtonClass = "bg-cta text-cta-foreground hover:bg-cta/90"

/**
 * The CTA echoed on a repeated item — quiet at rest, the role colour on reach.
 *
 * For a list where the same action appears once per row: filling every card with amber
 * would turn a signal into a pattern, but the action is still the CTA, so it should say so
 * the moment you go for it. `/explore`'s "Use this route" is the case — solid amber on the
 * single route-detail page, this on each card in the list beside it.
 *
 * Pair with `variant="outline"`; only the hover state is overridden.
 */
export const ctaEchoClass = "hover:bg-cta hover:text-cta-foreground hover:border-cta"

/**
 * Live / motion — something happening right now, in real time.
 *
 * The same hue the `happening` state badge and the map's position markers carry, so one
 * concept keeps one colour across the surfaces it appears on.
 */
export const liveButtonClass = "bg-foam hover:bg-foam/90 text-white"
