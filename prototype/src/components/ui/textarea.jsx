import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full resize-y rounded-[8px] border border-[#dfe3e1] bg-white px-3 py-2.5 text-[13px] text-[#17191c] outline-none transition placeholder:text-[#989da3] focus:border-[#7fbea2] focus:ring-[3px] focus:ring-[rgba(35,155,103,.12)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export { Textarea }
