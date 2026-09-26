import type { ReactNode } from "react"
import Link from "next/link"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { HistoryBackLink } from "@/components/common/history-back-link"
import { PageHeading } from "@/components/common/page-heading"

export const metadata = {
  title: "Terms of Use",
}

interface SectionProps {
  title: string
  children: ReactNode
}

// Draft ToU: reasonable starting content covering CLAUDE.md's pre-production checklist
// (safety disclaimer + no-vouching-for-user-content clause), grounded in how comparable
// marine navigation apps (Savvy Navvy, eSeaGo, SeaNav) phrase their own "not for
// navigation" disclaimers. Not a substitute for actual legal review before a real launch
// — "Governing law" below in particular is a placeholder for the operator's real
// jurisdiction, not a researched legal conclusion.
//
// "Your data" (originally §8, now §9 after the 2026-09-07 renumbering below) deliberately
// does not describe how anything is encrypted; it points at the privacy policy instead. It
// used to claim medical notes were "end-to-end encrypted and only ever decryptable by your
// trip leader", which was false on both halves when it was written — the encryption ran
// server-side (`Services/crypto_service.py`), so plaintext and password both reached the
// backend, and the owner could decrypt too. Two documents describing one mechanism is how
// that survived; one of them owning it is the fix, and it stood even while M22 (2026-09)
// had moved the crypto client-side and made the claim true again. "Cookies" (originally §7,
// now §8) follows the same rule — Privacy §5 is the one factual statement, this just points
// at it.
//
// That single-owner rule is why parking medical notes (2026-09-02) needed no edit to the
// body of this page: "Your data" never described the feature, so removing Privacy's
// health-data section left nothing here to go stale. Two documents describing one mechanism
// is exactly the failure this arrangement was built to avoid, and it paid off here.
//
// M25 §4 (2026-09-06) added four real gaps ahead of the open 1.0 release: the
// not-an-emergency-service clause in §3 (M3h's shore-contact alerts and M8's live position
// sharing create a real expectation that someone is watching, which nothing here disclaimed),
// a minimum age in §4, a discontinuation clause in §13 (new at the time — since renumbered,
// see below), and reasonable-advance-notice language for material changes (formerly a bare
// "continued use means acceptance", weak for material changes in the EU).
//
// M25 §4 follow-up (2026-09-07) — benchmarked against a comparable platform's Terms and
// added what was actually missing, not a wholesale copy (its employer-reporting clause in
// particular has no analogue here and was deliberately left out — there is no third party
// to report to, and no product reason to invent one):
// - §3 now covers user-entered data accuracy (shore contact, emergency info, crew) — the
//   Service doesn't verify any of it, and errors are the user's, not ours.
// - §4's minimum age moved from 14 (the GDPR Art. 8 floor) to 18 — a deliberate choice given
//   how much of this Service is safety-adjacent data (emergency contacts, live position,
//   shore-contact sharing), not a legal requirement; 14 would still have been compliant.
// - §4 gained standard account-security language (no impersonation, no credential sharing).
// - New §5, using the Service on behalf of an organization (a paddling club, an expedition
//   company) — genuinely missing before, since Trip.leader already implies someone can be
//   acting for a group. Shifted every later section down by one.
// - §6 (was §5) Acceptable use went from one paragraph to an itemized list: scraping/
//   crawling the Service, reverse-engineering, and building a directly competing product
//   are all real risks an open, publicly-crawlable route library (M23/M25 §1) didn't have
//   words for.
// - §10 (was §9) Intellectual property gained an explicit license grant (non-exclusive,
//   non-transferable, revocable) alongside the existing ownership statement — it asserted
//   ownership before without ever saying what right the user actually has.
function Section({ title, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-foreground text-base font-semibold tracking-[0.01em]">{title}</h2>
      <div className="text-foreground/90 flex flex-col gap-2 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="bg-background min-h-screen">
      <ChartHeaderBar className="relative" />

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10 sm:px-0">
        <HistoryBackLink />
        <div className="flex flex-col gap-1">
          <PageHeading>Terms of Use</PageHeading>
          <p className="text-muted-foreground text-xs">Last updated 7 September 2026</p>
        </div>

        <Section title="1. Acceptance of these terms">
          <p>
            By creating an account or otherwise using Kayaktrek (&ldquo;the Service&rdquo;), you
            agree to these Terms of Use. If you do not agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. What the service is">
          <p>
            Kayaktrek is a trip-planning tool for sea kayaking: route and itinerary building,
            weather and tidal forecasts, gear checklists, crew coordination, and — while a trip is
            underway — optional live position sharing between crew members and a designated shore
            contact.
          </p>
        </Section>

        <Section title="3. Safety disclaimer — read before you paddle">
          <p className="font-medium">
            The Service is a planning aid only. It is not a substitute for official nautical charts,
            tide tables, marine forecasts, or sound seamanship and judgement on the water.
          </p>
          <p>
            Weather forecasts, tidal predictions, rule-of-twelfths calculations, and tidal-gate
            warnings shown in the Service are derived from third-party data sources and simplified
            models. They can be wrong, delayed, or unavailable, and conditions at sea can change
            faster than any forecast. Do not rely on the Service as your sole source of information
            for a go/no-go decision, and always cross-check against official sources (harbourmaster
            notices, coastguard bulletins, published tide tables, and your own on-the-water
            observation) before and during a trip.
          </p>
          <p>
            You are solely responsible for assessing your own and your crew&rsquo;s ability,
            equipment, and the conditions for any expedition you plan or undertake, and for
            complying with any local regulations, permits, or navigation rules that apply to your
            route.
          </p>
          <p className="font-medium">
            The Service is not an emergency service. We do not monitor trips in progress, and we do
            not contact search-and-rescue or any other emergency service on your behalf.
            Shore-contact email alerts and live position sharing are best-effort features that may
            be delayed, misdelivered, fail to send, or go unnoticed by their recipient. A float plan
            held in the app is not a substitute for filing one with a person or authority who will
            actually act on it if you do not return.
          </p>
          <p>
            You are responsible for the accuracy of information you enter into the Service,
            including shore-contact details, emergency and medical information, vessel details, and
            crew information. We do not verify or independently check anything you enter — errors,
            omissions, or out-of-date information you provide are your responsibility, not ours.
          </p>
        </Section>

        <Section title="4. Accounts">
          <p>
            You must provide accurate registration information and are responsible for safeguarding
            your password and any activity under your account. Tell us promptly if you suspect
            unauthorized access.
          </p>
          <p>
            Don&rsquo;t choose a username you don&rsquo;t have the right to use, or use one to
            impersonate someone else. Don&rsquo;t share your account credentials or transfer your
            account to anyone else — you are solely responsible for all activity under your account.
          </p>
          <p>
            You must be at least 18 years old to create an account. We do not knowingly permit
            accounts held by anyone younger, and may suspend or terminate one if we learn otherwise.
          </p>
        </Section>

        <Section title="5. Using the Service on behalf of an organization">
          <p>
            If you create or manage a trip on behalf of a paddling club, expedition company, or
            other organization, you represent that you have the authority to act on that
            organization&rsquo;s behalf, and these Terms bind both you and the organization. If you
            do not have that authority, do not use the Service on the organization&rsquo;s behalf.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>Don&rsquo;t use the Service to:</p>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            <li>harass, threaten, or defame others, or misrepresent your identity;</li>
            <li>attempt to access data, accounts, or credentials that aren&rsquo;t yours;</li>
            <li>scrape, crawl, or bulk-extract content from the Service by automated means;</li>
            <li>
              decompile, reverse engineer, or attempt to extract the Service&rsquo;s source code;
            </li>
            <li>
              send spam, run automated scripts against the Service, or otherwise interfere with its
              operation;
            </li>
            <li>build a product that directly competes with the Service; or</li>
            <li>upload content you don&rsquo;t have the right to share.</li>
          </ul>
        </Section>

        <Section title="7. User-generated content">
          <p>
            Trip logs, photos, itineraries you choose to make public, and other content you submit
            remain yours, but you grant us a license to store and display it as needed to operate
            the Service (for example, showing a publicly-shared route on the landing map).
          </p>
          <p className="font-medium">
            We do not review, verify, or vouch for the accuracy of user-submitted content —
            including public routes, waypoints, trip logs, or endorsements from other paddlers.
            Treat any such content as one paddler&rsquo;s account of their own trip, not as verified
            navigational information. The same applies to position data broadcast during an active
            trip: we do not monitor it, and sharing it with your crew or shore contact does not mean
            anyone else is watching it on your behalf.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            The Service uses cookies only as described in the{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="9. Your data">
          <p>
            We process your personal data to provide the Service. What is collected, why, who it
            reaches, and how long it is kept are set out in the{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">
              Privacy Policy
            </Link>
            . You can export or request deletion of your account and its data from your profile
            settings at any time.
          </p>
        </Section>

        <Section title="10. Intellectual property">
          <p>
            The Service&rsquo;s software, design, and branding are owned by us or our licensors.
            Subject to these Terms, we grant you a non-exclusive, non-transferable, revocable right
            to access and use the Service for your own trip planning — this is a right to use it,
            not a sale or license of the underlying software. These Terms don&rsquo;t grant you any
            rights beyond that.
          </p>
        </Section>

        <Section title="11. Disclaimer of warranties">
          <p>
            The Service is provided &ldquo;as is&rdquo;, without warranties of any kind, express or
            implied, including fitness for a particular purpose or that the Service will be
            uninterrupted, error-free, or accurate.
          </p>
        </Section>

        <Section title="12. Limitation of liability">
          <p>
            To the fullest extent permitted by law, we are not liable for any indirect, incidental,
            or consequential damages arising from your use of the Service, or for any injury, loss,
            or damage arising from expeditions planned using it. Nothing in these Terms limits
            liability where the law does not allow it to be limited (for example, liability for
            death or personal injury caused by our negligence).
          </p>
        </Section>

        <Section title="13. Termination">
          <p>
            You can stop using the Service and delete your account at any time. We may suspend or
            terminate accounts that violate these Terms.
          </p>
        </Section>

        <Section title="14. Service availability and discontinuation">
          <p>
            We may suspend, limit, or discontinue the Service, in whole or in part, at any time. If
            we discontinue it entirely, we will give reasonable advance notice where practical and
            remind you that you can export your account data at any time before then from your
            profile settings — see Section 9.
          </p>
        </Section>

        <Section title="15. Changes to these terms">
          <p>
            We may update these Terms from time to time. For a material change, we will give
            reasonable advance notice (for example, by email or an in-app notice) before it takes
            effect. Continued use of the Service after a change takes effect means you accept the
            updated Terms.
          </p>
        </Section>

        <Section title="16. Governing law">
          <p>
            These Terms are governed by the laws of Italy and, where applicable, European Union law,
            without regard to conflict-of-law principles.
          </p>
        </Section>

        <Section title="17. Contact">
          <p>
            Questions about these Terms can be sent to the address listed on the{" "}
            <Link href="/about" className="underline underline-offset-2 hover:no-underline">
              About page
            </Link>
            .
          </p>
        </Section>
      </main>
    </div>
  )
}
