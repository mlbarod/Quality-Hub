import * as AvatarPrimitive from "@radix-ui/react-avatar"
import * as React from "react"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn("relative flex size-9 shrink-0 overflow-hidden rounded-full", className)} {...props} />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback ref={ref} className={cn("flex size-full items-center justify-center bg-[#e2f2fd] text-[12px] font-bold text-[#0673bc]", className)} {...props} />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarFallback }
