import type { ReactNode } from "react"
import { ChartHeaderBar } from "@/components/common/chart-header"
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
        <div className="flex flex-col gap-1">
          <PageHeading>Terms of Use</PageHeading>
          <p className="text-muted-foreground text-xs">Last updated 31 July 2026</p>
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
        </Section>

        <Section title="4. Accounts">
          <p>
            You must provide accurate registration information and are responsible for safeguarding
            your password and any activity under your account. Tell us promptly if you suspect
            unauthorized access.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>
            Don&rsquo;t use the Service to harass others, misrepresent yourself, interfere with the
            Service&rsquo;s operation, or attempt to access data or accounts that aren&rsquo;t
            yours. Don&rsquo;t upload content you don&rsquo;t have the right to share.
          </p>
        </Section>

        <Section title="6. User-generated content">
          <p>
            Trip logs, photos, itineraries you choose to make public, and other content you submit
            remain yours, but you grant us a license to store and display it as needed to operate
            the Service (for example, showing a publicly-shared route on the landing map).
          </p>
          <p className="font-medium">
            We do not review, verify, or vouch for the accuracy of user-submitted content —
            including public routes, waypoints, trip logs, or endorsements from other paddlers.
            Treat any such content as one paddler&rsquo;s account of their own trip, not as verified
            navigational information.
          </p>
        </Section>

        <Section title="7. Cookies">
          <p>
            The Service uses a strictly-necessary session cookie to keep you signed in. We do not
            use advertising, tracking, or analytics cookies.
          </p>
        </Section>

        <Section title="8. Your data">
          <p>
            We process your personal data to provide the Service, as described at the point each
            piece of data is collected in the app (for example, medical information you optionally
            add to a float plan is end-to-end encrypted and only ever decryptable by your trip
            leader). You can export or request deletion of your account and its data from your
            profile settings at any time.
          </p>
        </Section>

        <Section title="9. Intellectual property">
          <p>
            The Service&rsquo;s software, design, and branding are owned by us or our licensors.
            These Terms don&rsquo;t grant you any rights to them beyond what&rsquo;s needed to use
            the Service normally.
          </p>
        </Section>

        <Section title="10. Disclaimer of warranties">
          <p>
            The Service is provided &ldquo;as is&rdquo;, without warranties of any kind, express or
            implied, including fitness for a particular purpose or that the Service will be
            uninterrupted, error-free, or accurate.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>
            To the fullest extent permitted by law, we are not liable for any indirect, incidental,
            or consequential damages arising from your use of the Service, or for any injury, loss,
            or damage arising from expeditions planned using it. Nothing in these Terms limits
            liability where the law does not allow it to be limited (for example, liability for
            death or personal injury caused by our negligence).
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            You can stop using the Service and delete your account at any time. We may suspend or
            terminate accounts that violate these Terms.
          </p>
        </Section>

        <Section title="13. Changes to these terms">
          <p>
            We may update these Terms from time to time. Continued use of the Service after a change
            means you accept the updated Terms.
          </p>
        </Section>

        <Section title="14. Governing law">
          <p>
            These Terms are governed by the laws of Italy and, where applicable, European Union law,
            without regard to conflict-of-law principles.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>Questions about these Terms can be sent to the contact address listed in the app.</p>
        </Section>
      </main>
    </div>
  )
}
