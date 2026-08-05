import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full resize-y rounded-[8px] border border-[#d5e3ec] bg-white px-3 py-2.5 text-[13px] text-[#0f2233] outline-none transition placeholder:text-[#60798b] focus:border-[#6ec0f7] focus:ring-[3px] focus:ring-[rgba(7,136,223,.12)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export { Textarea }
