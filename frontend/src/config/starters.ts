import {
  HeartIcon,
  BriefcaseIcon,
  ChartBarIcon,
  MapPinIcon,
  WrenchScrewdriverIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';

export interface Starter {
  title: string;
  description: string;
  /** Short first-person sentence shown on landing page so users know what to type */
  example: string;
  icon: ComponentType<{ className?: string }>;
  prompt: string;
}

export const STARTERS: Starter[] = [
  {
    title: 'Find a Dentist',
    icon: MapPinIcon,
    description: 'Build a list of top-rated providers who take your insurance',
    example: "Build me a list of top dentists in my area with ratings, insurance accepted, and availability",
    prompt:
      "Build me a list of top dentists in my area with ratings, insurance accepted, and availability. Start simple — I can add more columns later.",
  },
  {
    title: 'Compare Laptops',
    icon: ShoppingCartIcon,
    description: 'Research and compare options before you buy',
    example: "I'm buying a laptop under $1500 — compare the top options with specs, reviews, and prices",
    prompt:
      "I'm buying a laptop under $1500 — compare the top options with specs, reviews, and prices. Start simple — I can add more columns later.",
  },
  {
    title: 'Track Job Applications',
    icon: BriefcaseIcon,
    description: 'Stay organized during your job search',
    example: "Track my job applications — company, role, salary, status, and interview dates",
    prompt:
      "Track my job applications — company, role, salary, status, and interview dates. Start simple — I can add more columns later.",
  },
  {
    title: 'Research Competitors',
    icon: ChartBarIcon,
    description: 'Map out your competitive landscape with AI research',
    example: "Research my top 10 competitors and compare their pricing, features, and target market",
    prompt:
      "Research my top 10 competitors and compare their pricing, features, and target market. Start simple — I can add more columns later.",
  },
  {
    title: 'Plan a Wedding',
    icon: HeartIcon,
    description: 'Research and compare venues, vendors, or guest lists',
    example: "I'm planning a wedding — build me a table to compare venues with pricing, capacity, and availability",
    prompt:
      "I'm planning a wedding — build me a table to compare venues with pricing, capacity, and availability. Start simple — I can add more columns later.",
  },
  {
    title: 'Home Renovation',
    icon: WrenchScrewdriverIcon,
    description: 'Track projects, contractors, costs, and timelines',
    example: "I'm renovating my kitchen — build a table of contractors with quotes, ratings, and availability",
    prompt:
      "I'm renovating my kitchen — build a table of contractors with quotes, ratings, and availability. Start simple — I can add more columns later.",
  },
];
