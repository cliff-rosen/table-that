import {
  HeartIcon,
  BriefcaseIcon,
  ChartBarIcon,
  MapPinIcon,
  WrenchScrewdriverIcon,
  TvIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';

export interface Starter {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  prompt: string;
}

export const STARTERS: Starter[] = [
  {
    title: 'Competitor Analysis',
    icon: ChartBarIcon,
    description: 'Compare competitors on pricing, features, and target audience',
    prompt:
      'Build a competitor analysis table. Columns: company name, website, pricing tier, free plan (yes/no), target audience, key differentiator, number of employees, and founded year. Add 5 example SaaS competitors.',
  },
  {
    title: 'Product Comparison',
    icon: TvIcon,
    description: 'Compare options side-by-side on specs, price, and ratings',
    prompt:
      'Create a product comparison table for buying a new TV. Columns: model name, brand, screen size, resolution, panel type (OLED/QLED/LED), price, smart TV platform, average review score, and notes. Add 5 popular models with realistic specs and prices.',
  },
  {
    title: 'Favorite Restaurants',
    icon: MapPinIcon,
    description: 'Track your favorite spots with cuisine, price, and ratings',
    prompt:
      'Create a favorite restaurants table. Columns: restaurant name, cuisine type, neighborhood, price range ($/$$/$$$/$$$$), my rating (1-5), want to try again (yes/no), best dish, and notes. Add 5 example restaurants in the Austin, TX area with realistic details. After creating, suggest ways I could expand the list — like adding more restaurants or new columns.',
  },
  {
    title: 'Job Application Tracker',
    icon: BriefcaseIcon,
    description: 'Track applications with company, role, status, and salary',
    prompt:
      'Create a job application tracker table. Columns: company name, role/title, date applied, status (applied/phone screen/interview/offer/rejected), salary range, location, remote (yes/no), and notes. Add a few example rows.',
  },
  {
    title: 'Wedding Venue Research',
    icon: HeartIcon,
    description: 'Compare local venues with capacity, price range, and reviews',
    prompt:
      'Create a table to research wedding venues. I want columns for venue name, location, max capacity, price range, indoor/outdoor, catering included (yes/no), average rating, and notes. Add 5 example rows with realistic fictional venues.',
  },
  {
    title: 'Home Renovation Tracker',
    icon: WrenchScrewdriverIcon,
    description: 'Track tasks, contractors, costs, and completion status',
    prompt:
      'Create a home renovation tracker table. Columns: room, task description, contractor name, estimated cost, actual cost, status (not started/in progress/complete), start date, and end date. Add example rows for a kitchen and bathroom renovation.',
  },
];
