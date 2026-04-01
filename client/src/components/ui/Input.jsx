import React from 'react';
import { cn } from '../../utils/cn';

const Input = React.forwardRef(({ label, className, error, ...props }, ref) => {
    return (
        <div className="flex flex-col gap-1.5 w-full text-left">
            {label && <label className="text-sm text-gray-300 font-medium pl-1">{label}</label>}
            <input
                ref={ref}
                className={cn(
                    "w-full px-4 py-2.5 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all",
                    error && "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20",
                    className
                )}
                {...props}
            />
            {error && <span className="text-xs text-red-400 pl-1">{error}</span>}
        </div>
    );
});

export default Input;
