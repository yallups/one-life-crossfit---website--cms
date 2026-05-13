"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

const WODIFY_ACTION =
  "https://app-api.wodify.com/Lead_API/rest/form/submit";
const DEFAULT_REDIRECT_URL = "http://onelifecrossfit.com";
const DEFAULT_LEAD_SOURCE_ID = "378275";

const LEAD_SOURCES = [
  { value: "0", label: "-" },
  { value: "294914", label: "Friend/Family" },
  { value: "294915", label: "Facebook" },
  { value: "294916", label: "Google/Search Engine" },
  { value: "294917", label: "SMS" },
  { value: "294918", label: "Online Sales" },
  { value: "294919", label: "Other" },
  { value: DEFAULT_LEAD_SOURCE_ID, label: "Wellness Fair" },
];

const LEAD_SOURCE_VALUES = new Set(LEAD_SOURCES.map((source) => source.value));

export type SignUpFormDefaults = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  subscribeToSms?: boolean;
  leadSource?: string;
};

type Errors = {
  firstName?: boolean;
  lastName?: boolean;
  email?: boolean;
  phone?: boolean;
};

function isValidEmail(email: string): boolean {
  return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
    email,
  );
}

function getDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function FieldError({
  active,
  children,
}: {
  active?: boolean;
  children: string;
}) {
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-2 text-sm text-destructive",
        active ? "flex" : "hidden",
      )}
    >
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function FormField({
  label,
  name,
  required,
  icon: Icon,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  icon: typeof User;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={name}
        className="flex items-center gap-2 font-medium text-sm text-foreground"
      >
        <Icon className="size-4 text-primary" aria-hidden />
        <span>
          {label}
          {required ? <span className="ml-1 text-primary">*</span> : null}
        </span>
      </label>
      {children}
    </div>
  );
}

const fieldClassName =
  "h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--background)] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--foreground)] [&:-webkit-autofill:focus]:shadow-[inset_0_0_0_1000px_var(--background)] [&:-webkit-autofill:focus]:[-webkit-text-fill-color:var(--foreground)]";

const dateFieldClassName = cn(
  fieldClassName,
  "max-w-56 pr-3 [color-scheme:dark] [&::-webkit-date-and-time-value]:text-foreground [&::-webkit-datetime-edit]:text-foreground [&::-webkit-datetime-edit-day-field]:text-foreground [&::-webkit-datetime-edit-month-field]:text-foreground [&::-webkit-datetime-edit-year-field]:text-foreground",
);

export function SignUpForm({ defaults }: { defaults?: SignUpFormDefaults }) {
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const defaultLeadSource =
    defaults?.leadSource && LEAD_SOURCE_VALUES.has(defaults.leadSource)
      ? defaults.leadSource
      : DEFAULT_LEAD_SOURCE_ID;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formData = new FormData(form);

    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const phoneDigits = getDigits(phone);

    const nextErrors: Errors = {
      firstName: firstName.length === 0,
      lastName: lastName.length === 0,
      email: email.length === 0 || !isValidEmail(email),
      phone: phoneDigits.length > 0 && phoneDigits.length !== 10,
    };

    (
      form.elements.namedItem("first_name") as HTMLInputElement | null
    )!.value = firstName;
    (
      form.elements.namedItem("last_name") as HTMLInputElement | null
    )!.value = lastName;
    (form.elements.namedItem("email") as HTMLInputElement | null)!.value =
      email;
    (form.elements.namedItem("phone") as HTMLInputElement | null)!.value =
      phoneDigits;

    if (Object.values(nextErrors).some(Boolean)) {
      event.preventDefault();
      setIsSubmitting(false);
      setErrors(nextErrors);
      return;
    }

    const redirectInput = form.elements.namedItem(
      "redirecturl",
    ) as HTMLInputElement | null;

    if (
      redirectInput &&
      email &&
      redirectInput.value.includes("wodify.com/OnlineSalesPage/Main")
    ) {
      const separator = redirectInput.value.includes("?") ? "&" : "?";
      const encodedParameterEmail = encodeURIComponent(
        `${separator}PrefilledEmail=${email}`,
      );
      redirectInput.value = `${redirectInput.value}${encodedParameterEmail}`;
    }

    setErrors({});
    setIsSubmitting(true);
  }

  return (
    <form
      action={WODIFY_ACTION}
      acceptCharset="UTF-8"
      method="POST"
      onSubmit={handleSubmit}
      className="space-y-6"
      autoComplete="on"
      noValidate
    >
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="First Name" name="first_name" required icon={User}>
          <input
            id="first_name"
            name="first_name"
            type="text"
            maxLength={50}
            className={fieldClassName}
            autoComplete="given-name"
            defaultValue={defaults?.firstName ?? ""}
            enterKeyHint="next"
          />
          <FieldError active={errors.firstName}>Required field.</FieldError>
        </FormField>

        <FormField label="Last Name" name="last_name" required icon={User}>
          <input
            id="last_name"
            name="last_name"
            type="text"
            maxLength={50}
            className={fieldClassName}
            autoComplete="family-name"
            defaultValue={defaults?.lastName ?? ""}
            enterKeyHint="next"
          />
          <FieldError active={errors.lastName}>Required field.</FieldError>
        </FormField>

        <FormField label="Email" name="email" required icon={Mail}>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={250}
            className={fieldClassName}
            autoComplete="email"
            defaultValue={defaults?.email ?? ""}
            enterKeyHint="next"
          />
          <FieldError active={errors.email}>
            Enter a valid email address.
          </FieldError>
        </FormField>

        <FormField label="Phone" name="phone" icon={Phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            maxLength={20}
            placeholder="1234567890"
            className={fieldClassName}
            autoComplete="tel"
            defaultValue={defaults?.phone ?? ""}
            enterKeyHint="next"
          />
          <FieldError active={errors.phone}>
            Enter a 10 digit number to ensure you receive SMSs.
          </FieldError>
        </FormField>

        <FormField label="Date Of Birth" name="dateofbirth" icon={CalendarDays}>
          <input
            id="dateofbirth"
            name="dateofbirth"
            type="date"
            className={dateFieldClassName}
            autoComplete="bday"
            defaultValue={defaults?.dateOfBirth ?? ""}
          />
        </FormField>

        <FormField
          label="How Did You Hear About Us"
          name="leadsource"
          icon={Check}
        >
          <select
            id="leadsource"
            name="leadsource"
            className={fieldClassName}
            defaultValue={defaultLeadSource}
          >
            {LEAD_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="rounded-md border border-border bg-muted/25 p-4">
        <label
          htmlFor="subscribe_tollfree"
          className="flex items-start gap-3 text-sm"
        >
          <input
            id="subscribe_tollfree"
            name="subscribe_tollfree"
            type="checkbox"
            value="true"
            className="mt-1 size-4 rounded border-border text-primary focus:ring-ring"
            defaultChecked={defaults?.subscribeToSms ?? false}
          />
          <span className="space-y-2">
            <span className="block font-medium text-foreground">
              Subscribe to SMS
            </span>
            <span className="block text-muted-foreground">
              By submitting this form with the box checked, you agree to receive
              text messages from One Life CrossFit at 8057140338 and agree to
              the{" "}
              <a
                href="http://www.wodify.com/privacy-policy.html"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                Privacy Policy
              </a>
              . Message frequency varies and may include updates, reminders,
              and announcements. Reply STOP or CANCEL to unsubscribe. Reply HELP
              or call 8057140338 for support. Message and data rates may apply.
            </span>
          </span>
        </label>
      </div>

      <input
        type="hidden"
        id="emailConfig"
        name="emailConfig"
        value="W3siZmllbGQiOiJmaXJzdF9uYW1lIiwicmVxdWlyZWQiOnRydWV9LHsiZmllbGQiOiJsYXN0X25hbWUiLCJyZXF1aXJlZCI6dHJ1ZX0seyJmaWVsZCI6ImVtYWlsIiwicmVxdWlyZWQiOnRydWV9LHsiZmllbGQiOiJwaG9uZSJ9LHsiZmllbGQiOiJkYXRlb2ZiaXJ0aCJ9LHsiZmllbGQiOiJzdWJzY3JpYmVfdG9sbGZyZWUifSx7ImZpZWxkIjoibGVhZHNvdXJjZSJ9XQ=="
      />
      <input type="hidden" name="redirecturl" value={DEFAULT_REDIRECT_URL} />
      <input type="hidden" name="apikey" value="RIVNFw674W" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We will follow up with the next best step for your goals.
        </p>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Reserve Your Spot"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
