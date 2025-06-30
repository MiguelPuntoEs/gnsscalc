# gnsscalc.com

gnsscalc is a tool to perform time conversions between different scales and several time computations.

Since these computations are not always trivial and are fairly common among engineers in the GNSS work environment, the author considered sharing this tool initially developed for his daily work.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in the required environment variables:
   - `NEXT_PUBLIC_FORM`: Your Formspree form ID for the contact form
   - `NEXT_PUBLIC_GA_CODE`: Your Google Analytics tracking code
4. Run the development server: `npm run dev`

## Environment Variables

- `NEXT_PUBLIC_FORM`: Formspree form ID for the contact form functionality
- `NEXT_PUBLIC_GA_CODE`: Google Analytics tracking code for analytics
