import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-10 w-full rounded-[8px] border border-[#dfe3e1] bg-white px-3 text-[13px] text-[#17191c] outline-none transition placeholder:text-[#989da3] focus:border-[#7fbea2] focus:ring-[3px] focus:ring-[rgba(35,155,103,.12)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
