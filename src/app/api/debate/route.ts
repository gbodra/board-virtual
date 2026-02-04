import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import { agents, Agent } from "@/lib/agents";

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

        if (!dilemma && history.length === 0) {
            return NextResponse.json({ error: "Context required" }, { status: 400 });
        }

        // Default to the first agent if none specified (though frontend should drive this)
        const agent = targetAgentId
            ? agents.find((a) => a.id === targetAgentId)
            : agents[0];

        if (!agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        const responseContent = await generateAgentResponse(agent, dilemma, history);

        return NextResponse.json({
            role: "assistant",
            name: agent.name,
            content: responseContent
        });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

async function generateAgentResponse(
    agent: Agent,
    dilemma: string,
    history: Message[]
): Promise<string> {
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
        {
            role: "user" as const,
            content: `Considerando o dilema e a discussão acima, qual a sua posição, ${agent.name}? Reaja como sua persona (${agent.role} da ${agent.company}) e traga um ângulo único.`
        },
    ];

    // Model selection
    const envModel = process.env.GROQ_MODEL;
    const defaultModels = ["openai/gpt-oss-20b", "llama3-70b-8192", "mixtral-8x7b-32768"];
    const models = envModel ? [envModel, ...defaultModels] : defaultModels;

    let responseText = "";

    for (const model of models) {
        try {
            console.log(`Generating for ${agent.name} with model: ${model}`);
            const completion = await groq.chat.completions.create({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages: messages as any,
                model: model,
                stream: false, // Explicitly synchronous
                temperature: 0.7,
                max_tokens: 400,
            });

            responseText = completion.choices[0]?.message?.content || "";
            if (responseText) break;
        } catch (e) {
            console.warn(`Model ${model} failed for ${agent.name}:`, e);
        }
    }

    if (!responseText) {
        throw new Error(`Failed to generate response for ${agent.name} with all models.`);
    }

    return responseText;
}
