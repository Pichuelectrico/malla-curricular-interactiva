import React from 'react';

export default function USFQIcon() {
  return (
    <div className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-blue-200">
      <svg
        width="40"
        height="40"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-blue-600"
      >
        {/* USFQ Logo placeholder - simplified university emblem */}
        <circle cx="50" cy="50" r="45" fill="currentColor" stroke="#1e40af" strokeWidth="2"/>
        <circle cx="50" cy="50" r="35" fill="white"/>
        
        {/* Book/Knowledge symbol */}
        <rect x="35" y="35" width="30" height="20" fill="currentColor" rx="2"/>
        <rect x="37" y="37" width="26" height="16" fill="white" rx="1"/>
        
        {/* Lines representing text */}
        <line x1="40" y1="42" x2="60" y2="42" stroke="currentColor" strokeWidth="1"/>
        <line x1="40" y1="46" x2="55" y2="46" stroke="currentColor" strokeWidth="1"/>
        <line x1="40" y1="50" x2="58" y2="50" stroke="currentColor" strokeWidth="1"/>
        
        {/* Torch/flame symbol */}
        <ellipse cx="50" cy="65" rx="8" ry="12" fill="#f59e0b"/>
        <ellipse cx="50" cy="63" rx="5" ry="8" fill="#fbbf24"/>
        <rect x="48" y="75" width="4" height="8" fill="currentColor"/>
        
        {/* Stars for excellence */}
        <polygon points="25,25 27,30 32,30 28,33 30,38 25,35 20,38 22,33 18,30 23,30" fill="#fbbf24"/>
        <polygon points="75,25 77,30 82,30 78,33 80,38 75,35 70,38 72,33 68,30 73,30" fill="#fbbf24"/>
      </svg>
    </div>
  );
}
