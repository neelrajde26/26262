/* ============================================
   AICTE FlowGuard — AI Assistant Service
   Decision-Support Only (Human-in-the-Loop)
   ============================================ */

const { db } = require('./db.js');

const AIService = {
  // Generate executive summary of an application and pending actions
  async summarizeApplication(applicationId) {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) return { error: 'Application not found' };

    const history = db.prepare('SELECT * FROM stage_history WHERE application_id = ? ORDER BY date DESC').all(applicationId);
    const evc = db.prepare('SELECT * FROM evc_events WHERE application_id = ?').get(applicationId);
    const undertakings = db.prepare('SELECT * FROM undertakings WHERE application_id = ?').all(applicationId);
    const docs = db.prepare('SELECT * FROM documents WHERE institution_id = ?').all(app.institution_id);

    const isOverdue = app.current_stage_due_date && new Date(app.current_stage_due_date) < new Date();
    const expiredDocs = docs.filter(d => d.status === 'expired');

    // Rule-based heuristic synthesis (Zero-dependency & offline guaranteed)
    const summary = {
      isAIGenerated: true,
      timestamp: new Date().toISOString(),
      disclaimer: 'AI-assisted guidance only. Decisions and determinations must be verified and executed by authorized officials.',
      applicationNumber: app.application_number,
      institutionName: app.institution_name,
      currentStage: app.current_stage,
      status: app.status,
      overview: `Application ${app.application_number} is for ${app.type.replace(/-/g, ' ')} (${app.program_name || 'General Program'}) under ${app.region.toUpperCase()}. It is currently at '${app.current_stage}' stage with ${history.length} lifecycle transitions recorded.`,
      keyObservations: [
        app.observations ? `Officer remarks: "${app.observations}"` : 'No adverse observations recorded on file.',
        isOverdue ? `Current stage deadline was ${app.current_stage_due_date} and is overdue.` : `Current stage is within SLA limits (Due: ${app.current_stage_due_date || 'N/A'}).`,
        evc ? `EVC Visit Status: ${evc.status.toUpperCase()}${evc.report ? ' (Report submitted)' : ''}` : 'No EVC visit currently required or scheduled for this case.',
        undertakings.length > 0 ? `${undertakings.length} conditional compliance undertakings tied to this case.` : 'Zero conditional undertakings outstanding.',
        expiredDocs.length > 0 ? `Alert: ${expiredDocs.length} statutory institution documents are expired.` : 'All institutional statutory documents appear valid.'
      ],
      suggestedNextActions: isOverdue ? [
        'Prioritize review of pending verification documents.',
        'Issue reminder or return notice for institution clarification if information is incomplete.',
        'If scrutiny complete, advance to next pipeline stage.'
      ] : [
        'Verify supporting attachments against APH criteria.',
        'Review committee inspection report if EVC has completed.',
        'Record stage decision notes before advancing.'
      ]
    };

    return summary;
  },

  // Generate statutory compliance checklist for application types
  generateChecklist(applicationType) {
    const checklists = {
      'new-institution': [
        { item: 'Land Title / 30-Year Lease Deed', mandatory: true, description: 'Registered in the name of the Trust/Society for campus area.' },
        { item: 'Building Completion & Occupancy Certificate', mandatory: true, description: 'Signed by local municipal authority or competent planner.' },
        { item: 'Structural Stability Certificate', mandatory: true, description: 'Issued by licensed structural engineer.' },
        { item: 'Fire Safety Certificate / NOC', mandatory: true, description: 'Approved by State Fire Services Department.' },
        { item: 'Barrier-Free Environment (Divyangjan)', mandatory: true, description: 'Ramps, lifts, and accessible facilities verified.' },
        { item: 'Digital Library & Internet Bandwidth Proof', mandatory: true, description: 'Subscribed journals, national digital library, and bandwidth bills.' }
      ],
      'new-program': [
        { item: 'Instructional Area Adequacy Matrix', mandatory: true, description: 'Classroom and laboratory carpet area as per APH norms.' },
        { item: 'Laboratory Equipment Procurement Invoices', mandatory: true, description: 'Lab setup ready with essential equipment lists.' },
        { item: 'Faculty Cadre Ratio Plan (1:15 / 1:20)', mandatory: true, description: 'Faculty recruitment roster with required qualifications.' },
        { item: 'University Affiliation Readiness', mandatory: true, description: 'NOC from affiliating University or State Board.' }
      ],
      'intake-change': [
        { item: 'Audited Financial Statements (Last 2 Years)', mandatory: true, description: 'Financial viability proof signed by Chartered Accountant.' },
        { item: 'Student-to-Faculty Ratio Verification', mandatory: true, description: 'Existing teacher appointment orders and biometric logs.' },
        { item: 'Additional Classroom & Lab Verification', mandatory: true, description: 'Physical capacity to accommodate expanded intake.' }
      ]
    };

    return {
      isAIGenerated: true,
      applicationType: applicationType || 'new-institution',
      disclaimer: 'Generated checklist reflects standard APH demonstration criteria. Official requirements may vary based on annual handbook notifications.',
      items: checklists[applicationType] || checklists['new-institution']
    };
  },

  // Regulatory search helper
  regulatorySearch(query) {
    const q = (query || '').toLowerCase();
    const knowledgeBase = [
      {
        topic: 'EVC (Expert Visit Committee)',
        keywords: ['evc', 'expert visit', 'inspection', 'physical visit'],
        content: 'An Expert Visit Committee consists of senior academic and technical experts appointed to conduct on-site physical verification of land, building infrastructure, laboratories, faculty presence, and amenities.'
      },
      {
        topic: 'SAC (Standing Approval Committee)',
        keywords: ['sac', 'standing approval', 'approval committee'],
        content: 'The Standing Approval Committee reviews recommendations and inspection findings submitted by the EVC and Scrutiny committees before submitting recommendations to the Competent Authority.'
      },
      {
        topic: 'SHC (Standing Hearing Committee)',
        keywords: ['shc', 'hearing', 'show cause', 'deficiencies'],
        content: 'The Standing Hearing Committee provides an opportunity of personal hearing to institutions that have been issued show-cause notices or where critical deficiencies were flagged during inspection.'
      },
      {
        topic: 'Statutory Document Validity',
        keywords: ['lease', 'fire', 'noc', 'land', 'validity', 'expiry'],
        content: 'Institutions are required to maintain perpetual land ownership or active valid long-term lease deeds (minimum 30 years) and renew Fire Safety NOCs on or before expiration.'
      },
      {
        topic: 'Student-to-Faculty Ratio (SFR)',
        keywords: ['sfr', 'faculty', 'cadre', 'ratio', 'teachers'],
        content: 'Technical degree programs must maintain a Student-to-Faculty Ratio of 15:1 or 20:1 with appropriate cadre proportions (1 Professor : 2 Associate Professors : 6 Assistant Professors).'
      }
    ];

    const results = knowledgeBase.filter(k => 
      k.keywords.some(kw => q.includes(kw)) ||
      k.topic.toLowerCase().includes(q) ||
      k.content.toLowerCase().includes(q)
    );

    return {
      isAIGenerated: true,
      query,
      results: results.length > 0 ? results : [
        {
          topic: 'General APH Guidelines',
          content: 'No specific topic matched your search query. Please consult the official AICTE Approval Process Handbook (APH) regulations.'
        }
      ]
    };
  }
};

module.exports = AIService;
