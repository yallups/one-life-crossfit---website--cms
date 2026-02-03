---
slug: /memberships
seo_title: 
seo_description: Compare One Life CrossFit memberships to find the best fit—group classes, hybrid coaching, private training, and nutrition options for every goal.
og_title: 
og_description: 
primary_keyword: CrossFit memberships Santa Maria
secondary_keywords: ["gym memberships Santa Maria", "personal training memberships Santa Maria", "Hybrid CrossFit membership", "fitness memberships Santa Maria"]
image_notes: Use a community-focused group photo or coaching-in-action shot from the library.
---

# Memberships Overview

## Page Builder Blocks (ordered)
- hero: Hero
- layout: Intro
- imageLinkCards: Membership Options
- cta: CTA / Next Step
- faqAccordion: FAQs

## Blocks (config-ready)
- hero
  - variant: centered
  - title: Memberships That Meet You Where You Are
  - richText: Choose from beginner-friendly foundations, hybrid coaching, or private training—each designed to deliver real results with expert guidance and a supportive community.
  - buttons:
    - text: Book A Free Consultation
      url: { type: internal, internal: /free-consultation }
    - text: Purchase Membership
      url: { type: external, external: https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9721 }
- layout (Intro)
  - variant: centered
  - title: We prescribe the right plan—not a one-size-fits-all price list
  - richText: Every member has different goals, schedules, and experience levels. We start with a conversation, then recommend the minimum effective dose of training, coaching, and accountability to get results.
- imageLinkCards (Membership Options)
  - title: Membership Options
  - cards:
    - title: New Foundations
      description: A guided start for anyone new to fitness or CrossFit.
      url: { type: internal, internal: /memberships/new-foundations }
    - title: Jump Start
      description: A streamlined on-ramp with fundamentals and group classes.
      url: { type: internal, internal: /memberships/jump-start }
    - title: Hybrid
      description: Group classes plus personal coaching sessions (1/2/4/8 per 4 weeks).
      url: { type: internal, internal: /memberships/hybrid }
    - title: Group Class
      description: Unlimited CrossFit + Bootcamp classes with Open Gym access.
      url: { type: internal, internal: /memberships/group-class }
    - title: Private Coaching
      description: One-on-one or semi-private coaching built around your goals.
      url: { type: internal, internal: /memberships/private-coaching }
  - buttons:
    - text: Purchase Membership
      url: { type: external, external: https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9721 }
- cta
  - title: Not sure which membership is right?
  - richText: Book a free consultation and we’ll recommend the best path for your goals, experience, and schedule.
  - buttons:
    - text: Book A Free Consultation
      url: { type: internal, internal: /free-consultation }
    - text: Purchase Membership
      url: { type: external, external: https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9721 }
- faqAccordion
  - title: FAQs
  - faqs:
    - faq-memberships-choose
    - faq-memberships-fit
    - faq-memberships-change
    - faq-memberships-private
    - faq-memberships-private-only
    - faq-memberships-pricing

## Hero

- headline: Memberships That Meet You Where You Are
- subheadline: Choose from beginner-friendly foundations, hybrid coaching, or private training—each designed to deliver
  real results with expert guidance and a supportive community.
- primary_cta: Book A Free Consultation
- primary_cta_link: https://onelifecrossfit.com/free-consultation
- secondary_cta: Purchase Membership
- secondary_cta_link: https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9721
- hero_image_notes: Choose a high-energy class image or group coaching shot.

## Intro

- headline: We prescribe the right plan—not a one-size-fits-all price list
- body: Every member has different goals, schedules, and experience levels. That’s why we start with a conversation,
  then recommend the minimum effective dose of training, coaching, and accountability to get you results. Below are the
  core membership paths we guide you into.
- supporting_points:
    - Beginner-friendly options with clear onboarding
    - Hybrid memberships that blend group classes with private coaching
    - Private coaching for focused goals, injuries, or added accountability
    - Complimentary [InBody scans](/programs/inbody-scan) with private training or nutrition coaching sessions

## Membership Options

- order_note: Present options in the same order as the Goal Review template (top-down, left-to-right). Avoid publishing
  prices.
- options:
    - name: New Foundations
      summary: A guided start for anyone new to fitness or CrossFit—build confidence, skill, and momentum fast.
      best_for: New to fitness or CrossFit, rebuilding habits, strength + conditioning foundation.
      link: /memberships/new-foundations
    - name: Jump Start
      summary: A faster on-ramp for motivated members who want a strong start with coaching and structure.
      best_for: Ready to commit, wants a quick start with coaching and accountability.
      link: /memberships/jump-start
  - name: Hybrid 4
    summary: Hybrid memberships include group classes plus personal coaching sessions (1/2/4/8 per 4 weeks).
    best_for: Experienced athletes with specific goals or those who want maximum coaching support.
    link: /memberships/hybrid
  - name: Group Class
    summary: Unlimited CrossFit + Bootcamp classes with Open Gym access.
    best_for: Experienced, self-directed members who want full class access and coaching.
    link: /memberships/group-class
  - name: Private Coaching
    summary: One-on-one or semi-private coaching built around your goals and schedule.
    best_for: Injury considerations, focused performance goals, or preference for individualized training.
    link: /memberships/private-coaching

## Membership Components (Cross-References)

- note: Use these as references when describing composite memberships. Avoid pricing.
- group_class_membership:
    - template_id: 191294
    - name: Group Class
    - includes: Unlimited CrossFit + Bootcamp classes and Open Gym access.
- bootcamp_membership:
    - template_id: 191296
    - name: Bootcamp
    - includes: Unlimited Bootcamp classes.
- fundamentals_course:
    - program_name: Fundamentals Course
    - program_id: 95313
    - description: Intro to CrossFit; movement prep and technique basics.
    - used_in: /memberships/new-foundations, /memberships/jump-start
- fundamentals_appointment_pack:
    - template_id: 245395
    - name: CrossFit Fundamentals (4 sessions - 30 min)
    - service_id: 15235
    - service_name: CrossFit Fundamentals (appointment service)
- foundations_membership:
    - template_id: 286401
    - name: Foundations
    - description: Unlimited + Fundamentals + 3 PT Sessions
- nutrition_coaching:
    - program_name: Nutrition
    - program_id: 104287
    - description: Nutrition and lifestyle coaching.
    - related_page: /programs/nutrition-lifestyle
    - used_in: /memberships/new-foundations (when prescribed), /memberships/jump-start (optional),
      /memberships/private-coaching (add-on)
- nutrition_appointment_service:
    - service_id: 24317
    - name: Nutrition / Lifestyle Coaching
- personal_coaching_plans:
    - note: Do not map Hybrid pages to appointment plans; hybrid memberships are managed separately in Wodify.
- private_coaching:
    - related_pages: /programs/private-training/1-1, /programs/private-training/semi-private
    - used_in: /memberships/hybrid, /memberships/private-coaching

## CTA / Next Step

- headline: Not sure which membership is right?
- body: Book a free consultation and we’ll recommend the best path for your goals, experience, and schedule.
- primary_cta: Book A Free Consultation
- primary_cta_link: https://onelifecrossfit.com/free-consultation
- secondary_cta: Purchase Membership
- secondary_cta_link: https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9721

## FAQs

- Q: How do I choose the right membership?
  A: Start with a free consultation. We’ll learn your goals and recommend the best-fit option.
- Q: Do I have to be fit to join?
  A: Not at all. We have beginner-friendly options and scale every workout to your current fitness level.
- Q: Can I start with one option and change later?
  A: Yes. As your goals or schedule change, we can move you into a different membership path.
- Q: Is there a membership that includes private coaching?
  A: Yes. Our Hybrid memberships include monthly private coaching sessions.
- Q: Do you offer private training only?
  A: Yes. Private coaching is available for anyone who wants a fully personalized plan.
- Q: Do you publish pricing on the website?
  A: We provide pricing during your consultation so we can match the plan to your goals and needs.

## Internal Links

- /memberships/new-foundations
- /memberships/jump-start
- /memberships/hybrid
- /memberships/group-class
- /memberships/private-coaching

## Notes

- Pricing order reference: Goal Review template (top-down, left-to-right).
