import React from "react"

interface NexFinLogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

export function NexFinLogo({ className = "", size = "md" }: NexFinLogoProps) {
  const sizeClasses = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
    xl: "h-20",
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        className={sizeClasses[size]}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle */}
        <circle cx="24" cy="24" r="22" className="fill-emerald-500" />
        
        {/* Growth arrow/trend line */}
        <path
          d="M12 32 L18 26 L24 28 L30 20 L36 16"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-lg"
        />
        
        {/* Arrow head */}
        <path
          d="M32 16 L36 16 L36 20"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-lg"
        />
        
        {/* Dollar sign accent */}
        <circle cx="24" cy="28" r="2.5" className="fill-white" />
      </svg>
      
      <div className="flex flex-col">
        <span className="font-bold text-2xl tracking-tight leading-none">
          <span className="text-emerald-600">Nex</span>
          <span className="text-slate-900 dark:text-slate-100">Fin</span>
        </span>
        <span className="text-xs text-emerald-600 font-medium tracking-wide">
          APP
        </span>
      </div>
    </div>
  )
}
