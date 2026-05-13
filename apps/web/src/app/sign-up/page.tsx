import { Badge } from "@workspace/ui/components/badge";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { SignUpForm, type SignUpFormDefaults } from "@/components/sign-up-form";
import { getSEOMetadata } from "@/lib/seo";

export const metadata: Metadata = getSEOMetadata({
  title: "Sign Up",
  description:
    "Sign up with One Life CrossFit and we will follow up with next steps.",
  slug: "/sign-up",
  seoNoIndex: true,
});

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

function getBooleanParam(value: string | string[] | undefined): boolean {
  const normalized = getStringParam(value).toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function getDefaults(searchParams: SearchParams): SignUpFormDefaults {
  return {
    firstName: getStringParam(searchParams.first_name ?? searchParams.firstName),
    lastName: getStringParam(searchParams.last_name ?? searchParams.lastName),
    email: getStringParam(searchParams.email),
    phone: getStringParam(searchParams.phone),
    dateOfBirth: getStringParam(
      searchParams.dateofbirth ?? searchParams.dateOfBirth,
    ),
    subscribeToSms: getBooleanParam(
      searchParams.subscribe_tollfree ?? searchParams.subscribeToSms,
    ),
    leadSource: getStringParam(searchParams.leadsource ?? searchParams.leadSource),
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const defaults = getDefaults(await searchParams);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-muted/20 px-4 py-12 sm:py-16">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <Badge variant="secondary">One Life CrossFit</Badge>
              <div className="space-y-4">
                <h1 className="max-w-xl text-balance font-semibold text-4xl text-foreground sm:text-5xl">
                  Sign up with One Life CrossFit
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Share your contact info and our team will follow up with a
                  clear next step based on your goals.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="mb-6 space-y-2">
                <h2 className="font-semibold text-2xl text-card-foreground">
                  Get started
                </h2>
                <p className="text-sm text-muted-foreground">
                  Required fields are marked with an asterisk.
                </p>
              </div>
              <SignUpForm defaults={defaults} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
