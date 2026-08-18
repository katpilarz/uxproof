import {
  FileText,
  Download,
  Eye,
  Calendar,
  BarChart,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Presentation } from '@/types';
import PowerPointIcon from './ui/powerpoint-icon';

type DashboardProps = {
  onChatClick: () => void;
};

export function Dashboard({ onChatClick }: DashboardProps) {
  const presentations: Presentation[] = [
    {
      id: '1',
      title: 'Aurelo Q1 2026 UX Report',
      quarter: 'Q3 2024',
      generatedDate: new Date('2024-10-15'),
      slides: 24,
      thumbnail: 'gradient-violet',
      status: 'completed',
    },
    {
      id: '2',
      title: 'Q3 vs Q4 2025 Comparison',
      quarter: 'Q3 2024',
      generatedDate: new Date('2024-10-10'),
      slides: 18,
      thumbnail: 'gradient-sunset',
      status: 'completed',
    },
    {
      id: '3',
      title: 'Checkout Usability Deep Dive',
      quarter: 'Q3 2024',
      generatedDate: new Date('2024-10-08'),
      slides: 32,
      thumbnail: 'gradient-teal',
      status: 'completed',
    },
    {
      id: '4',
      title: 'Accessibility Audit Overview',
      quarter: 'Q2 2024',
      generatedDate: new Date('2024-07-20'),
      slides: 15,
      thumbnail: 'gradient-mint',
      status: 'completed',
    },
    {
      id: '5',
      title: 'Full Year 2025 Research Review',
      quarter: 'Q3 2024',
      generatedDate: new Date('2024-09-25'),
      slides: 28,
      thumbnail: 'gradient-pink',
      status: 'completed',
    },
  ];

  const gradientMap: Record<string, string> = {
    'gradient-violet': 'from-purple-600 to-blue-500',
    'gradient-blue': 'from-sky-300 to-blue-600',
    'gradient-indigo': 'from-fuchsia-400 to-violet-600',
    'gradient-slate': 'from-indigo-400 to-cyan-500',
    'gradient-pink': 'from-pink-300 to-purple-600',
    'gradient-teal': 'from-cyan-400 to-indigo-600',
    'gradient-rose': 'from-rose-400 to-fuchsia-600',
    'gradient-ice': 'from-slate-300 to-sky-500',
    'gradient-marine': 'from-blue-400 to-cyan-100',
    'gradient-sunset': 'from-orange-400 to-pink-400',
    'gradient-mint': 'from-blue-400 to-emerald-400',
    'gradient-sky': 'from-sky-200 to-indigo-200',
  };

  // Total slides across all presentations
  const totalSlides = presentations.reduce((sum, p) => sum + p.slides, 0);

  const stats = [
    {
      label: 'Total Presentations',
      value: '12',
      icon: FileText,
      // Violet accent — primary action metric
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'This Quarter',
      value: '4',
      icon: Calendar,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Reports Analyzed',
      value: '28',
      icon: BarChart,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Slides Generated',
      value: String(totalSlides),
      icon: Layers,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">

        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Generated Presentations</h1>
          <p className="text-muted-foreground">
            AI-generated UX research presentations from your quarterly study data
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="p-5 border border-border bg-white dark:bg-card shadow-sm shadow-violet-100/50 dark:shadow-none"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-3xl font-semibold">{stat.value}</p>
                </div>
                <div className={`size-10 rounded-lg flex items-center justify-center ${stat.iconBg} ${stat.iconColor}`}>
                  <stat.icon className="size-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Presentations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {presentations.map((presentation) => (
            <Card
              key={presentation.id}
              className="group hover:shadow-lg transition-all duration-200 overflow-hidden border border-border bg-card"
            >
              <div
                className={`h-40 bg-gradient-to-br ${gradientMap[presentation.thumbnail]} relative flex items-center justify-center`}
              >
                <PowerPointIcon
                  className="opacity-100 my-auto mr-10 group-hover:opacity-30 transition-opacity duration-300"
                  size={129}
                  animate={true}
                />

                {/* Slide count pill */}
                <div className="absolute top-4 right-4 z-20 transition-all duration-300 opacity-100 group-hover:opacity-30">
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1 text-white">
                    <span className="text-sm font-medium">{presentation.slides} Slides</span>
                  </div>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary">
                      <Eye className="size-4 mr-1" />
                      Preview
                    </Button>
                    <Button size="sm" variant="secondary">
                      <Download className="size-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>

              <div className="px-5 pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium mb-1 line-clamp-2">{presentation.title}</h3>
                    <p className="text-sm text-muted-foreground">{presentation.quarter}</p>
                  </div>
                  <Badge
                    variant={presentation.status === 'completed' ? 'default' : 'secondary'}
                    className="ml-2"
                  >
                    {presentation.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    <span>
                      {presentation.generatedDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs hover:bg-transparent gap-1">
                    View Details
                    <ArrowUpRight className="size-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {/* Add New — high-contrast card */}
          <Card
            className="overflow-hidden border-0 cursor-pointer group transition-all duration-200 hover:scale-[1.01] bg-[#0f0f1c] dark:bg-white"
            onClick={() => onChatClick?.()}
          >
            <div className="h-full flex flex-col items-center justify-center text-center min-h-[280px] relative overflow-hidden">

              {/* Decorative circles — clipped by overflow-hidden */}
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-500/15 dark:bg-violet-400/12 pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-violet-600/10 dark:bg-violet-500/8 pointer-events-none" />
              <div className="absolute top-1/2 -translate-y-1/2 -right-6 w-20 h-20 rounded-full bg-white/4 dark:bg-black/4 pointer-events-none" />

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center px-8">

                {/* Stacked slide icon */}
                <div className="relative mb-6 w-10 h-8">
                  <div className="absolute -top-1 -left-1 w-10 h-8 rounded-md bg-white/15 dark:bg-black/10 rotate-[-8deg]" />
                  <div className="absolute -top-0.5 left-0.5 w-10 h-8 rounded-md bg-white/20 dark:bg-black/14 rotate-[-3deg]" />
                  <div className="relative w-10 h-8 rounded-md bg-white/90 dark:bg-[#0f0f1c]/90 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1.5V12.5M1.5 7H12.5" stroke="#0f0f1c" strokeWidth="1.5" strokeLinecap="round" className="dark:stroke-white" />
                    </svg>
                  </div>
                </div>

                <h3 className="font-medium mb-2 text-white dark:text-[#0f0f1c]">
                  Generate New Presentation
                </h3>
                <p className="text-sm text-white/50 dark:text-[#0f0f1c]/50 mb-6 max-w-[190px]">
                  Use the AI chat to create a new research presentation
                </p>

                {/* Pill CTA */}
                <div className="px-5 py-2 rounded-full text-xs font-medium tracking-wide
                  bg-white/12 group-hover:bg-white/20
                  dark:bg-black/8 dark:group-hover:bg-black/14
                  text-white dark:text-[#0f0f1c]
                  ring-1 ring-white/20 dark:ring-black/10
                  transition-colors duration-200"
                >
                  Open Chat
                </div>

              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}