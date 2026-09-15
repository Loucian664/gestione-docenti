import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "block h-11 w-full min-w-0 max-w-full appearance-none rounded-md border border-input bg-card bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-base leading-[2.75rem] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 sm:h-10 sm:text-sm sm:leading-10",
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" fill="none"><path d="M1 1.5 6 6.5 11 1.5" stroke="%236b6458" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}")`,
      }}
      {...props}
    />
  );
}

export { NativeSelect };
