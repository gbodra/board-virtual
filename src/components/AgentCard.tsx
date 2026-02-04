"use client";

import { Agent } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";

interface AgentCardProps {
    agent: Agent;
    isActive: boolean;
    isThinking: boolean;
}

export function AgentCard({ agent, isActive, isThinking }: AgentCardProps) {
    return (
        <motion.div
            animate={{
                scale: isActive ? 1.05 : 1,
                borderColor: isActive ? "var(--primary)" : "transparent",
                boxShadow: isActive
                    ? "0 0 20px -5px var(--primary)"
                    : "0 0 0px 0px transparent",
            }}
            className={cn(
                "relative flex flex-col items-center bg-surface p-4 rounded-xl border border-white/5 transition-colors duration-300",
                isActive ? "bg-surface/80" : "opacity-70 hover:opacity-100"
            )}
        >
            <div
                className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center mb-3 text-white shadow-lg",
                    agent.color
                )}
            >
                <span className="text-xl font-bold">{agent.name[0]}</span>
            </div>

            <div className="text-center">
                <h3 className="font-bold text-white leading-tight">{agent.name}</h3>
                <p className="text-xs text-neutral-400 mt-1">
                    {agent.role}, {agent.company}
                </p>
            </div>

            {isActive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-2 right-2 flex items-center space-x-1"
                >
                    {isThinking ? (
                        <span className="text-xs text-primary animate-pulse">Thinking...</span>
                    ) : (
                        <Mic className="w-4 h-4 text-primary" />
                    )}
                </motion.div>
            )}
        </motion.div>
    );
}
