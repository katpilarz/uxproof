'use client';

import { BarChart3, FileText } from 'lucide-react';

function WelcomeIllustration() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 260 260"
      width={349}
      height={349}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="wGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wSlide1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="100%" stopColor="#ddd6fe" />
        </linearGradient>
        <linearGradient id="wSlide2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#ede9fe" />
        </linearGradient>
        <linearGradient id="wSlide3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#faf5ff" />
          <stop offset="100%" stopColor="#f5f3ff" />
        </linearGradient>
        <linearGradient id="wIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
 
      {/* Soft background glow */}
      <circle cx="130" cy="130" r="110" fill="url(#wGlow)" />
 
      {/* Outer orbit ring — slowed from 40s → 90s */}
      <circle
        cx="130" cy="130" r="105"
        fill="none" stroke="#8b5cf6"
        strokeWidth="0.75" strokeOpacity="0.18"
        strokeDasharray="4 6"
      >
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 130 130" to="360 130 130"
          dur="90s" repeatCount="indefinite"
        />
      </circle>
 
      {/* Inner orbit ring — breathe slowed from 6s → 16s */}
      <circle
        cx="130" cy="130" r="78"
        fill="none" stroke="#a78bfa"
        strokeWidth="0.5" strokeOpacity="0.22"
      >
        <animate attributeName="r" values="78;82;78" dur="16s" repeatCount="indefinite" />
      </circle>
 
      {/* Slide stack — bottom layer: float slowed from 7s → 18s */}
      <rect x="62" y="82" width="106" height="82" rx="8"
        fill="url(#wSlide3)" stroke="#c4b5fd" strokeWidth="1" opacity="0.7"
      >
        <animate attributeName="y" values="82;79;82" dur="18s" repeatCount="indefinite" />
      </rect>
 
      {/* Slide stack — middle layer: float slowed from 5.5s → 14s */}
      <rect x="55" y="90" width="106" height="82" rx="8"
        fill="url(#wSlide2)" stroke="#a78bfa" strokeWidth="1" opacity="0.85"
      >
        <animate attributeName="y" values="90;87;90" dur="14s" repeatCount="indefinite" />
      </rect>
 
      {/* Slide stack — top layer: float slowed from 4.5s → 12s */}
      <rect x="48" y="98" width="106" height="82" rx="8"
        fill="url(#wSlide1)" stroke="#8b5cf6" strokeWidth="1.25"
      >
        <animate attributeName="y" values="98;95;98" dur="12s" repeatCount="indefinite" />
      </rect>
 
      {/* Slide content lines — all move with top slide at 12s */}
      <rect x="60" y="113" width="50" height="5" rx="2.5" fill="#8b5cf6" opacity="0.5">
        <animate attributeName="y" values="113;110;113" dur="12s" repeatCount="indefinite" />
      </rect>
      <rect x="60" y="123" width="80" height="3.5" rx="1.75" fill="#a78bfa" opacity="0.3">
        <animate attributeName="y" values="123;120;123" dur="12s" repeatCount="indefinite" />
      </rect>
      <rect x="60" y="131" width="65" height="3.5" rx="1.75" fill="#a78bfa" opacity="0.3">
        <animate attributeName="y" values="131;128;131" dur="12s" repeatCount="indefinite" />
      </rect>
 
      {/* Mini bar chart — static heights, only floats with slide */}
      <rect x="60" y="152" width="10" height="16" rx="2" fill="#8b5cf6" opacity="0.45">
        <animate attributeName="y" values="152;149;152" dur="12s" repeatCount="indefinite" />
      </rect>
      <rect x="74" y="145" width="10" height="23" rx="2" fill="#7c3aed" opacity="0.55">
        <animate attributeName="y" values="145;142;145" dur="12s" repeatCount="indefinite" />
      </rect>
      <rect x="88" y="149" width="10" height="19" rx="2" fill="#8b5cf6" opacity="0.45">
        <animate attributeName="y" values="149;146;149" dur="12s" repeatCount="indefinite" />
      </rect>
      <rect x="102" y="155" width="10" height="13" rx="2" fill="#a78bfa" opacity="0.4">
        <animate attributeName="y" values="155;152;155" dur="12s" repeatCount="indefinite" />
      </rect>
 
      {/* Slide count dots */}
      <circle cx="115" cy="173" r="3" fill="#8b5cf6" opacity="0.7">
        <animate attributeName="cy" values="173;170;173" dur="12s" repeatCount="indefinite" />
      </circle>
      <circle cx="125" cy="173" r="3" fill="#c4b5fd" opacity="0.4">
        <animate attributeName="cy" values="173;170;173" dur="12s" repeatCount="indefinite" />
      </circle>
      <circle cx="135" cy="173" r="3" fill="#c4b5fd" opacity="0.4">
        <animate attributeName="cy" values="173;170;173" dur="12s" repeatCount="indefinite" />
      </circle>
 
      {/* Orbiting dot — slowed from 8s → 22s, pulse slowed from 8s → 22s */}
      <circle cx="235" cy="130" r="5" fill="#8b5cf6" opacity="0.75">
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 130 130" to="360 130 130"
          dur="22s" repeatCount="indefinite"
        />
        <animate attributeName="r" values="5;6.5;5" dur="22s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.75;0.35;0.75" dur="22s" repeatCount="indefinite" />
      </circle>
 
      {/* Counter-orbiting dot — slowed from 12s → 32s, pulse from 5s → 14s */}
      <circle cx="25" cy="130" r="3.5" fill="#a78bfa" opacity="0.55">
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 130 130" to="-360 130 130"
          dur="32s" repeatCount="indefinite"
        />
        <animate attributeName="r" values="3.5;5;3.5" dur="14s" repeatCount="indefinite" />
      </circle>
 
      {/* Small trailing dot — slowed from 18s → 50s, pulse from 4s → 12s */}
      <circle cx="208" cy="52" r="3" fill="#7c3aed" opacity="0.45">
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 130 130" to="360 130 130"
          dur="50s" repeatCount="indefinite"
        />
        <animate attributeName="opacity" values="0.45;0.85;0.45" dur="12s" repeatCount="indefinite" />
      </circle>
 
      {/* Center icon badge — breathe slowed from 6s → 16s */}
      <circle cx="130" cy="130" r="22" fill="url(#wIcon)">
        <animate attributeName="r" values="22;24;22" dur="16s" repeatCount="indefinite" />
      </circle>
      <g transform="translate(120, 120)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2L11.5 7.5L17 9L11.5 10.5L10 16L8.5 10.5L3 9L8.5 7.5Z" fill="white" stroke="none" opacity="0.95" />
        <path d="M17 3L17.7 5.3L20 6L17.7 6.7L17 9L16.3 6.7L14 6L16.3 5.3Z" fill="white" stroke="none" opacity="0.7" />
        <path d="M4 13L4.5 14.5L6 15L4.5 15.5L4 17L3.5 15.5L2 15L3.5 14.5Z" fill="white" stroke="none" opacity="0.6" />
      </g>
 
      {/* Top-right mini slide — float slowed from 5s → 14s */}
      <rect x="186" y="62" width="32" height="24" rx="4"
        fill="#ede9fe" stroke="#a78bfa" strokeWidth="0.75" opacity="0.8"
      >
        <animate attributeName="y" values="62;58;62" dur="14s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;1;0.8" dur="14s" repeatCount="indefinite" />
      </rect>
      <rect x="190" y="67" width="14" height="2.5" rx="1.25" fill="#8b5cf6" opacity="0.5">
        <animate attributeName="y" values="67;63;67" dur="14s" repeatCount="indefinite" />
      </rect>
      <rect x="190" y="72" width="20" height="2" rx="1" fill="#c4b5fd" opacity="0.4">
        <animate attributeName="y" values="72;68;72" dur="14s" repeatCount="indefinite" />
      </rect>
      <rect x="190" y="77" width="16" height="2" rx="1" fill="#c4b5fd" opacity="0.35">
        <animate attributeName="y" values="77;73;77" dur="14s" repeatCount="indefinite" />
      </rect>
 
      {/* Bottom-left mini chart — float slowed from 6s → 16s */}
      <rect x="36" y="170" width="32" height="26" rx="4"
        fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="0.75" opacity="0.75"
      >
        <animate attributeName="y" values="170;174;170" dur="16s" repeatCount="indefinite" />
      </rect>
      <rect x="41" y="183" width="5" height="7" rx="1.5" fill="#8b5cf6" opacity="0.5">
        <animate attributeName="y" values="183;187;183" dur="16s" repeatCount="indefinite" />
      </rect>
      <rect x="49" y="179" width="5" height="11" rx="1.5" fill="#7c3aed" opacity="0.6">
        <animate attributeName="y" values="179;183;179" dur="16s" repeatCount="indefinite" />
      </rect>
      <rect x="57" y="181" width="5" height="9" rx="1.5" fill="#8b5cf6" opacity="0.45">
        <animate attributeName="y" values="181;185;181" dur="16s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}
 

export function WelcomeEmptyState() {
  const features = [
    {
      icon: BarChart3,
      title: 'Analyze KPIs',
      description: 'SUS, task success, NPS & more',
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      icon: FileText,
      title: 'Research Insights',
      description: 'Natural language Q&A',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="flex-1 flex items-start justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="flex justify-center mb-4">
          <WelcomeIllustration />
        </div>
        <h1 className="mb-3 display text-3xl">UX Evidence — Perfectly Presented</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
       Turn UX research data into client-ready PowerPoint presentations — validation made visible. </p>
       </div>
    </div>
  );
}