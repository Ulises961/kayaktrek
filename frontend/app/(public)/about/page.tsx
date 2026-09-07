import { ChartHeaderBar } from "@/components/common/chart-header"
import { PageHeading } from "@/components/common/page-heading"
import packageJson from "@/package.json"

const GITHUB_URL = "https://github.com/Ulises961"
const SUPPORT_MAIL = "support@kayaktrek.app"

export const metadata = {
  title: "About",
}

const linkClass = "underline underline-offset-2 hover:no-underline"

export default function AboutPage() {
  return (
    <div className="bg-background min-h-screen">
      <ChartHeaderBar className="relative" />

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 sm:px-0">
        <PageHeading>About</PageHeading>

        <div className="text-foreground/90 flex flex-col gap-4 text-sm leading-relaxed">
          <p>
            Kayaktrek is a free, solo-built trip-planning tool for sea kayaking — currently v
            {packageJson.version}.
          </p>

          <p>
            Built by{" "}
            <a href={GITHUB_URL} className={linkClass}>
              Ulises on GitHub
            </a>
            .
          </p>

          <p>
            Found a bug, or have a question? Reach out at{" "}
            <a href={`mailto:${SUPPORT_MAIL}`} className={linkClass}>
              {SUPPORT_MAIL}
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
