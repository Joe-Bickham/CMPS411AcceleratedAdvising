import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function getAcademicAdvice(question, courseData, completedCourses, degreeProgram) {
  try {
    const programName = degreeProgram || courseData.program?.name || 'this degree program';
    const hasLimitedData = !courseData.courses || courseData.courses.length < 10;
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Current model
      max_tokens: 1000,
      temperature: 0.3,
      system: `You are Claude, an AI academic advisor specifically for ${programName} at Southeastern Louisiana University.

IMPORTANT INSTRUCTIONS:
- You can ONLY provide information about ${programName}
- If asked about other degree programs, politely redirect to the appropriate program advisor
- If you don't have specific information about something, clearly state: "I don't have detailed information about [topic] in my current knowledge base. This is something that needs to be added to help students better."

AVAILABLE PROGRAM INFORMATION:
${JSON.stringify(courseData, null, 2)}

STUDENT'S COMPLETED COURSES: ${Array.from(completedCourses || []).join(', ') || 'None specified'}

${hasLimitedData ? `
NOTE: My knowledge base for ${programName} is currently limited. I'll do my best to help with general academic guidance, but for specific course details, prerequisites, and detailed program requirements, I may need to indicate that more information needs to be added to my knowledge base.
` : ''}

GENERAL ACADEMIC GUIDANCE PRINCIPLES:
- Typical course load: 12-15 credits per semester
- Prerequisites must be completed before advanced courses
- Maintain good academic standing
- Plan for graduation requirements

Provide helpful, honest responses. If you lack specific information, be transparent about it and suggest that the information needs to be added to your knowledge base.`,
      messages: [
        {
          role: 'user',
          content: question
        }
      ]
    });
    
    return message.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('AI advisor temporarily unavailable');
  }
}

export async function generateDegreeTimeline(completedCourses, courseData, startingSemester = 'Fall', targetGraduation = null) {
  try {
    const timelinePrompt = `Create a detailed semester-by-semester timeline for completing the Information Technology BS degree.

STUDENT'S CURRENT STATUS:
- Completed courses: ${Array.from(completedCourses).join(', ')}
- Starting semester: ${startingSemester}
${targetGraduation ? `- Target graduation: ${targetGraduation}` : ''}

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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.2,
      system: `You are an expert academic advisor specializing in degree planning and timeline optimization.

AVAILABLE COURSES:
${JSON.stringify(courseData.courses, null, 2)}

Create detailed, realistic academic timelines that respect prerequisites and optimize student success.`,
      messages: [
        {
          role: 'user',
          content: timelinePrompt
        }
      ]
    });
    
    return message.content[0].text;
  } catch (error) {
    console.error('Claude timeline generation error:', error);
    throw new Error('Timeline generation temporarily unavailable');
  }
}

export async function getCourseRecommendations(completedCourses, courseData, currentSemester = 'Fall') {
  try {
    const recommendationPrompt = `Recommend the best courses for the student to take in the upcoming ${currentSemester} semester.

STUDENT'S COMPLETED COURSES: ${Array.from(completedCourses).join(', ')}

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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      temperature: 0.3,
      system: `You are an expert academic advisor providing course recommendations.

AVAILABLE COURSES:
${JSON.stringify(courseData.courses, null, 2)}

Provide practical, well-reasoned course recommendations that help students progress efficiently toward graduation.`,
      messages: [
        {
          role: 'user',
          content: recommendationPrompt
        }
      ]
    });
    
    return message.content[0].text;
  } catch (error) {
    console.error('Claude recommendation error:', error);
    throw new Error('Course recommendations temporarily unavailable');
  }
}