'use client';

import React from 'react';

export function PowerPointIcon({
  className = '',
  size = 24,
  animate = true,
}: {
  className?: string;
  size?: number;
  animate?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 400"
      width={size}
      height={size}
      className={className}
      aria-label="PowerPoint presentation icon"
    >
      <defs>
        <radialGradient id="pGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pSlideBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.97" />
          <stop offset="100%" stopColor="#F4F0FF" stopOpacity="0.93" />
        </linearGradient>
        <linearGradient id="pSlideMid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#EDE9FE" stopOpacity="0.82" />
        </linearGradient>
        <linearGradient id="pSlideBack" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#DDD6FE" stopOpacity="0.68" />
        </linearGradient>
        <linearGradient id="pTitleBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="pAccentBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Outer orbit ring */}
      <circle cx="200" cy="200" r="175" fill="none"
        stroke="#FFFFFF" strokeWidth="2.5" strokeOpacity="0.55"
        strokeDasharray="5 8"
      >
        {animate && (
          <animateTransform attributeName="transform" type="rotate"
            from="0 200 200" to="360 200 200"
            dur="80s" repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Inner breathing ring */}
      <circle cx="200" cy="200" r="138" fill="none"
        stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.35"
      >
        {animate && (
          <animate attributeName="r" values="138;144;138" dur="14s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Background glow */}
      <circle cx="200" cy="200" r="160" fill="url(#pGlow)" />

      {/* ── SLIDE STACK ── */}

      {/* Back slide — tilted offset top-left */}
      <g>
        {animate && (
          <animateTransform attributeName="transform" type="translate"
            values="0,0; 0,-4; 0,0" dur="16s" repeatCount="indefinite"
          />
        )}
        <rect x="70" y="108" width="188" height="142" rx="10"
          fill="url(#pSlideBack)"
          stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"
        />
        {/* Back slide title stripe */}
        <rect x="70" y="108" width="188" height="22" rx="10"
          fill="rgba(167,139,250,0.25)"
        />
        <rect x="70" y="118" width="188" height="12" rx="0"
          fill="rgba(167,139,250,0.25)"
        />
        {/* Back slide content lines */}
        <rect x="86" y="142" width="90" height="5" rx="2.5" fill="rgba(139,92,246,0.2)" />
        <rect x="86" y="153" width="140" height="4" rx="2" fill="rgba(167,139,250,0.15)" />
        <rect x="86" y="163" width="110" height="4" rx="2" fill="rgba(167,139,250,0.15)" />
      </g>

      {/* Middle slide — slight offset */}
      <g>
        {animate && (
          <animateTransform attributeName="transform" type="translate"
            values="0,0; 0,-3; 0,0" dur="13s" repeatCount="indefinite"
          />
        )}
        <rect x="90" y="128" width="188" height="142" rx="10"
          fill="url(#pSlideMid)"
          stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"
        />
        {/* Mid slide title stripe */}
        <rect x="90" y="128" width="188" height="22" rx="10"
          fill="rgba(139,92,246,0.28)"
        />
        <rect x="90" y="140" width="188" height="10" rx="0"
          fill="rgba(139,92,246,0.28)"
        />
        {/* Mid slide mini bar chart */}
        <rect x="106" y="192" width="14" height="30" rx="3" fill="rgba(139,92,246,0.3)" />
        <rect x="126" y="178" width="14" height="44" rx="3" fill="rgba(109,40,217,0.35)" />
        <rect x="146" y="185" width="14" height="37" rx="3" fill="rgba(139,92,246,0.28)" />
        <rect x="166" y="198" width="14" height="24" rx="3" fill="rgba(167,139,250,0.25)" />
        {/* baseline */}
        <rect x="106" y="222" width="88" height="1.5" rx="0.75" fill="rgba(139,92,246,0.2)" />
      </g>

      {/* Front slide — the main one */}
      <g>
        {animate && (
          <animateTransform attributeName="transform" type="translate"
            values="0,0; 0,-3; 0,0" dur="11s" repeatCount="indefinite"
          />
        )}
        <rect x="110" y="148" width="188" height="142" rx="10"
          fill="url(#pSlideBg)"
          stroke="rgba(255,255,255,0.85)" strokeWidth="2"
        />

        {/* Title bar strip */}
        <rect x="110" y="148" width="188" height="26" rx="10"
          fill="url(#pTitleBar)"
        />
        <rect x="110" y="160" width="188" height="14" rx="0"
          fill="url(#pTitleBar)"
        />
        {/* Title text lines */}
        <rect x="124" y="154" width="70" height="5" rx="2.5" fill="rgba(255,255,255,0.85)" />
        <rect x="124" y="162" width="48" height="3.5" rx="1.75" fill="rgba(255,255,255,0.55)" />

        {/* Accent left border */}
        <rect x="110" y="174" width="4" height="116" rx="2"
          fill="url(#pAccentBar)"
        />

        {/* Content area — heading */}
        <rect x="126" y="184" width="88" height="6" rx="3" fill="rgba(109,40,217,0.35)" />

        {/* Content area — body lines */}
        <rect x="126" y="198" width="155" height="4" rx="2" fill="rgba(139,92,246,0.2)" />
        <rect x="126" y="207" width="130" height="4" rx="2" fill="rgba(139,92,246,0.2)" />
        <rect x="126" y="216" width="145" height="4" rx="2" fill="rgba(139,92,246,0.2)" />

        {/* Chart section */}
        {/* Chart area bg */}
        <rect x="126" y="228" width="155" height="48" rx="4"
          fill="rgba(139,92,246,0.05)"
          stroke="rgba(139,92,246,0.1)" strokeWidth="0.75"
        />
        {/* Bars */}
        <rect x="136" y="244" width="16" height="24" rx="2.5" fill="rgba(139,92,246,0.4)" />
        <rect x="158" y="236" width="16" height="32" rx="2.5" fill="rgba(109,40,217,0.5)" />
        <rect x="180" y="240" width="16" height="28" rx="2.5" fill="rgba(139,92,246,0.4)" />
        <rect x="202" y="248" width="16" height="20" rx="2.5" fill="rgba(167,139,250,0.35)" />
        <rect x="224" y="242" width="16" height="26" rx="2.5" fill="rgba(139,92,246,0.42)" />
        {/* Baseline */}
        <rect x="130" y="268" width="147" height="1.5" rx="0.75" fill="rgba(139,92,246,0.18)" />

        {/* Slide number dots */}
        <circle cx="179" cy="282" r="3.5" fill="rgba(139,92,246,0.65)" />
        <circle cx="191" cy="282" r="3.5" fill="rgba(167,139,250,0.3)" />
        <circle cx="203" cy="282" r="3.5" fill="rgba(167,139,250,0.3)" />
        <circle cx="215" cy="282" r="3.5" fill="rgba(167,139,250,0.3)" />
      </g>

      {/* Orbiting dot — main */}
      <circle cx="375" cy="200" r="10" fill="white" opacity="1">
        {animate && (
          <>
            <animateTransform attributeName="transform" type="rotate"
              from="0 200 200" to="360 200 200"
              dur="20s" repeatCount="indefinite"
            />
            <animate attributeName="r" values="10;13;10" dur="20s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.7;1" dur="20s" repeatCount="indefinite" />
          </>
        )}
      </circle>

      {/* Counter-orbiting dot */}
      <circle cx="25" cy="200" r="7" fill="white" opacity="0.9">
        {animate && (
          <>
            <animateTransform attributeName="transform" type="rotate"
              from="0 200 200" to="-360 200 200"
              dur="30s" repeatCount="indefinite"
            />
            <animate attributeName="r" values="7;9;7" dur="12s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.6;0.9" dur="12s" repeatCount="indefinite" />
          </>
        )}
      </circle>

      {/* Small trailing dot */}
      <circle cx="340" cy="65" r="6" fill="white" opacity="0.85">
        {animate && (
          <>
            <animateTransform attributeName="transform" type="rotate"
              from="0 200 200" to="360 200 200"
              dur="48s" repeatCount="indefinite"
            />
            <animate attributeName="opacity" values="0.85;1;0.85" dur="10s" repeatCount="indefinite" />
          </>
        )}
      </circle>
    </svg>
  );
}

export default PowerPointIcon;