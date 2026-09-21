# Yes Dhobi Partner

A modern vendor onboarding and registration platform for laundry service partners across India. Built with React 19, TypeScript, Vite, and Tailwind CSS.

---

## Features

- **Partner Landing Page**: High-converting showcase featuring platform benefits, partner earnings projections, step-by-step explanation, testimonials, and FAQs.
- **5-Step Vendor Registration Flow**:
  1. **Personal Information**: Contact details and partner credentials.
  2. **Store Details**: Operational address, daily capacity, and shop info.
  3. **Service Offerings**: Wash & fold, dry cleaning, steam ironing, and express turnaround options.
  4. **Bank & Payouts**: Secure bank account, IFSC, and UPI settlement details.
  5. **Document Verification (KYC)**: Aadhaar, PAN card, store photos, and trade licenses with instant submission feedback.
- **Brand Identity**: Custom vector logo featuring the signature wave and water droplet typography, styled with the official color palette.
- **Responsive Design**: Mobile-first architecture with smooth animations powered by Motion.

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Motion](https://motion.dev/)
- **Effects**: [Canvas Confetti](https://www.npmjs.com/package/canvas-confetti)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `bun`

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd <project-folder>

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

The application runs locally at `http://localhost:3000`.

### Production Build

```bash
# Type check and build for production
npm run build

# Preview production build
npm run preview
```

### Linting

```bash
npm run lint
```

---

## Project Structure

```
├── public/                # Static assets & SVG brand logos
├── src/
│   ├── assets/            # High-resolution imagery
│   ├── components/        # UI components (Header, Footer, LandingPage, Steps)
│   │   ├── steps/         # Multi-step vendor registration forms
│   │   └── YesDhobiLogo.tsx # Official vector logo component
│   ├── types.ts           # Shared TypeScript interfaces & types
│   ├── App.tsx            # Main application root & view router
│   ├── main.tsx           # React DOM entry point
│   └── index.css          # Global Tailwind styles
├── index.html             # HTML entry point with SEO meta & favicon
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── vite.config.ts         # Vite build & proxy settings
```

---

## License & Copyright

© 2026. All rights reserved by Yesdhobi.com

## Backend & deployment

The API for all Yes Dhobi apps lives in [`backend/`](backend/README.md). To put everything live on AWS, follow the step-by-step guide in [`backend/DEPLOY.md`](backend/DEPLOY.md) (no AWS experience needed).
