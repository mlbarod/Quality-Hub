import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[13px] font-semibold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-[rgba(35,155,103,.22)] [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#239b67] text-white shadow-sm hover:bg-[#187a50]",
        outline: "border border-[#dfe3e1] bg-white text-[#30343a] hover:border-[#bfc8c3] hover:bg-[#f7f9f8]",
        secondary: "bg-[#eef2f0] text-[#30343a] hover:bg-[#e4e9e6]",
        ghost: "text-[#52585f] hover:bg-[#f1f4f2] hover:text-[#17191c]",
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
