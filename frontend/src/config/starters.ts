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
  icon: ComponentType<{ className?: string }>;
  prompt: string;
}

export const STARTERS: Starter[] = [
  {
    title: 'Competitor Analysis',
    icon: ChartBarIcon,
    description: 'Map out your competitive landscape with AI research',
    prompt:
      "I want to build a competitor analysis table. Interview me first — ask what industry or product category I'm in, what I'd want to track about competitors (pricing, features, audience, etc.), and how many competitors I'm looking at. Then propose a table structure based on my answers.",
  },
  {
    title: 'Product Comparison',
    icon: ShoppingCartIcon,
    description: 'Compare options side-by-side to make a purchase decision',
    prompt:
      "I need to compare products to make a buying decision. Before building anything, ask me what kind of product I'm shopping for, what factors matter most to me (price, specs, reviews, etc.), and my budget range. Then propose a table and help me populate it with real options.",
  },
  {
    title: 'Favorite Restaurants',
    icon: MapPinIcon,
    description: 'Build a personal restaurant tracker for your city',
    prompt:
      "I want to build a personal restaurant tracker. Ask me what city I'm in, what kind of dining info I'd want to remember (cuisine, price, ratings, favorite dishes, etc.), and whether I want to start with places I already know or discover new ones. Then set it up for me.",
  },
  {
    title: 'Job Application Tracker',
    icon: BriefcaseIcon,
    description: 'Stay organized during your job search',
    prompt:
      "I want to track my job applications. Ask me about my job search — what field, whether I care about tracking salary ranges, remote vs. on-site, interview stages, or other details. Then build me a tracker table that fits how I actually job hunt.",
  },
  {
    title: 'Wedding Planning',
    icon: HeartIcon,
    description: 'Research and compare venues, vendors, or guest lists',
    prompt:
      "I'm planning a wedding and need to organize my research. Ask me what I need to track — is it venues, vendors, guest list, budget, or something else? Ask about my priorities (budget, location, capacity, style) so you can propose the right table structure.",
  },
  {
    title: 'Home Renovation',
    icon: WrenchScrewdriverIcon,
    description: 'Track projects, contractors, costs, and timelines',
    prompt:
      "I need to track a home renovation project. Ask me what I'm renovating, whether I'm hiring contractors or DIY, and what I need to track (costs, timelines, materials, permits, etc.). Then build me a tracker that matches my actual project.",
  },
];
