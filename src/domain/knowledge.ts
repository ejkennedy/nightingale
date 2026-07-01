/**
 * Practice knowledge base — the single grounded source for FAQ answers. The
 * agent may only state facts from here (no-hallucination guardrail, ADR-0007);
 * anything not covered is routed to reception rather than invented.
 *
 * In production this would live in R2 as versioned content; for the demo it is a
 * typed constant so it is easy to read and test.
 */

export interface FaqTopic {
  id: string;
  keywords: RegExp[];
  answer: string;
}

export const PRACTICE_FACTS = {
  name: 'Meadowbrook Health Centre',
  address: '14 Meadowbrook Road, Glasgow, G12 8QQ',
  phone: '0141 555 0198',
  hours: 'Monday to Friday, 8am to 6:30pm. Closed weekends and bank holidays.',
} as const;

export const FAQ_TOPICS: FaqTopic[] = [
  {
    id: 'opening-hours',
    keywords: [
      /\b(open|opening|close|closing|hours|times?)\b/,
      /\bwhat time\b/,
      /\bweekend\b/,
      /\bsaturday\b/,
      /\bsunday\b/,
    ],
    answer: `We're open ${PRACTICE_FACTS.hours}`,
  },
  {
    id: 'location',
    keywords: [/\b(where|address|located|location|find you|directions|postcode)\b/],
    answer: `We're at ${PRACTICE_FACTS.address}.`,
  },
  {
    id: 'contact',
    keywords: [/\b(phone|number|call|contact|reception)\b/],
    answer: `You can reach reception on ${PRACTICE_FACTS.phone} during opening hours.`,
  },
  {
    id: 'register',
    keywords: [/\b(register|registration|sign up|join|new patient)\b/],
    answer:
      'To register as a new patient, bring photo ID and proof of address to reception, or ask and I can have the team post you a registration form.',
  },
  {
    id: 'services',
    keywords: [/\b(services?|offer|provide|dentist|dental|nurse|vaccin|blood test|smear)\b/],
    answer:
      'We offer GP appointments, practice-nurse services (bloods, vaccinations, smears) and NHS dentistry. Which would you like to book?',
  },
  {
    id: 'prescriptions-info',
    keywords: [/\b(repeat prescription|prescription|medication|refill|inhaler)\b/],
    answer:
      "I can take a repeat-prescription request and pass it to the practice pharmacist — I can't issue medication myself.",
  },
];

export interface FaqMatch {
  matched: boolean;
  topicId?: string;
  answer: string;
}

/**
 * Match a free-text question to a grounded answer. Returns matched:false with a
 * safe fallback when nothing applies — the agent then routes to reception rather
 * than guessing.
 */
export function answerFromKnowledge(question: string): FaqMatch {
  const q = question.toLowerCase();
  const topic = FAQ_TOPICS.find((t) => t.keywords.some((k) => k.test(q)));
  if (!topic) {
    return {
      matched: false,
      answer: "I'm not sure about that one — let me pass you to reception who can help.",
    };
  }
  return { matched: true, topicId: topic.id, answer: topic.answer };
}
