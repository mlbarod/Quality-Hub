import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-10 w-full rounded-[8px] border border-[#d5e3ec] bg-white px-3 text-[13px] text-[#0f2233] outline-none transition placeholder:text-[#60798b] focus:border-[#6ec0f7] focus:ring-[3px] focus:ring-[rgba(7,136,223,.12)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
