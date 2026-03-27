'use client'
import { usePathname } from "next/navigation"

export default function CurrentPageTitle() {
    const pathname = usePathname().replace("/", "");
    const pageTitle = pathname.substring(0, 1).toUpperCase() + pathname.slice(1);

    return <h1 className="mb-10">{pageTitle}</h1>
}
