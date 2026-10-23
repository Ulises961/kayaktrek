import type { ReactNode } from "react"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { HistoryBackLink } from "@/components/common/history-back-link"
import { PageHeading } from "@/components/common/page-heading"

const contactMail = "privacy@kayaktrek.app"

export const metadata = {
  title: "Privacy Policy",
}

interface SectionProps {
  title: string
  children: ReactNode
}

// Draft privacy policy. Every factual claim is grounded in what the code does: the field list
// mirrors `backend/Models/user.py`, the retention windows come from `Tasks/erasure.py` (30-day
// grace) and `Tasks/expedition_log_task.py` (`_RETENTION_DAYS`). Keep it that way — Play reviews
// this against the Data safety declaration, and a user relies on it.
//
// Recipients are given as **categories, not vendor names**. GDPR Art. 13(1)(e) accepts either,
// and categories do not go stale when a provider is swapped, which a named list silently would.
//
// Not a substitute for legal review before a real launch.
//
// The health-data section was REMOVED on 2026-09-02 when the medical-notes feature was
// parked (docs/adr/safety-privacy.md "Parked"). Section 2's flat "does not collect health
// data" replaces it — a policy that describes processing the app does not perform is a
// liability, not a courtesy, and Art. 9 data is the last place to leave a stale claim.
// Restore the section, and the section 2 legal-basis sentence, if the feature is unparked;
// the deleted text is in this file's git history. Do NOT restore it because the code is
// still present — the flag, not the codebase, is what says whether the Service collects it.
//
// Section 1 deliberately carries no postal address (decided 2026-08-31). GDPR Art. 13(1)(a)
// requires the controller's identity and contact details — an email satisfies "contact
// details", so the policy is servable without one. Play's store listing requires a physical
// address, but only once the app takes payment, and that requirement is on the store listing,
// not this page. Add it here only if the policy text itself ever needs to carry it.
//
// The contact is `privacy@kayaktrek.app`, a Cloudflare Email Routing alias, rather than a personal
// mailbox — this page is built to be crawled, and an alias also survives a change of mail provider
// without editing a legal document. Same reasoning as section 6 listing recipient categories
// instead of vendor names: keep values that churn out of a document whose value is being accurate.
// The alias must stay deliverable for as long as the policy is published; it is the only route a
// data subject has for the rights in section 10.
//
// Section 12's minimum age moved from 16 to 18 (2026-09-07) to match the Terms of Use, whose
// own minimum was raised the same day — the two documents must agree on this number, and the
// Terms is the one that changed. Benchmarked against a comparable HR-platform's privacy policy
// in the same pass; the rest of it didn't transfer — it's built for an ad-tech/US-state-law
// model (targeted advertising, "sale" of data, analytics) this Service doesn't have, and
// importing that machinery would violate this file's own rule of describing only what the code
// does.
//
// A second benchmark, against a comparable route-planning/live-tracking platform's privacy
// policy (2026-09-07), was far more relevant — same domain, same Live Tracking-shaped feature —
// and contributed explicit GDPR Art. 6(1) citations next to each legal basis in section 2 and
// each right in section 10 (precision, not a new claim — the bases and rights were already
// stated correctly, just not cited to the specific article).
//
// That same pass also surfaced a real gap, not just a documentation one: section 8's technical-
// data retention line was unwritable, because nothing bounded it. Logfire (structured logs) is
// confirmed 30 days, but the *raw* container logs — gunicorn's access log on backend/worker/
// beat/sse, which includes the client IP on every request — had no rotation configured anywhere,
// neither in `docker-compose.prod.yml` nor the droplet's Docker daemon: unbounded growth on
// disk, no expiry at all. Fixed the same day with a `logging: *default-logging` block per
// service (`docker-compose.prod.yml`, `max-size`/`max-file`) before writing the retention line
// here — a policy claim needs the config to back it up, not the other way around.
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

export default function PrivacyPage() {
  return (
    <div className="bg-background min-h-screen">
      <ChartHeaderBar className="relative" />

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10 sm:px-0">
        <HistoryBackLink />
        <div className="flex flex-col gap-1">
          <PageHeading>Privacy Policy</PageHeading>
          <p className="text-muted-foreground text-xs">Last updated 23 October 2026</p>
        </div>

        <Section title="1. Who we are">
          <p>
            Kayaktrek (&ldquo;the Service&rdquo;) is a sea-kayaking trip planner. The data
            controller for the personal data described in this policy, for the purposes of the EU
            General Data Protection Regulation, is:
          </p>
          <p>
            Ulises E. Sosa
            <br />
            <a
              href={`mailto:${contactMail}`}
              className="underline underline-offset-2 hover:no-underline"
            >
              {contactMail}
            </a>
          </p>
          <p>
            This policy applies to the web application and the mobile application. It describes what
            personal data the Service processes, on what basis, who receives it, how long it is
            retained, and the rights available to you.
          </p>
        </Section>

        <Section title="2. Data we process">
          <p>
            <strong>Account data.</strong> Email address, username, and name, which are required to
            create and identify an account and to send service email. Surname, phone number, and
            profile picture are optional. Passwords are stored only as salted hashes.
          </p>
          <p>
            <strong>Profile data.</strong> Biography, home location, unit preference, and
            qualifications, all optional. Profiles are private unless you choose to make them
            public.
          </p>
          <p>
            <strong>Vessel data.</strong> Details about your kayak (such as make, model, and
            colour), if provided — the kind of description a search-and-rescue service would ask
            for, and included on any float plan you share.
          </p>
          <p>
            <strong>Emergency contact data.</strong> Name, telephone number, and relationship, if
            provided. Visible to the leader of a trip you join and included on that trip&rsquo;s
            float plan.
          </p>
          <p>
            <strong>Trip data.</strong> The content you create to plan and record a trip: routes and
            day plans, equipment lists, logistics details, uploaded travel documents, and paddling
            logs.
          </p>
          <p>
            <strong>Satellite feed data.</strong> If you register a Garmin inReach MapShare feed,
            its address and, if you protect it, its password. The password is encrypted at rest, but
            the Service can decrypt it, because it has to present it to Garmin to fetch your feed
            when you are not signed in. Removing the feed deletes both.
          </p>
          <p>
            <strong>Location data</strong> is covered in section 3.
          </p>
          <p>
            <strong>The Service does not collect health data.</strong> It does not ask for
            allergies, medical conditions, or medication, and holds no such information about you.
          </p>
          <p>
            <strong>Technical data.</strong> Server logs and error traces, containing IP address,
            timestamp, and the endpoint called. Used to operate and secure the Service. The Service
            does not use analytics, advertising, or tracking technologies, and does not carry out
            profiling or automated decision-making.
          </p>
          <p>
            <strong>Legal bases.</strong> Account, profile, vessel, emergency contact, and trip data
            are processed to perform our contract with you (Art. 6(1)(b) GDPR). Technical data is
            processed under our legitimate interest in operating and securing the Service (Art.
            6(1)(f) GDPR). Location data is processed on the basis of your explicit consent (Art.
            6(1)(a) GDPR), which you may withdraw at any time.
          </p>
        </Section>

        <Section title="3. Location data">
          <p>
            When a trip is underway and you have enabled position sharing, the Service records your
            position at intervals and makes it available to the other members of that trip, and to
            the trip&rsquo;s designated shore contact where the leader has shared a float plan link.
            The position is your device&rsquo;s precise location while Navigate mode is on or, if
            you have registered a Garmin inReach feed and switched it on for that trip, the position
            of your inReach.
          </p>
          <p>
            For an inReach, the Service fetches your feed from Garmin&rsquo;s servers about every
            ten minutes, using the address and password you provided, and records the positions you
            have published there: time, latitude and longitude, and where your device reports them,
            heading and speed. Garmin sees those requests, which come from the Service&rsquo;s
            servers. Registering a feed shares nothing: it applies only to a trip you switch it on
            for.
          </p>
          <p className="font-medium">
            Position sharing is disabled by default. It applies only to the trip for which it is
            enabled, and ends when you leave that mode, switch your inReach off, leave the trip, or
            the trip concludes.
          </p>
          <p>
            Recorded positions are deleted <strong>30 days after the trip ends</strong>. A summary
            of each day — distance, duration, and route — is written to your paddling log before
            deletion and is retained until you delete that log.
          </p>
          <p>
            Route planning does not use location data. Placing points on a map records the
            coordinates you select, not the position of your device.
          </p>
        </Section>

        <Section title="4. Photographs, documents, and publication">
          <p>
            Photographs attached to a route and uploaded travel documents are private by default.
            Documents are never published and are served through short-lived links to authorised
            users only.
          </p>
          <p>
            Content becomes visible to others only where you choose it, and each choice is
            reversible:
          </p>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            <li>
              Publishing a route adds its map, description, and any photographs marked public to the
              public route library. Crew, contacts, and logistics are not included.
            </li>
            <li>Making a profile public displays your name, biography, and statistics.</li>
            <li>
              Float plan and trip story links are unlisted URLs, accessible to anyone holding them.
              They can be revoked.
            </li>
          </ul>
          <p>Notes recorded against a waypoint are never included in published content.</p>
        </Section>

        <Section title="5. Cookies">
          <p>
            The Service uses strictly necessary cookies only, to maintain your session and to
            protect against cross-site request forgery. It does not use advertising, analytics, or
            tracking cookies, and accordingly does not display a consent banner.
          </p>
        </Section>

        <Section title="6. Recipients">
          <p>
            We do not sell personal data and do not disclose it for advertising purposes. Within the
            Service, data is visible to other users only as described in sections 3 and 5.
          </p>
          <p>
            We use processors acting on our instructions under contract, in the following
            categories: infrastructure and application hosting; content delivery and network
            security; object storage for images and uploaded files; transactional email delivery;
            encrypted off-site backup storage; application error and performance monitoring; and
            weather and sea forecast data.
          </p>
          <p>
            Backups are encrypted before transfer and the storage provider cannot read them.
            Forecast requests contain route coordinates only and carry no identifying information.
            Map imagery is retrieved by our servers and relayed to you, so map data providers do not
            receive your IP address.
          </p>
          <p>
            If you register an inReach feed, the Service retrieves it from Garmin&rsquo;s servers.
            Garmin is the source of those positions, not a recipient of your data from us, and sees
            only the requests themselves.
          </p>
          <p>The identity of our current processors is available on request.</p>
        </Section>

        <Section title="7. International transfers">
          <p>
            Application servers and the database are located in the European Union. Certain
            processors are established outside the EU and may process data in other jurisdictions.
            Such transfers are made under the European Commission&rsquo;s standard contractual
            clauses or an adequacy decision.
          </p>
          <p>
            Where the recipient is our backup storage provider, only the encrypted backup file
            described in section 6 is transferred — the provider holds no key and cannot read it.
          </p>
        </Section>

        <Section title="8. Retention">
          <ul className="ml-4 flex list-disc flex-col gap-1">
            <li>Account and trip data: retained until you delete your account.</li>
            <li>Recorded positions: deleted 30 days after the trip ends.</li>
            <li>
              Satellite feed address and password: kept until you remove the feed or delete your
              account.
            </li>
            <li>
              Deleted accounts: erased after a 30-day grace period, during which deletion can be
              cancelled.
            </li>
            <li>
              Backups: encrypted copies expire on a fixed schedule, so data may persist in backup
              for a limited period after deletion from live systems.
            </li>
            <li>
              Technical data: structured logs are retained for up to 30 days by our observability
              provider. Raw server logs are capped in size and rotate automatically.
            </li>
          </ul>
          <p>
            Where you have led a trip involving other members, erasure of your account removes your
            personal data from that trip but does not delete the trip itself, which is retained for
            the remaining members.
          </p>
        </Section>

        <Section title="9. Account deletion">
          <p>
            You may delete your account and its data at any time from{" "}
            <strong>Settings &rarr; Account</strong>. Deletion begins a 30-day grace period, during
            which a cancellation link sent by email remains valid. After that period the data is
            erased.
          </p>
          <p>
            If you are unable to sign in, or have uninstalled the application, contact us from the
            email address registered to the account and we will carry out the deletion.
          </p>
        </Section>

        <Section title="10. Your rights">
          <p>
            You have the right to access your personal data (Art. 15 GDPR), to rectification (Art.
            16), to erasure (Art. 17), to restriction of processing (Art. 18), to object to
            processing (Art. 21), and to data portability (Art. 20). Access, rectification, export,
            and erasure are available directly in your profile settings.
          </p>
          <p>
            Where processing is based on consent — location data — you may withdraw that consent at
            any time (Art. 7(3)), without affecting the lawfulness of processing carried out
            beforehand. You also have the right to lodge a complaint with your national supervisory
            authority (Art. 77).
          </p>
        </Section>

        <Section title="11. Security">
          <p>
            Data is encrypted in transit. Passwords are stored as salted hashes. Backups are
            encrypted before transfer. Sessions are held per device and can be revoked individually
            from your settings, taking effect immediately.
          </p>
          <p>
            No system can be guaranteed secure. Where a breach is likely to affect your rights, we
            will notify you and the relevant supervisory authority as required by law.
          </p>
        </Section>

        <Section title="12. Children">
          <p>
            The Service is not directed at children under 18 and we do not knowingly process their
            personal data — the Terms of Use set the same minimum age. If you believe a child has
            provided us with personal data, contact us and we will delete it.
          </p>
        </Section>

        <Section title="13. Changes">
          <p>
            We may update this policy. The date above indicates the current version. Where a change
            materially affects how personal data is used, we will notify you by email in advance.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Enquiries about this policy, and requests under section 10, may be sent to{" "}
            <a
              href={`mailto:${contactMail}`}
              className="underline underline-offset-2 hover:no-underline"
            >
              {contactMail}
            </a>
            .
          </p>
        </Section>
      </main>
    </div>
  )
}
