import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[13px] font-semibold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-[rgba(7,136,223,.22)] [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#0788df] text-white shadow-sm hover:bg-[#0673bc]",
        outline: "border border-[#d5e3ec] bg-white text-[#263b4a] hover:border-[#bfc8c3] hover:bg-[#f7f9f8]",
        secondary: "bg-[#eef6fc] text-[#263b4a] hover:bg-[#e0ebf2]",
        ghost: "text-[#52585f] hover:bg-[#edf3f7] hover:text-[#0f2233]",
        danger: "bg-[#b64c45] text-white hover:bg-[#963d37]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[7px] px-3 text-[12px]",
        lg: "h-11 px-5 text-[14px]",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
