import {
  ShoppingCartIcon,
  MapPinIcon,
  BriefcaseIcon,
  ChartBarIcon,
  AcademicCapIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';

export interface Starter {
  title: string;
  /** Category label shown above the description */
  category: string;
  description: string;
  /** Short first-person sentence shown on landing page so users know what to type */
  example: string;
  icon: ComponentType<{ className?: string }>;
  prompt: string;
}

export const STARTERS: Starter[] = [
  {
    title: 'Espresso Machine',
    category: 'Product research',
    icon: ShoppingCartIcon,
    description: 'Research and compare products before you buy',
    example: 'Help me pick a new espresso machine for a small kitchen',
    prompt:
      'Help me pick a new espresso machine for a small kitchen. Compare the top options with price, size, features, and reviews. Start simple — I can add more columns later.',
  },
  {
    title: 'Find a Dentist',
    category: 'Vendor selection',
    icon: MapPinIcon,
    description: 'Build a list of providers who meet your criteria',
    example: 'Find me a dentist in my neighborhood accepting new patients',
    prompt:
      'Find me a dentist in my neighborhood accepting new patients. Include ratings, insurance accepted, and availability. Start simple — I can add more columns later.',
  },
  {
    title: 'Job Search Tracker',
    category: 'Job search',
    icon: BriefcaseIcon,
    description: 'Stay organized and find your next role',
    example: 'Track my job search and suggest companies I should be targeting',
    prompt:
      'Track my job search and suggest companies I should be targeting. Include company, role, salary range, status, and why it\'s a fit. Start simple — I can add more columns later.',
  },
  {
    title: 'Competitive Analysis',
    category: 'Competitive analysis',
    icon: ChartBarIcon,
    description: 'Map out your competitive landscape with AI research',
    example: 'Analyze the top competitors in the project management software space',
    prompt:
      'Analyze the top competitors in the project management software space. Compare pricing, features, target market, and strengths/weaknesses. Start simple — I can add more columns later.',
  },
  {
    title: 'Term Paper Topics',
    category: 'Academic research',
    icon: AcademicCapIcon,
    description: 'Explore research topics and find sources',
    example: 'Give me 6 term paper topics for my Intro to Environmental Policy class',
    prompt:
      'Give me 6 term paper topics for my Intro to Environmental Policy class. Include the topic, a thesis angle, key sources, and difficulty level. Start simple — I can add more columns later.',
  },
  {
    title: 'Trip to Japan',
    category: 'Travel planning',
    icon: GlobeAltIcon,
    description: 'Plan trips with structured research',
    example: 'Plan a 10-day trip to Japan — where should I go? What should I see?',
    prompt:
      'Plan a 10-day trip to Japan — where should I go? What should I see? Build me a table of destinations with highlights, costs, and priorities. Start simple — I can add more columns later.',
  },
];
