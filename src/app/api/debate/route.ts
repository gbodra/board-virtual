import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import { agents, Agent } from "@/lib/agents";

// Allow streaming
// export const runtime = "edge"; // Groq SDK preference

interface Message {
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
}

interface RequestBody {
    dilemma: string;
    history?: Message[];
    targetAgentId?: string;
}

export async function POST(req: NextRequest) {
    try {
        const { dilemma, history = [], targetAgentId } = (await req.json()) as RequestBody;

        if (!dilemma) {
            return NextResponse.json({ error: "Dilemma is required" }, { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    if (targetAgentId) {
                        const agent = agents.find((a) => a.id === targetAgentId);
                        if (!agent) throw new Error("Agent not found");

                        controller.enqueue(encoder.encode(`__START_AGENT__:${agent.id}\n`));
                        await generateAgentResponse(agent, dilemma, history, controller);
                    } else {
                        const sessionMessages: Message[] = [...history];

                        for (const agent of agents) {
                            controller.enqueue(encoder.encode(`__START_AGENT__:${agent.id}\n`));

                            try {
                                const responseContent = await generateAgentResponse(
                                    agent,
                                    dilemma,
                                    sessionMessages,
                                    controller
                                );

                                if (responseContent) {
                                    sessionMessages.push({
                                        role: "assistant",
                                        name: agent.name,
                                        content: responseContent,
                                    });
                                }
                            } catch (e) {
                                console.error(`Error generating for ${agent.name}:`, e);
                                const errorMsg = `[System Error: Failed to generate response for ${agent.name}]`;
                                controller.enqueue(encoder.encode(errorMsg));
                            }
                        }
                    }
                    controller.close();
                } catch (err) {
                    console.error("Streaming error:", err);
                    controller.error(err);
                }
            },
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

async function generateAgentResponse(
    agent: Agent,
    dilemma: string,
    history: Message[],
    controller: ReadableStreamDefaultController
): Promise<string> {
    const encoder = new TextEncoder();

    const systemMessage = {
        role: "system" as const,
        content: `${agent.systemPrompt}
    
    Você está participando de um conselho virtual debatendo o seguinte dilema: "${dilemma}".
    
    IMPORTANTE:
    - Se outros agentes já falaram, referencie os pontos deles. Concorde, discorde ou ofereça um ângulo diferente.
    - Seja conciso (máximo 3-4 frases).
    - Permaneça estritamente no personagem.
    - Responda SEMPRE em Português do Brasil.`,
    };

    const formattedHistory = history.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : msg.role === "system" ? "system" : "user",
        content: msg.role === "assistant" && msg.name ? `[${msg.name}]: ${msg.content}` : msg.content,
    }));

    const messages = [
        systemMessage,
        ...formattedHistory,
        { role: "user" as const, content: `The dilemma is: ${dilemma}. What is your view?` },
    ];

    let accumulatedContent = "";

    // Model Fallback Logic
    const models = ["openai/gpt-oss-20b", "llama3-70b-8192", "mixtral-8x7b-32768"];
    let completionStream = null;

    for (const model of models) {
        try {
            console.log(`Trying model: ${model}`);
            completionStream = await groq.chat.completions.create({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages: messages as any,
                model: model,
                stream: true,
                temperature: 0.7,
                max_tokens: 400,
            });
            break; // Success
        } catch (e) {
            console.warn(`Model ${model} failed, trying next. Error:`, e);
        }
    }

    if (!completionStream) {
        const err = "All models failed to generate response.";
        console.error(err);
        throw new Error(err);
    }

    for await (const chunk of completionStream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
            accumulatedContent += content;
            controller.enqueue(encoder.encode(content));
        }
    }

    return accumulatedContent;
}
