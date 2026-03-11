/**
 * MCP Tool: Marco Pollo
 *
 * Food safety expert powered by Gemini AI.
 * Answers questions about FDA regulations, safe temperatures,
 * holding times, and food handling best practices.
 *
 * Strategy (from ARCHITECTURE.md):
 *  - Short-term: Gemini with food safety system prompt (no external deps)
 *  - Medium-term: Dedicated Marco Pollo REST API
 *  - Long-term: Fine-tuned model with vector DB for regulation lookup
 */

import { MCPTool, MCPAuthContext } from '../libs/mcp-types';
import { genAI } from '../core/ai-core';

const FOOD_SAFETY_SYSTEM_PROMPT = `You are Marco Pollo, a food safety expert specializing in FDA Food Code compliance for restaurants and food service operations.

Your expertise includes:
- FDA Food Code regulations and requirements
- Safe food temperatures (cooking, holding, cooling, reheating)
- HACCP principles and critical control points
- Allergen management and cross-contamination prevention
- Personal hygiene and handwashing requirements
- Food storage and labeling requirements
- Cleaning and sanitization procedures

When answering questions:
1. Always cite the specific FDA Food Code section when applicable
2. Provide exact temperatures in both Fahrenheit and Celsius
3. Include time requirements where relevant
4. Flag any critical food safety violations
5. Suggest practical implementation steps for restaurant teams
6. If unsure about a specific regulation, clearly state that and recommend consulting the local health department

Keep answers concise but thorough. Focus on actionable guidance that restaurant managers can implement immediately.`;

export const marcoPolloTool: MCPTool = {
  name: 'marco-pollo',
  description:
    'Food safety expert. Answers questions about FDA regulations, safe temperatures, holding times, HACCP, allergens, and food handling best practices. Provides citations to FDA Food Code sections.',
  requiresAuth: false,

  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The food safety question to ask Marco Pollo',
      },
    },
    required: ['question'],
  },

  execute: async (params: any, _context: MCPAuthContext) => {
    const { question } = params;

    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: question }] }],
        config: {
          systemInstruction: FOOD_SAFETY_SYSTEM_PROMPT,
          maxOutputTokens: 1024,
          temperature: 0.3,
        },
      });

      const text =
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        response.text ||
        '';

      return {
        answer: text,
        source: 'marco-pollo-ai',
        disclaimer:
          'This is AI-generated food safety guidance. Always verify with your local health department for jurisdiction-specific requirements.',
      };
    } catch (err: any) {
      console.error('Marco Pollo AI error:', err);
      return {
        answer:
          'Marco Pollo is currently unavailable. For food safety questions, please refer to the FDA Food Code at https://www.fda.gov/food/retail-food-protection/fda-food-code',
        source: 'fallback',
        disclaimer: 'AI service unavailable. Please consult FDA guidelines directly.',
      };
    }
  },
};
