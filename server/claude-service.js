// server/claude-service.js
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve an absolute, Windows-safe path to server/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Cache for the Anthropic SDK client
let anthropicClient = null;

async function getClient() {
  if (anthropicClient) return anthropicClient;

  // Lazily import the SDK so the app still boots if it's not installed
  let AnthropicCtor;
  try {
    const mod = await import("@anthropic-ai/sdk");
    AnthropicCtor = mod.default || mod.Anthropic; // support both export styles
  } catch {
    console.warn("Anthropic SDK not installed — Claude features disabled.");
    return null;
  }

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.warn("ANTHROPIC_API_KEY not set — Claude features disabled.");
    return null;
  }

  anthropicClient = new AnthropicCtor({ apiKey: key });
  return anthropicClient;
}

/* ---------- Model resolution & fallbacks ---------- */
function resolveModel(raw) {
  // Normalize dashed dates -> yyyymmdd (Anthropic sometimes expects exact ids)
  const normalized = (raw || "")
    .toLowerCase()
    .replace(/(\d{4})-(\d{2})-(\d{2})$/, "$1$2$3")
    .trim();

  // Friendly aliases -> exact dated ids (update these if Anthropic rotates)
  const map = {
    sonnet: "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest": "claude-3-5-sonnet-20241022",
    haiku: "claude-3-5-haiku-20241022",
    "claude-3-5-haiku": "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest": "claude-3-5-haiku-20241022",
  };

  return map[normalized] || normalized || "claude-sonnet-4-5-20250929";
}

// Try these in order; the first that works is used for the request
// Updated to prioritize Sonnet 4.5 as requested
const FALLBACK_MODELS = [
  () => process.env.ANTHROPIC_MODEL,        // your configured preference
  () => "claude-sonnet-4-5-20250929",       // primary model (Sonnet 4.5)
  () => "claude-3-5-sonnet-20241022",       // fallback to Sonnet 3.5
  () => "claude-3-5-haiku-20241022",        // fallback to Haiku
  () => "claude-3-haiku-20240307",          // older stable
];

async function callClaude({ system, messages, max_tokens = 1000, temperature = 0.3 }) {
  const client = await getClient();
  if (!client) throw new Error("Claude unavailable: SDK missing or API key not set");

  let lastErr;
  for (const pick of FALLBACK_MODELS) {
    const candidate = resolveModel(pick());
    if (!candidate) continue;

    try {
      const resp = await client.messages.create({
        model: candidate,
        max_tokens,
        temperature,
        system,
        messages,
      });
      console.log(`[claude] using model: ${candidate}`);
      return resp?.content?.[0]?.text ?? "";
    } catch (e) {
      const is404 =
        e?.status === 404 ||
        e?.error?.error?.type === "not_found_error" ||
        /model.*not.*found/i.test(e?.message || "");
      if (is404) {
        console.warn(`[claude] model not found: ${candidate} — trying next...`);
        lastErr = e;
        continue;
      }
      // Non-404 errors surface immediately (auth, quota, etc.)
      throw e;
    }
  }
  throw lastErr || new Error("No valid Anthropic model available");
}

/* ===================== Public API ===================== */

export async function getAcademicAdvice(
  question,
  courseData = {},
  completedCourses = new Set(),
  degreeProgram,
  conversationHistory = []
) {
  const programName = degreeProgram || courseData?.program?.name || "this degree program";
  const hasLimitedData = !Array.isArray(courseData?.courses) || courseData.courses.length < 10;
  const dataSource = courseData?._source || "unknown";
  const catalogYear = courseData?.program?.catalog_year || "current";
  
  // Extract key program information
  const totalHours = courseData?.program?.total_hours || 120;
  const minGradeMajor = courseData?.program?.min_grade_major || "C";
  
  // Format course data in a more readable way for Claude
  const formattedCourses = (courseData?.courses || []).map(course => {
    return {
      code: course.code,
      title: course.title,
      credits: course.credits,
      prereqs: course.prereqs || []
    };
  });
  
  // Format plan data if available
  const planData = courseData?.plan || {};
  
  const system = `You are Claude, an AI academic advisor specifically for ${programName} at Southeastern Louisiana University.

IMPORTANT INSTRUCTIONS:
- You have FULL ACCESS to the ${programName} curriculum data loaded in your system
- Your data comes from the ${catalogYear} catalog and was ${dataSource === "web" ? "dynamically scraped from the university website" : "loaded from a local snapshot"}
- You have ${formattedCourses.length} courses in your knowledge base for this program
- Provide specific, detailed answers using the course data available to you
- If asked about other degree programs, politely redirect to the appropriate program advisor

PROGRAM OVERVIEW:
- Program: ${programName}
- Catalog Year: ${catalogYear}
- Total Hours Required: ${totalHours}
- Minimum Grade in Major Courses: ${minGradeMajor}
- Total Courses Available: ${formattedCourses.length}

COMPLETE COURSE CATALOG:
${formattedCourses.map(c => `- ${c.code}: ${c.title} (${c.credits} credits)${c.prereqs && c.prereqs.length > 0 ? ` | Prerequisites: ${c.prereqs.join(', ')}` : ''}`).join('\n')}

${planData && Object.keys(planData).length > 0 ? `
RECOMMENDED 4-YEAR PLAN:
${Object.entries(planData).map(([year, semesters]) => {
  return `${year.toUpperCase()}:\n${Object.entries(semesters).map(([term, courses]) => {
    return `  ${term}: ${Array.isArray(courses) ? courses.map(c => c.code || c.title).join(', ') : 'No courses'}`;
  }).join('\n')}`;
}).join('\n\n')}
` : ""}

STUDENT'S COMPLETED COURSES: ${Array.from(completedCourses || []).join(", ") || "None specified"}

GENERAL ACADEMIC GUIDANCE PRINCIPLES:
- Typical course load: 12-15 credits per semester
- Prerequisites must be completed before advanced courses
- Maintain good academic standing
- Plan for graduation requirements

IMPORTANT:
- You HAVE this curriculum data loaded and available
- Provide specific course codes, titles, and prerequisites from the data above
- Reference the 4-year plan when discussing course sequencing
- Use conversation history to maintain context across questions

Provide helpful, detailed, specific responses using the curriculum data you have access to.`;

  try {
    // Build messages array with conversation history
    const messages = [];
    
    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push(msg);
      });
    }
    
    // Add current question
    messages.push({ role: "user", content: question });
    
    return await callClaude({
      system,
      messages,
      max_tokens: 1000,
      temperature: 0.3,
    });
  } catch (error) {
    console.error("Claude API error:", error);
    throw new Error("AI advisor temporarily unavailable");
  }
}

export async function generateDegreeTimeline(
  completedCourses = new Set(),
  courseData = {},
  startingSemester = "Fall",
  targetGraduation = null
) {
  const programName = courseData?.program?.name || "this degree program";
  const catalogYear = courseData?.program?.catalog_year || "current";
  const totalHours = courseData?.program?.total_hours || 120;
  const minGradeMajor = courseData?.program?.min_grade_major || "C";
  
  // Format course data in a more readable way for Claude
  const formattedCourses = (courseData?.courses || []).map(course => {
    return {
      code: course.code,
      title: course.title,
      credits: course.credits,
      prereqs: course.prereqs || []
    };
  });
  
  // Format plan data if available
  const planData = courseData?.plan || {};
  
  const system = `You are an expert academic advisor specializing in degree planning and timeline optimization for ${programName} at Southeastern Louisiana University.

PROGRAM OVERVIEW:
- Program: ${programName}
- Catalog Year: ${catalogYear}
- Total Hours Required: ${totalHours}
- Minimum Grade in Major Courses: ${minGradeMajor}

AVAILABLE COURSES:
${JSON.stringify(formattedCourses, null, 2)}

${planData && Object.keys(planData).length > 0 ? `
RECOMMENDED COURSE PLAN:
${JSON.stringify(planData, null, 2)}
` : ""}

Create detailed, realistic academic timelines that respect prerequisites and optimize student success.`;

  const timelinePrompt = `Create a detailed semester-by-semester timeline for completing the Information Technology BS degree.

STUDENT'S CURRENT STATUS:
- Completed courses: ${Array.from(completedCourses || []).join(", ")}
- Starting semester: ${startingSemester}
${targetGraduation ? `- Target graduation: ${targetGraduation}` : ""}

REQUIREMENTS:
- Must complete all prerequisite chains
- Typical course load: 12-15 credits per semester
- Consider course availability by semester
- Optimize for efficient graduation

Please provide:
1. Semester-by-semester course plan
2. Credit hours per semester
3. Prerequisite explanations
4. Alternative options if applicable
5. Estimated graduation timeline

Format as a clear, organized timeline.`;

  try {
    return await callClaude({
      system,
      messages: [{ role: "user", content: timelinePrompt }],
      max_tokens: 1500,
      temperature: 0.2,
    });
  } catch (error) {
    console.error("Claude timeline generation error:", error);
    throw new Error("Timeline generation temporarily unavailable");
  }
}

export async function getCourseRecommendations(
  completedCourses = new Set(),
  courseData = {},
  currentSemester = "Fall"
) {
  const programName = courseData?.program?.name || "this degree program";
  const catalogYear = courseData?.program?.catalog_year || "current";
  
  // Format course data in a more readable way for Claude
  const formattedCourses = (courseData?.courses || []).map(course => {
    return {
      code: course.code,
      title: course.title,
      credits: course.credits,
      prereqs: course.prereqs || []
    };
  });
  
  // Format plan data if available
  const planData = courseData?.plan || {};
  
  const system = `You are an expert academic advisor providing course recommendations for ${programName} at Southeastern Louisiana University.

PROGRAM OVERVIEW:
- Program: ${programName}
- Catalog Year: ${catalogYear}

AVAILABLE COURSES:
${JSON.stringify(formattedCourses, null, 2)}

${planData && Object.keys(planData).length > 0 ? `
RECOMMENDED COURSE PLAN:
${JSON.stringify(planData, null, 2)}
` : ""}

Provide practical, well-reasoned course recommendations that help students progress efficiently toward graduation.`;

  const recommendationPrompt = `Recommend the best courses for the student to take in the upcoming ${currentSemester} semester.

STUDENT'S COMPLETED COURSES: ${Array.from(completedCourses || []).join(", ")}

Consider:
- Prerequisites that are now satisfied
- Optimal course sequencing
- Typical course load (12-15 credits)
- Course availability in ${currentSemester}
- Degree progression efficiency

Provide:
1. Recommended courses with explanations
2. Alternative options
3. Prerequisites satisfied
4. Credit hour breakdown
5. Rationale for each recommendation`;

  try {
    return await callClaude({
      system,
      messages: [{ role: "user", content: recommendationPrompt }],
      max_tokens: 800,
      temperature: 0.3,
    });
  } catch (error) {
    console.error("Claude recommendation error:", error);
    throw new Error("Course recommendations temporarily unavailable");
  }
}

export async function analyzeCreditFulfillment(
  actScores = null,
  transferCredits = "",
  dualEnrollmentCredits = "",
  courseData = {},
  degreeProgram = ""
) {
  const programName = degreeProgram || courseData?.program?.name || "this degree program";
  const catalogYear = courseData?.program?.catalog_year || "current";
  const totalHours = courseData?.program?.total_hours || 120;
  const minGradeMajor = courseData?.program?.min_grade_major || "C";
  
  // Format course data in a more readable way for Claude
  const formattedCourses = (courseData?.courses || []).map(course => {
    return {
      code: course.code,
      title: course.title,
      credits: course.credits,
      prereqs: course.prereqs || []
    };
  });
  
  // Format plan data if available
  const planData = courseData?.plan || {};
  
  const system = `You are Claude, an AI academic advisor specializing in credit analysis and degree requirement fulfillment for ${programName} at Southeastern Louisiana University.

PROGRAM OVERVIEW:
- Program: ${programName}
- Catalog Year: ${catalogYear}
- Total Hours Required: ${totalHours}
- Minimum Grade in Major Courses: ${minGradeMajor}

AVAILABLE COURSES:
${JSON.stringify(formattedCourses, null, 2)}

${planData && Object.keys(planData).length > 0 ? `
RECOMMENDED COURSE PLAN:
${JSON.stringify(planData, null, 2)}
` : ""}

Your task is to analyze student credentials and determine which degree requirements are already fulfilled.

ANALYSIS GUIDELINES:
- ACT scores can fulfill certain general education requirements or placement requirements
- Transfer credits should be evaluated against specific course requirements
- Dual enrollment credits should be treated similarly to transfer credits
- Be specific about which requirements are met and which still need to be completed
- If information is insufficient to make a determination, clearly state what additional information is needed

Provide a detailed analysis in the following format:
1. FULFILLED REQUIREMENTS: List specific requirements that are met
2. REMAINING REQUIREMENTS: List what still needs to be completed
3. RECOMMENDATIONS: Suggest next steps or additional information needed
4. NOTES: Any important considerations or clarifications`;

  const analysisPrompt = `Please analyze the following student credentials against the ${programName} degree requirements:

STUDENT INFORMATION:
- ACT Scores: ${actScores ?
    Object.entries(actScores).map(([subject, score]) => `${subject}: ${score}`).join(', ') :
    "Not provided"}
- Transfer Credits: ${transferCredits || "None provided"}
- Dual Enrollment Credits: ${dualEnrollmentCredits || "None provided"}

Please provide a comprehensive analysis of which degree requirements are fulfilled by these credentials and what remains to be completed.`;

  try {
    return await callClaude({
      system,
      messages: [{ role: "user", content: analysisPrompt }],
      max_tokens: 1200,
      temperature: 0.2,
    });
  } catch (error) {
    console.error("Claude credit analysis error:", error);
    throw new Error("Credit analysis temporarily unavailable");
  }
}
