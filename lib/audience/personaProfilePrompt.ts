/**
 * Persona profile prompt (v7.552)
 *
 * Wayne's persona-profile image prompt (2026-10-10), kept here verbatim as ONE
 * constant, with the complete segment data appended below its last line —
 * exactly the "paste the complete segment data below this line" hand-off the
 * prompt ends with. The segment data is the SAME flattened row set the CSV
 * download and the clipboard copy read (lib/audience/segmentRows.ts), so the
 * image, the CSV and the copy can never disagree about a segment (Const II.7).
 *
 * Three canvas lines are parameterised because the image API fixes the canvas:
 *   • 4:5  — models that accept a custom WIDTHxHEIGHT (1024x1280)
 *   • 2:3  — gpt-image-1, whose only portrait size is 1024x1536
 * Everything else in the prompt is Wayne's text. Two copy artifacts of the
 * source doc were normalised: every LAYOUT section was numbered "1." (fixed to
 * 1–6), and "High-resolution PNG" reads "High-resolution image" because the
 * download is a JPG.
 *
 * Pure functions — unit-tested in the retained suite.
 */

import { buildSegmentRows, type AudienceSegment } from './segmentRows';

export const PERSONA_PROFILE_PROMPT_VERSION = 1;

export type ProfileAspect = '4:5' | '2:3';

export interface ProfileCanvas {
  aspect: ProfileAspect;
  /** The exact pixel size requested from the image API, e.g. "1024x1280". */
  size: string;
}

export interface ProfileContext {
  clientName: string;
  websiteUrl: string;
  industry: string | null;
}

/** The prompt body with the canvas lines filled in. */
export function personaProfilePromptText(canvas: ProfileCanvas): string {
  const px = canvas.size.replace('x', '×');
  return `GOAL
Produce a polished, presentation-ready persona profile that belongs to the exact same visual system as the reference:
* Vertical ${canvas.aspect} format (${px} pixels — the whole canvas is the profile; no margins or letterboxing)
* Premium financial-services strategy aesthetic
* Off-white background
* Navy primary typography
* One segment-specific accent color
* Realistic circular editorial portrait
* Large persona name and estimated audience share
* First-person quote
* Three quick-fact tiles
* Two-column behavioral insight section
* Four-step horizontal journey
* Three messaging recommendations
* Concise closing tone statement
DATA RULES
* Use only the supplied segment data.
* Do not add unsupported facts, statistics, motivations, products, rates, claims, or demographic assumptions.
* Do not invent current APYs, prices, limits, rankings, or other time-sensitive numbers.
* Condense the source material into concise, presentation-ready language without changing its meaning.
* If information needed for a field is absent, omit or generalize that field rather than inventing it.
* Preserve specific brands, publications, channels, communities, and decision criteria when they appear in the data.
* All displayed text must be spelled correctly and remain readable.
* The estimated share must match the supplied “Share of Volume.”
* Keep the persona strategically useful rather than decorative.
PORTRAIT
Create one realistic editorial portrait representing the supplied demographics and mindset.
The person should:
* Match the stated age range and life stage
* Communicate the persona’s decision style through expression and activity
* Wear credible contemporary clothing
* Appear natural, intelligent, and relatable
* Be shown in a clean circular crop
* Avoid generic stock-photo enthusiasm or exaggerated emotion
Use a subtle contextual prop only when supported by the data, such as a phone, tablet, notebook, or laptop.
Do not use logos, text, charts, money piles, luxury imagery, or a bank branch inside the portrait.
LAYOUT
1. IDENTITY HEADER
Display:
* “SEGMENT [LETTER]”
* Persona name
* “[SHARE]% of volume”
* Circular persona portrait
* A concise first-person quote derived from the supplied tagline
The quote should preserve the persona’s voice, motivation, tension, and urgency while fitting in approximately 20–30 words.
2. QUICK-FACT TILES
Create exactly three horizontal tiles.
Tile 1:
* Label: “AGE”
* Value: supplied age range
Tile 2:
* Choose the most strategically useful financial or situational characteristic
* Examples: “LIQUID SAVINGS,” “FUNDS TO DEPLOY,” “FINANCIAL REALITY,” or another data-supported label
* Use the exact supplied value or a concise source-grounded summary
Tile 3:
* Choose the strongest timing or behavioral dimension
* Examples: “DECISION WINDOW,” “DECISION STYLE,” or “PURCHASE TIMELINE”
* Use a concise value based on the supplied data
3. TWO-COLUMN INSIGHT AREA
Upper-left section: Create a persona-specific trigger heading, such as:
* “THE WAKE-UP CALL”
* “THE LOCK-IN MOMENT”
* “THE LIFE-MOMENT TRIGGER”
Summarize the event that starts the search in one short paragraph.
Lower-left section: Create a heading such as:
* “DECISION DRIVERS”
* “WHAT THEY NEED”
Provide exactly three concise bullets covering the most important conversion requirements, concerns, or decision criteria.
Upper-right section: Use the heading:
“INFLUENCE & VALIDATION”
or, when discovery is more important:
“INFLUENCE & DISCOVERY”
Summarize the people, communities, publications, platforms, or advisors that shape the decision.
Lower-right section: Use the heading:
“CORE MINDSET”
Summarize how the audience thinks, compares, learns, and builds trust. Keep it to two or three short sentences.
4. FOUR-STEP JOURNEY
Create one horizontal arrow-style journey with four numbered stages.
Derive the stages from the supplied touchpoints. Prefer concise action labels such as:
1. ASK AI
2. SEARCH or COMPARE
3. EVALUATE, VERIFY, or BUILD TRUST
4. OPEN, CONVERT, or CONFIRM
Under each stage, add one short line explaining what the audience does or needs.
Use this source journey when applicable:
AI assistant → Google search → website/product experience → conversion
Adapt the labels to the specific persona while preserving the four-stage structure.
Add a journey title tailored to the product or objective, such as:
* “PATH TO OPENING AN ACCOUNT”
* “PATH TO OPENING A CD”
* “PATH FROM LEARNING TO OPENING”
5. MESSAGING THAT WINS
Use the heading:
“MESSAGING THAT WINS”
Provide exactly three numbered recommendations:
1. What the message should lead with
2. What information or objection must be addressed
3. What tool, strategy, proof point, or CTA should support conversion
Each recommendation should be one concise sentence based on the supplied messaging, tone, creative, and channel guidance.
6. CLOSING TONE LINE
Finish with three short tone principles followed by one positioning contrast.
Format:
“[Tone word]. [Tone word]. [Strategic principle].”
Examples of the structure—not copy to reuse:
* “Confident. Straightforward. Numbers before feelings.”
* “Precise. Transparent. Stability over storytelling.”
* “Warm. Direct. Empowerment without judgment.”
Create a new line that accurately reflects the supplied segment.
VISUAL SYSTEM
Match the reference image’s:
* Overall hierarchy
* Section order
* Proportions
* Portrait scale
* Circular audience-share graphic
* Three-tile fact row
* Two-column insight grid
* Horizontal four-stage journey
* Bottom messaging panel
* Typography scale
* Icon style
* Spacing and density
* Editorial polish
Use navy for primary headings and body typography.
Select one accent color appropriate to the segment and apply it consistently to:
* Segment label
* Audience-share ring
* Section icons
* Journey numbers
* Selected highlights
Use pale blue and restrained warm-sand accents as secondary colors.
Keep the design clean and readable. Do not copy every pixel of the reference, but make the new profile unmistakably part of the same design family.
OUTPUT REQUIREMENTS
* One complete persona profile image
* Vertical ${canvas.aspect} orientation
* High-resolution image
* No watermark
* No extra commentary within the image
* No duplicated sections
* No clipped or overflowing text
* No tiny illegible copy
* No unsupported claims
SOURCE DATA

Paste the complete segment data below this line:`;
}

/**
 * The complete segment data block appended under the prompt's last line — the
 * client context first (so the journey title can name the product), then every
 * row the panel shows, as "Field: value" lines.
 */
export function personaProfileSourceData(
  segment: AudienceSegment,
  label: string,
  ctx: ProfileContext,
): string {
  const lines: string[] = [
    `Client: ${ctx.clientName}`,
    `Website: ${ctx.websiteUrl}`,
  ];
  if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
  buildSegmentRows(segment, label).forEach(([f, v]) => lines.push(`${f}: ${v}`));
  return lines.join('\n');
}

/** Prompt + a blank line + the segment data. This string is what the image API receives. */
export function buildPersonaProfilePrompt(
  segment: AudienceSegment,
  label: string,
  ctx: ProfileContext,
  canvas: ProfileCanvas,
): string {
  return `${personaProfilePromptText(canvas)}\n\n${personaProfileSourceData(segment, label, ctx)}`;
}
