import {
  HeartIcon,
  BriefcaseIcon,
  ChartBarIcon,
  GlobeAltIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
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
    title: 'Wedding Venue Research',
    icon: HeartIcon,
    description: 'Compare local venues with capacity, price range, and reviews',
    prompt:
      'Create a table to research wedding venues. I want columns for venue name, location, max capacity, price range, indoor/outdoor, catering included (yes/no), average rating, and notes. Add 5 example rows with realistic fictional venues.',
  },
  {
    title: 'Job Application Tracker',
    icon: BriefcaseIcon,
    description: 'Track applications with company, role, status, and salary',
    prompt:
      'Create a job application tracker table. Columns: company name, role/title, date applied, status (applied/phone screen/interview/offer/rejected), salary range, location, remote (yes/no), and notes. Add a few example rows.',
  },
  {
    title: 'Competitor Analysis',
    icon: ChartBarIcon,
    description: 'Compare competitors on pricing, features, and target audience',
    prompt:
      'Build a competitor analysis table. Columns: company name, website, pricing tier, free plan (yes/no), target audience, key differentiator, number of employees, and founded year. Add 5 example SaaS competitors.',
  },
  {
    title: 'Trip Planning',
    icon: GlobeAltIcon,
    description: 'Organize an itinerary with dates, cities, activities, and costs',
    prompt:
      'Create a trip planning table for a 7-day vacation. Columns: day number, date, city, activity/attraction, estimated cost, booked (yes/no), and notes. Fill in a sample itinerary for a trip through Italy.',
  },
  {
    title: 'Sales Prospect List',
    icon: UserGroupIcon,
    description: 'Build a prospect list with company info and outreach status',
    prompt:
      'Create a sales prospect list table. Columns: company name, contact person, email, industry, company size, outreach status (not contacted/emailed/call scheduled/negotiating/closed), deal value, and last contact date. Add 5 example prospects.',
  },
  {
    title: 'Home Renovation Tracker',
    icon: WrenchScrewdriverIcon,
    description: 'Track tasks, contractors, costs, and completion status',
    prompt:
      'Create a home renovation tracker table. Columns: room, task description, contractor name, estimated cost, actual cost, status (not started/in progress/complete), start date, and end date. Add example rows for a kitchen and bathroom renovation.',
  },
];
