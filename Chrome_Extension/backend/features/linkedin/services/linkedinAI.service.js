const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateLinkedInMessage(profile) {
  const { name, title, company, location } = profile;

  const prompt = `
Write a personalized LinkedIn connection message.

Person:
Name: ${name}
Title: ${title}
Company: ${company || "their company"}
Location: ${location || "their area"}

User:
Computer Science student at Carleton University seeking internships or co-op opportunities.

Constraints:
- Friendly and professional
- Max 90 words
- No emojis
- Do not mention AI
- Ask politely to connect
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  return completion.choices[0].message.content;
}

module.exports = { generateLinkedInMessage };
