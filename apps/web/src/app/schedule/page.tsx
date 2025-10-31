"use client"
import { CommonTextComponent } from "@/components/shared/commom-text-sction";
import { SanityButtons } from "@/components/elements/sanity-buttons";
import Link from "next/link";
import { Schedule } from "@/components/elements/one-life-wodify-schedule-iframe";

export default function SchedulePage() {
  return (
    <>
      <section className="mt-4 md:my-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className={`items-center`}>
            <CommonTextComponent
              heading={'h1'}
              isCentered
              badge={'Find Your Perfect Workout Time'}
              title={'Class Schedule'}
              buttons={[{
                href: '/free-consultation',
                text: 'Schedule a Free Consultation',
                variant: 'default',
                _key: "schedule-page-free-consult",
                _type: "button",
                openInNewTab: null
              }]}>
              <div className={`w-full flex flex-col items-center text-center`}>
                <p className={'md:max-w-1/2'}>Explore our <strong>CrossFit class
                  schedule</strong>, <strong>personal
                  training</strong>, <strong>open gym</strong>, and <strong>nutrition coaching</strong> availability.
                </p>
              </div>
            </CommonTextComponent>
          </div>
        </div>
      </section>
      <section aria-labelledby="schedule-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className={`flex flex-col gap-2 w-full items-center text-center`}>
            <h2 id="schedule-title" className={"text-balance font-semibold text-2xl lg:text-3xl"}>
              Weekly Class Schedule
            </h2>
            <p className={'md:max-w-1/2'}>
              Use the calendar below to reserve your class.
            </p>
            <h3 className={'text-balance font-bold text-xl lg:text-2xl'}>New to CrossFit? Not sure where to start?</h3>
            <p>
              Start with a <Link
              className={'font-medium transition-colors hover:text-foreground'}
              href="/free-consultation">free consultation</Link> and we’ll help you pick the right session.
            </p>

            <Schedule />

            <SanityButtons
              buttonClassName="w-full sm:w-auto"
              buttons={[{
                href: '/free-consultation',
                text: 'Reserve a Free Consultation',
                variant: 'default',
                _key: "schedule-page-free-consult",
                _type: "button",
                openInNewTab: null
              }, {
                href: 'https://onelifefitness.wodify.com/OnlineSalesPortal/PaymentPlans.aspx?LocationId=9721&OnlineMembershipId=264435',
                text: 'See Private Training / Nutrition Schedule',
                variant: 'outline',
                _key: "schedule-page-appointments",
                _type: "button",
                openInNewTab: null
              }]}
              className="grid w-full gap-2 sm:w-fit sm:grid-flow-col lg:justify-start"
            />
          </div>
        </div>
      </section>
    </>
  )
}

