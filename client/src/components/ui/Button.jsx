import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

const Button = ({ children, className, variant = 'primary', isLoading, ...props }) => {
    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30",
        secondary: "bg-white/10 hover:bg-white/20 text-white border border-white/10",
        danger: "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "px-6 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2",
                variants[variant],
                isLoading && "opacity-70 cursor-not-allowed",
                className
            )}
            disabled={isLoading}
            {...props}
        >
            {isLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {children}
        </motion.button>
    );
};

export default Button;
