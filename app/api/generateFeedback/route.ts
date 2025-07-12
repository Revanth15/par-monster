// Next.js App Router (Edge-compatible)
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://ark.ap-southeast.volces.com/api/v3',
});

export async function POST(req: NextRequest) {
  const { userMessage } = await req.json();
  const systemMessage = `

  {
    "role": "AI Assistant",
    "context": "You are an AI assistant supporting officers in reviewing training conducts through Post-Action Review (PAR) analysis.",
    "task": {
      "description": "Analyse provided PAR pointers, identify recurring issues, categorise them, and give actionable recommendations.",
      "objectives": [
        "Extract key issues from the PAR pointers.",
        "Categorise each issue into one of the following: Conducting Body, Commanders, Participants.",
        "Count how often each issue or similar issue reappears (frequency).",
        "Provide concise, fact-based, and actionable recommendations for each issue."
      ]
    },
    "categorisation_criteria": {
      "Conducting Body": "Refers to those responsible for organising, planning, and overseeing the overall conduct. This includes administrative errors, planning oversights, and coordination failures.",
      "Commanders": "Refers to auxiliary or support commanders (e.g., section ICs, duty personnel) assisting with the execution. Issues may relate to poor leadership, unclear briefings, or failure to enforce standards.",
      "Participants": "Refers to those taking part in the conduct as trainees or attendees. Issues may include punctuality, discipline, preparedness, or understanding of instructions."
    },
    "output_format": "json_array",
    "output_structure": {
      "type": "array",
      "items": {
        "category": "Conducting Body | Commanders | Participants",
        "issue": "A concise summary of the key issue",
        "recommendation": "Actionable advice to address or prevent the issue",
        "frequency": "Number of times the issue or a similar one is mentioned",
        "severity": "Low | Medium | High - based on the impact of the issue on the conduct"
      }
    },
    "instructions": [
      "Do not repeat or restate the original PAR pointers.",
      "Avoid personal opinions, assumptions, or speculative reasoning.",
      "Summarise only what's evident from the facts provided.",
      "Group similar issues together and increment the frequency counter accordingly.",
      "Use plain text in each field; do not return markdown or HTML formatting.",
      "Use the categorisation criteria to assign the correct category to each issue."
    ]
  }
  `;

  // "severity_criteria": {
  //     "High": "",
  //     "Medium": "",
  //     "Low": ""
  //   }
  const completion = await openai.chat.completions.create({
    model: 'deepseek-v3',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
  });
  
  return NextResponse.json({ result: completion.choices[0].message?.content ?? '' });
}
