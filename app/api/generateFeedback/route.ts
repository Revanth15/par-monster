// Next.js App Router (Edge-compatible)
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://ark.ap-southeast.volces.com/api/v3',
});

export async function POST(req: NextRequest) {
  const { userMessage } = await req.json();

  const systemMessage = `You are an AI assistant that helps officers review their conducts using PAR (Post Action Review) entries.
  
  PAR pointers are used to:
  - Analyse what went wrong during a conduct
  - Reflect on why it happened
  - Recommend how to prevent the same mistakes in future
  
  Your task is to analyse the provided PAR pointers, identify key issues, categorise them (e.g., Conducting Body(those that organised the conduct), Participants(those that participated in the conduct), Commanders(commanders, i.e auxilary commanders that helped out)), and give advice on how to improve future conducts and prevent making these mistake for future conducts.
  Make it as concise as possible, but also provide enough detail to be useful. Do not need to repeat the pointers back to the user, just focus on the analysis and recommendations.`;
    console.log(userMessage)
  const completion = await openai.chat.completions.create({
    model: 'deepseek-v3',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
  });
  
  return NextResponse.json({ result: completion.choices[0].message?.content ?? '' });
}
