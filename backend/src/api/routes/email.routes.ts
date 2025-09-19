// src/api/routes/email.routes.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../config/index';
import { User } from '../models/user.model';
import EmailModel, { IEmail } from '../models/email.model';

const router = Router();
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

interface JwtPayload { id: string; }

const getEmailBody = (payload: any): string => {
    // This helper function is perfect, no changes needed.
    if (!payload) return ''; let body = ''; const partsToSearch = [payload];
    while (partsToSearch.length) {
        const part = partsToSearch.shift();
        if (part.mimeType === 'text/html' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString('utf8');
        if (part.mimeType === 'text/plain' && part.body?.data && !body) body = Buffer.from(part.body.data, 'base64').toString('utf8');
        if (part.parts) partsToSearch.push(...part.parts);
    }
    return body || (payload.body?.data ? Buffer.from(payload.body.data, 'base64').toString('utf8') : '');
};

// --- OPTIMIZED ---: Helper now also returns calendar client
const getAuthenticatedClient = async (req: Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Authentication failed');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Authentication failed');
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await User.findById(decoded.id);
    if (!user) throw new Error('User not found');
    const oauth2Client = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret);
    oauth2Client.setCredentials({ access_token: user.accessToken, refresh_token: user.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client }); // ADDED
    return { user, gmail, calendar }; // UPDATED
};

// ROUTE 1: Get email list (Optimized for performance and API usage)
router.get('/', async (req: Request, res: Response) => {
    try {
        const { user, gmail } = await getAuthenticatedClient(req);
        // 1. Get latest message IDs
        const listResponse = await gmail.users.messages.list({ userId: 'me', maxResults: 25, q: 'in:inbox category:primary newer_than:7d' });
        const messages = listResponse.data.messages ?? [];
        if (messages.length === 0) return res.status(200).json([]);
        const messageIds = messages.map(m => m.id!);

        // 2. Find cached vs uncached emails
        const cachedEmails = await EmailModel.find({ userId: user._id, gmailMessageId: { $in: messageIds } });
        const cachedIds = new Set(cachedEmails.map(e => e.gmailMessageId));
        const uncachedIds = messageIds.filter(id => !cachedIds.has(id));
        
        let newlyAnalyzedEmails: IEmail[] = [];

        // --- BATCH ANALYSIS LOGIC ---
        // 3. If there are uncached emails, analyze them all in one go.
        if (uncachedIds.length > 0) {
            console.log(`[Batch AI] Found ${uncachedIds.length} new emails to analyze.`);

            // Fetch full content for all new emails
            const uncachedEmailPromises = uncachedIds.map(id => 
                gmail.users.messages.get({ userId: 'me', id: id, format: 'full' })
            );
            const fullEmailResponses = await Promise.all(uncachedEmailPromises);

            // Prepare the emails for the AI prompt
            const emailsForAI = fullEmailResponses.map(response => {
                const body = getEmailBody(response.data.payload);
                return {
                    id: response.data.id!,
                    body: body.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().substring(0, 4000) // Shorter length for batch
                };
            }).filter(e => e.body); // Only include emails that have a body

            if (emailsForAI.length > 0) {
                try {
                    // Create one powerful prompt for all emails
                    // The final, most advanced prompt
            const currentDateForAI = new Date().toLocaleDateString('en-CA'); 
            const batchPrompt = `You are an expert AI assistant specializing in email triage and data extraction. Your goal is to analyze emails and return structured JSON data.

            You will be given a JSON array of emails. You MUST return a single, valid JSON array.

            Each object in your response MUST conform to this exact schema:
            - "id": (string) The original email ID.
            - "priority": (string) "urgent", "neutral", or "spam".
            - "summary": (string) A concise one-sentence summary.
            - "suggestion": (string) A short, professional reply suggestion.
            - "isMeetingRequest": (boolean) True if the email is trying to schedule a meeting.
            - "proposedDate": (string or null) If a specific date is proposed (e.g., "tomorrow", "next Tuesday", "June 25th"), return it in "YYYY-MM-DD" format. If no date is mentioned, return null.
            - "proposedTime": (string or null) If a specific time is proposed (e.g., "3pm", "10:00 AM"), return it in "HH:MM" 24-hour format. If no time is mentioned, return null.

            **CRITICAL RULES:**
            1.  NEVER respond with text outside the final JSON array.
            2. Base the proposedDate on a current date of **${currentDateForAI}**. For example, "tomorrow" would be the next calendar day.
            3.  If an email is ambiguous, classify it as "neutral".

            **EXAMPLE:**
            - Input: \`[{ "id": "123", "body": "Hey, can you meet next Tuesday around 4pm to discuss the project?" }]\`
            - Output: \`[{ "id": "123", "priority": "urgent", "summary": "A meeting is proposed for next Tuesday at 4pm to discuss the project.", "suggestion": "That time works for me. I'll send a calendar invite shortly.", "isMeetingRequest": true, "proposedDate": "2025-09-23", "proposedTime": "16:00" }]\`

            Now, analyze the following emails:
            ${JSON.stringify(emailsForAI)}
            `;









                    const result = await model.generateContent(batchPrompt);
                    const aiResponseText = result.response.text();
                    const analyses: any[] = JSON.parse(aiResponseText.replace(/```json|```/g, '').trim());

                    // Combine AI analysis with full email data and prepare for DB insertion
                    const bulkDbOperations = analyses.map(analysis => {
                        const originalEmail = fullEmailResponses.find(e => e.data.id === analysis.id)?.data;
                        if (!originalEmail) return null;

                        const headers = originalEmail.payload?.headers;
                        const fullEmailData = {
                            userId: user._id, gmailMessageId: analysis.id,
                            from: headers?.find(h => h.name === 'From')?.value ?? '?', subject: headers?.find(h => h.name === 'Subject')?.value ?? '?',
                            snippet: originalEmail.snippet ?? '', body: getEmailBody(originalEmail.payload), receivedAt: new Date(parseInt(originalEmail.internalDate!, 10)),
                            threadId: originalEmail.threadId!,
                            messageIdHeader: headers?.find(h => h.name === 'Message-ID')?.value ?? `<${analysis.id}@mail.gmail.com>`,
                            referencesHeader: headers?.find(h => h.name === 'References')?.value,
                            aiPriority: analysis.priority, aiSummary: analysis.summary,
                            aiSuggestion: analysis.suggestion, isMeetingRequest: analysis.isMeetingRequest || false,
                            aiProposedDate: analysis.proposedDate,
                            aiProposedTime: analysis.proposedTime,
                        };
                        
                        return {
                            updateOne: {
                                filter: { userId: user._id, gmailMessageId: analysis.id },
                                update: fullEmailData,
                                upsert: true
                            }
                        };
                    }).filter(op => op !== null);
                    
                    if (bulkDbOperations.length > 0) {
                        await EmailModel.bulkWrite(bulkDbOperations as any);
                        console.log(`[Batch AI] Successfully analyzed and saved ${bulkDbOperations.length} emails.`);
                        // Fetch the newly saved docs to return them
                        const newIds = bulkDbOperations.map(op => op?.updateOne.filter.gmailMessageId);
                        newlyAnalyzedEmails = await EmailModel.find({ userId: user._id, gmailMessageId: { $in: newIds }});
                    }
                } catch (aiError) {
                    console.error("[Batch AI] CRITICAL FAILURE:", aiError);
                    // If batch fails, we won't add any new emails this round
                }
            }
        }
        
        // 4. Final Combination and Response
        const allEmails = [
            ...cachedEmails,
            ...newlyAnalyzedEmails
        ].map(e => ({...e.toObject(), hasBeenAnalyzed: true})); // Everything is now considered analyzed

        allEmails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
        res.status(200).json(allEmails);

    } catch (error: any) { 
        console.error("Error in GET /emails:", error);
        res.status(500).json({ message: 'Error fetching email list' }); 
    }
});


// ROUTE 2: Analyze a single email on demand (changed to use URL param)
router.post('/analyze/:messageId', async (req: Request, res: Response) => {
    try {
        const { messageId } = req.params;
        const { user, gmail } = await getAuthenticatedClient(req);

        const emailResponse = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        const headers = emailResponse.data.payload?.headers;
        const body = getEmailBody(emailResponse.data.payload);
        
        let aiAnalysis: any;
        try {
            const plainTextBodyForAI = body.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().substring(0, 8000);
            
            // --- LOGGING 1: Let's see what we are sending to the AI ---
            console.log(`[AI Analysis] Preparing to analyze messageId: ${messageId}. Body length: ${plainTextBodyForAI.length}`);

            if (plainTextBodyForAI) {
                const prompt = `Critically analyze this email. Respond with a single, valid JSON object, and nothing else. JSON Keys: "priority" (string: "urgent", "neutral", or "spam"), "summary" (string: a one-sentence summary), "suggestion" (string: a professional reply suggestion), and "isMeetingRequest" (boolean). Email: "${plainTextBodyForAI}"`;
                const result = await model.generateContent(prompt);
                const aiResponseText = result.response.text();
                
                // --- LOGGING 2: Let's see the raw response from the AI ---
                console.log(`[AI Analysis] Raw AI Response for ${messageId}:`, aiResponseText);
                
                aiAnalysis = JSON.parse(aiResponseText.replace(/```json|```/g, '').trim());
            } else {
                aiAnalysis = { priority: 'neutral', summary: 'No text content to analyze.', suggestion: '', isMeetingRequest: false };
            }
        } catch (aiError: any) {
            // --- LOGGING 3: This is the MOST IMPORTANT log ---
            console.error(`[AI Analysis] CRITICAL FAILURE for messageId ${messageId}. Details:`, aiError);
            
            // --- LOGGING 4: Log the full error object if available ---
            if (aiError.response) {
                console.error('[AI Analysis] Error Response Data:', aiError.response.data);
            }

            aiAnalysis = { priority: 'error', summary: 'AI service failed to analyze this email.', suggestion: '', isMeetingRequest: false };
        }

        const fullEmailData = {
            userId: user._id, gmailMessageId: messageId,
            from: headers?.find(h => h.name === 'From')?.value ?? '?', subject: headers?.find(h => h.name === 'Subject')?.value ?? '?',
            snippet: emailResponse.data.snippet ?? '', body: body, receivedAt: new Date(parseInt(emailResponse.data.internalDate!, 10)),
            threadId: emailResponse.data.threadId!,
            messageIdHeader: headers?.find(h => h.name === 'Message-ID')?.value ?? `<${messageId}@mail.gmail.com>`,
            referencesHeader: headers?.find(h => h.name === 'References')?.value,
            aiPriority: aiAnalysis.priority, aiSummary: aiAnalysis.summary,
            aiSuggestion: aiAnalysis.suggestion, isMeetingRequest: aiAnalysis.isMeetingRequest || false,
        };

        const updatedEmail = await EmailModel.findOneAndUpdate(
            { userId: user._id, gmailMessageId: messageId },
            fullEmailData, { upsert: true, new: true }
        );
        res.status(200).json(updatedEmail);
    } catch (error: any) { 
        console.error(`[AI Analysis] General error in /analyze route for messageId ${req.params.messageId}:`, error);
        if (error.message.includes('Authentication')) return res.status(401).json({ message: 'Authentication error.' });
        res.status(500).json({ message: 'Error analyzing email' }); 
    }
});

// ROUTE 3: Send an email (Your existing code is good)
router.post('/send', async (req: Request, res: Response) => {
   try {
       const { user, gmail } = await getAuthenticatedClient(req);
       const { to, subject, body, threadId, inReplyTo, references } = req.body;

       if (!to || !subject || !body || !threadId) return res.status(400).json({ message: 'Missing required fields for reply' });
       
       const emailParts = [
           `From: "${user.displayName}" <${user.email}>`, `To: ${to}`, `Subject: ${subject}`,
           `In-Reply-To: ${inReplyTo}`, `References: ${references}`,
           'Content-Type: text/plain; charset=utf-8', '', body,
       ];
       const emailStr = emailParts.join('\r\n');
       const encodedMessage = Buffer.from(emailStr).toString('base64url');

       await gmail.users.messages.send({
           userId: 'me', requestBody: { raw: encodedMessage, threadId: threadId },
       });
       res.status(200).json({ message: 'Reply sent successfully!' });
   } catch (error: any) {
       console.error('Error sending email:', error.response?.data?.error || error.message);
       res.status(500).json({ message: 'Failed to send reply' });
   }
});


// --- ADDED ---: Calendar routes for smart scheduling

// ROUTE 4: Check calendar availability (More Robust)
router.post('/calendar/check-availability', async (req: Request, res: Response) => {
    try {
        const { calendar } = await getAuthenticatedClient(req);
        const { start, end } = req.body;

        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end times are required.' });
        }

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: start,
                timeMax: end,
                items: [{ id: 'primary' }],
            },
        });
        
        // --- ROBUST FIX ---
        // We safely access the calendars object and check if the 'busy' array exists and has a length greater than 0.
        const busySlots = response.data.calendars?.primary?.busy ?? [];
        const isAvailable = busySlots.length === 0;

        res.status(200).json({ isAvailable });

    } catch (error: any) {
        console.error('Error checking calendar availability:', error.response?.data?.error || error.message);
        res.status(500).json({ message: 'Failed to check calendar availability.' });
    }
});

// ROUTE 5: Create a calendar event
router.post('/calendar/create-event', async (req: Request, res: Response) => {
    try {
        const { calendar } = await getAuthenticatedClient(req);
        const { summary, description, start, end, attendees } = req.body;

        if (!summary || !start || !end || !attendees) {
            return res.status(400).json({ message: 'Missing required event details.' });
        }

        const event = {
            summary, description,
            start: { dateTime: start, timeZone: 'Asia/Kolkata' }, // Using your local timezone
            end: { dateTime: end, timeZone: 'Asia/Kolkata' },
            attendees: attendees.map((email: string) => ({ email })),
            reminders: {
                useDefault: true,
            },
        };

        const createdEvent = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            sendNotifications: true, // This is crucial to send invites to attendees
        });

        res.status(201).json({ message: 'Event created successfully!', event: createdEvent.data });
    } catch (error: any) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({ message: 'Failed to create calendar event.' });
    }
});


export default router;