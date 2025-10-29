# One Life CrossFit Website and CMS

[Build with Next.js Monorepo with Sanity CMS](https://raw.githubusercontent.com/robotostudio/turbo-start-sanity/main/README.md)

A modern, full-stack monorepo template built with Next.js App Router, Sanity CMS, Shadcn UI, and TurboRepo.

## Features

### Monorepo Structure

- Apps: web (Next.js frontend) and studio (Sanity Studio)
- Shared packages: UI components, TypeScript config, ESLint config
- Turborepo for build orchestration and caching

### Frontend (Web)

- Next.js App Router with TypeScript
- Shadcn UI components with Tailwind CSS
- Server Components and Server Actions
- SEO optimization with metadata
- Blog system with rich text editor
- Table of contents generation
- Responsive layouts

### Content Management (Studio)

- Sanity Studio v3
- Custom document types (Blog, FAQ, Pages)
- Visual editing integration
- Structured content with schemas
- Live preview capabilities
- Asset management

## TODO
- [ ] Home Page
  - [X] Value Prop section 
  - [ ] Guide section - trusted authority - social proof
  - [ ] Plan section - "How it works" - fun easy
  - [ ] explanitory - SEO keyword rich
    - At company name we know that you want to be (a/an) identity transformation In order to do that, you need character want The problem is external problem which makes you feel internal problem we believe philosophical problem. We understand empathy, which is why we authority. Here's how we do it."
      1. Plan step one
      2. Plan step two
      3. Plan step three
         So, direct CTA so you can stop failure and instead success.
  - [ ] FAQs
- [ ] Website Structures
  - [ ] Contact Section - from settings (Should be included with footer)
    - Map of address
    - Business hours 
    - email
    - phone number
  - [ ] Value Props component
    - variant
      - title, image, text
      - image background
    - Value Prop
      - Title
      - image
      - rich text
      - link?
      - CTAs?
  - [ ] testimonial
    - image
    - rich text
    - page tags (group training, private, crossfit, etc)
  - [ ] Global Component - Lead generator - free 30 day plan to get fit... (Lead magnet)
- [ ] Programs/services
  - [ ] group training
    - Pages
      - [ ] crossfit
      - [ ] bootcamp
      - [ ] AA
    - Page structure
      - Hero
      - Announcements component - from Wodify
      - Value Prop
      - WOD - from Wodify - https://docs.wodify.com/reference/get_workouts-1
      - Schedule component - from Wodify
      - CTA - book consult
      - Testimonial
  - [ ] Private training
    - Pages
      - [ ] 1:1
      - [ ] semi-private
    - Page Structure
      - Hero
      - Value Prop
      - CTA - book consult
      - Testimonial
  - [ ] Nutrition / Lifestyle
      - Page Structure
        - Hero
        - Value Prop
        - CTA - book consult
        - Testimonial
  - [ ] Sports Massage Therapy
    - Page Structure
      - Hero
      - Value Prop
      - CTA
- [ ] Memberships
  - [ ] New Foundations
    - You’ll complete the fundamentals sessions (4 of them 30 min each) - these are not heavy workouts, they are informational and form developing. It’s usually recommended to do them just before or right after a class.
    - Then Hans or a coach will conduct a base line private training session with you where he will coach your through a couple benchmarks.
    - I’ll put you down in the next 60 days for a nutrition review after you’ve had some time in class so we can check energy levels and make sure you’re getting the right fuel.
    - Finally at day 90 you’ll use your last Private Training session to retest your baselines and we will make sure your one the right path to maximum health.
  - [ ] "Jump start"
    - Group + Fundamentals
  - [ ] Hybrid 1, 2, 4
  - [ ] Private Coaching
    - Nutrition
    - Custom program (Hyrox, Spartan, CrossFit, Endurance, Running, Weightlifting)
    - packs, monthly
- [ ] Schedule
  - Master schedule with booking links - from wodify
  - Map to gym
  - Contact Section
- [ ] Fill out blog pages
- [ ] About / Team
  - Page Structure
    - Hero - CTA "talk with a team member"
    - Team Member List - Pull Coaches from Wodify https://docs.wodify.com/reference/get_coaches-1
- [ ] Gym Gallery
- [ ] Instagram Feed component
- [ ] Yelp Review component


## Getting Started

### Installing locally

#### 1. Initialize template with Sanity CLI

Check out project from github

#### 2. Run Studio and Next.js app locally

Navigate to the template directory using `cd <your app name>`, and start the development servers by running the following command

```shell
pnpm run dev
```

#### 3. Open the app and sign in to the Studio

Open the Next.js app running locally in your browser on [http://localhost:3000](http://localhost:3000).

Open the Studio running locally in your browser on [http://localhost:3333](http://localhost:3333). You should now see a screen prompting you to log in to the Studio. Use the same service (Google, GitHub, or email) that you used when you logged in to the CLI.

### Adding content with Sanity

#### 1. Publish your first document

The template comes pre-defined with a schema containing `Author`, `Blog`, `BlogIndex`, `FAQ`, `Footer`, `HomePage`, `Navbar`, `Page`, and `Settings` document types.

From the Studio, click "+ Create" and select the `Blog` document type. Go ahead and create and publish the document.

Your content should now appear in your Next.js app ([http://localhost:3000](http://localhost:3000)) as well as in the Studio on the "Presentation" Tab

#### 2. Extending the Sanity schema

The schemas for all document types are defined in the `studio/schemaTypes/documents` directory. You can [add more document types](https://www.sanity.io/docs/schema-types) to the schema to suit your needs.

### Deploying your application and inviting editors

#### 1. Deploy Sanity Studio

Your Next.js frontend (`/web`) and Sanity Studio (`/studio`) are still only running on your local computer. It's time to deploy and get it into the hands of other content editors.

> **⚠️ Important**: When initializing the template with the Sanity CLI, the `.github` folder may not be included or might be renamed to `github` (without the dot). If you don't see a `.github` folder in your project root, you'll need to manually create it and copy the GitHub Actions workflows from the [template repository](https://github.com/robotostudio/turbo-start-sanity/tree/main/.github) for the deployment automation to work.

The template includes a GitHub Actions workflow [`deploy-sanity.yml`](https://raw.githubusercontent.com/robotostudio/turbo-start-sanity/main/.github/workflows/deploy-sanity.yml) that automatically deploys your Sanity Studio whenever changes are pushed to the `studio` directory.

> **Note**: To use the GitHub Actions workflow, make sure to configure the following secrets in your repository settings:
>
> - `SANITY_DEPLOY_TOKEN`
> - `SANITY_STUDIO_PROJECT_ID`
> - `SANITY_STUDIO_DATASET`
> - `SANITY_STUDIO_TITLE`
> - `SANITY_STUDIO_PRESENTATION_URL`
> - `SANITY_STUDIO_PRODUCTION_HOSTNAME`

Set `SANITY_STUDIO_PRODUCTION_HOSTNAME` to whatever you want your deployed Sanity Studio hostname to be. Eg. for `SANITY_STUDIO_PRODUCTION_HOSTNAME=my-cool-project` you'll get a studio URL of `https://my-cool-project.sanity.studio` (and `<my-branch-name>-my-cool-project.sanity.studio` for PR previews builds done automatically via the `deploy-sanity.yml` github CI workflow when you open a PR.)

Set `SANITY_STUDIO_PRESENTATION_URL` to your web app front-end URL (from the Vercel deployment). This URL is required for production deployments and should be:
- Set in your GitHub repository secrets for CI/CD deployments
- Set in your local environment if deploying manually with `npx sanity deploy`
- Not needed for local development, where preview will automatically use http://localhost:3000

You can then manually deploy from your Studio directory (`/studio`) using:

```shell
npx sanity deploy
```

**Note**: To use the live preview feature, your browser needs to enable third party cookies.

#### 2. Deploy Next.js app to Vercel

You have the freedom to deploy your Next.js app to your hosting provider of choice. With Vercel and GitHub being a popular choice, we'll cover the basics of that approach.

1. Create a GitHub repository from this project. [Learn more](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).
2. Create a new Vercel project and connect it to your Github repository.
3. Set the `Root Directory` to your Next.js app (`/apps/web`).
4. Configure your Environment Variables.

#### 3. Invite a collaborator

Now that you've deployed your Next.js application and Sanity Studio, you can optionally invite a collaborator to your Studio. Open up [Manage](https://www.sanity.io/manage), select your project and click "Invite project members"

They will be able to access the deployed Studio, where you can collaborate together on creating content.
