"use client";

import { useState, useRef, useEffect } from "react";
import { agents } from "@/lib/agents";
import { AgentCard } from "@/components/AgentCard";
import { motion } from "framer-motion";
import { Send, RefreshCw, MessageSquare, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Message {
  role: "user" | "assistant";
  name?: string;
  content: string;
}

export default function Home() {
  const [dilemma, setDilemma] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const [isDebating, setIsDebating] = useState(false);
  const [currentStreamBuffer, setCurrentStreamBuffer] = useState(""); // Holds the entire raw stream of the current turn
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Derived state from stream buffer
  // Parse buffer dynamically to render live results
  const parseStream = (buffer: string): Message[] => {
    const messages: Message[] = [];
    if (!buffer) return messages;

    // Regex to find all agent markers and their content
    // Splits by __START_AGENT__:ID
    // result[0] is text before first marker (usually empty or garbage newline)
    // result[1] is ID, result[2] is text, result[3] is ID...
    // We use a simpler split strategy or exact match loop

    const parts = buffer.split(/__START_AGENT__:([a-zA-Z0-9_-]+)/g);

    // parts[0] is usually "\n" or empty if stream starts immediately with marker

    for (let i = 1; i < parts.length; i += 2) {
      const agentId = parts[i]?.trim();
      const content = parts[i + 1]; // content coming after this agent

      if (agentId && agents.find(a => a.id === agentId)) {
        const agentName = agents.find(a => a.id === agentId)?.name;
        // Clean up content: usually starts with \n
        const cleanContent = content ? content.replace(/^\n/, "") : "";

        if (cleanContent || i === parts.length - 2) {
          // allow empty content if it's the very last one (active thinking)
          messages.push({
            role: "assistant",
            name: agentName,
            content: cleanContent
          });
        }
      }
    }
    return messages;
  };

  const currentTurnMessages = parseStream(currentStreamBuffer);

  // Identify active agent from the last parsed message in the stream
  const activeAgentId = isDebating && currentTurnMessages.length > 0
    ? agents.find(a => a.name === currentTurnMessages[currentTurnMessages.length - 1].name)?.id
    : null;

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, currentTurnMessages.length, currentStreamBuffer.length]);

  const resetDebate = () => {
    setDilemma("");
    setHistory([]);
    setIsDebating(false);
    setCurrentStreamBuffer("");
    setSelectedTargetId(null);
  };

  const startDebate = async () => {
    const targetId = selectedTargetId;

    if ((!dilemma.trim() && history.length === 0) || isDebating) return;

    setIsDebating(true);
    setCurrentStreamBuffer(""); // Reset stream buffer for new turn

    let currentHistory = [...history];

    if (dilemma.trim()) {
      const userMsg: Message = { role: "user", content: dilemma, name: "User" };
      currentHistory = [...currentHistory, userMsg];
      setHistory(currentHistory);
      setDilemma("");
    }

    const contextDilemma = (history.length > 0 && history[0].role === 'user') ? history[0].content : dilemma;

    try {
      const response = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dilemma: contextDilemma,
          history: currentHistory,
          targetAgentId: targetId
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let accumulated = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setCurrentStreamBuffer(accumulated);
      }

      // Stream finished.
      // Commit the parsed messages to permanent history and clear stream buffer.
      const finalMessages = parseStream(accumulated);
      setHistory(prev => [...prev, ...finalMessages]);
      setCurrentStreamBuffer("");

    } catch (error) {
      console.error("Debate error:", error);
    } finally {
      setIsDebating(false);
      setSelectedTargetId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-background to-background">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col h-screen">

        {/* Header */}
        <header className="flex-none mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/50 text-primary">
              <span className="font-bold text-xl">IW</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Board Virtual</h1>
              <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5">
                by
                <Image
                  src="/invisible-work.png"
                  alt="Invisible Work"
                  width={130}
                  height={20}
                  className="inline-block"
                />
              </p>
            </div>
          </div>

          <button
            onClick={resetDebate}
            disabled={isDebating}
            className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-neutral-300 disabled:opacity-50"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo Debate</span>
          </button>
        </header>

        {/* Boardroom */}
        <div className="flex-none grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isActive={activeAgentId === agent.id}
              isThinking={activeAgentId === agent.id && (!currentTurnMessages.find(m => m.name === agent.name)?.content)}
            />
          ))}
        </div>

        {/* Interaction Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative">

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {history.length === 0 && !isDebating && (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
                <MessageSquare className="w-12 h-12 opacity-20" />
                <p>Descreva seu dilema para iniciar a reunião.</p>
              </div>
            )}

            {/* Combined View: History + Live Stream */}
            {[...history, ...currentTurnMessages].map((msg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} // simple key, theoretically should use unique id
                className={cn(
                  "flex flex-col max-w-3xl",
                  msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-medium text-neutral-400">
                    {msg.role === "user" ? "Você" : msg.name}
                  </span>
                </div>
                <div
                  className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-white rounded-tr-none"
                      : "bg-surface border border-white/10 rounded-tl-none"
                  )}
                >
                  {msg.content}
                  {/* Blinking cursor for the very last message if it is assistant and debating */}
                  {isDebating && i === (history.length + currentTurnMessages.length - 1) && msg.role === "assistant" && (
                    <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-primary animate-pulse" />
                  )}
                </div>
              </motion.div>
            ))}

            {/* If debating but no messages parsed yet (waiting for first chunk) */}
            {isDebating && currentTurnMessages.length === 0 && (
              <div className="flex flex-col max-w-3xl mr-auto items-start animate-pulse opacity-50">
                <span className="text-xs text-neutral-500">O conselho está pensando...</span>
              </div>
            )}
          </div>

          <div className="p-4 bg-background/50 border-t border-white/5 backdrop-blur-sm">
            {history.length > 0 && !isDebating && (
              <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                <span className="text-xs text-neutral-500 whitespace-nowrap mr-1">Responder para:</span>

                <button
                  onClick={() => setSelectedTargetId(null)}
                  className={cn(
                    "px-3 py-1.5 text-xs border rounded-full transition-colors whitespace-nowrap",
                    selectedTargetId === null
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"
                  )}
                >
                  Todos
                </button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedTargetId(agent.id)}
                    className={cn(
                      "px-3 py-1.5 text-xs border rounded-full transition-all whitespace-nowrap flex items-center gap-1.5",
                      selectedTargetId === agent.id
                        ? `bg-surface border-${agent.color.replace('bg-', '')} text-white ring-1 ring-${agent.color.replace('bg-', '')}`
                        : "bg-surface border-white/10 text-neutral-400 hover:bg-white/5"
                    )}
                    style={{
                      borderColor: selectedTargetId === agent.id ? undefined : 'rgba(255,255,255,0.1)'
                    }}
                  >
                    <span className={cn("w-2 h-2 rounded-full", agent.color)} />
                    {agent.name}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                startDebate();
              }}
              className="relative flex items-center"
            >
              <textarea
                disabled={isDebating}
                value={dilemma}
                onChange={(e) => setDilemma(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    startDebate();
                  }
                }}
                placeholder={
                  history.length === 0
                    ? "Descreva seu dilema de negócio aqui..."
                    : selectedTargetId
                      ? `Perguntar para ${agents.find(a => a.id === selectedTargetId)?.name}...`
                      : "Responda ou desafie o conselho..."
                }
                className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-4 pr-16 focus:outline-none focus:ring-2 focus:ring-primary/50 text-white placeholder:text-neutral-500 transition-all resize-none h-[60px] max-h-[120px]"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                <button
                  disabled={(!dilemma.trim() && history.length === 0) || isDebating}
                  type="submit"
                  className="p-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-orange-900/20"
                >
                  {isDebating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
