/**
 * Sankey Pipeline Service - Builds SankeyMATIC-format text from job application emails.
 * Outputs a general stage-to-stage diagram (FromStage [count] ToStage), no company names.
 */
import { JOB_TYPE_LABELS } from '../config/constants.js';

/**
 * Sanitize a node name so it does not contain [ or ] (reserved for amount in SankeyMATIC).
 * @param {string} name - Raw node name
 * @returns {string}
 */
function sanitizeNodeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name.replace(/[[\]]/g, '').trim();
}

/** Unify "Application submitted" / "Job application" with "Applications Sent" so diagram counts are correct. */
function normalizeStageLabel(label) {
    if (!label || typeof label !== 'string') return label;
    const t = label.trim();
    if (/^application\s*submitted$/i.test(t) || /^job\s*application$/i.test(t)) return 'Applications Sent';
    return t;
}

/**
 * Build SankeyMATIC-format text from job emails.
 * Outputs: Applications Sent [total] -> each stage, so the diagram shows total applications branching out to OA, Interview, Rejected, etc.
 * Each job email is counted once in its current stage (transitionTo or jobType).
 * @param {Array<Object>} jobEmails - List of job application emails
 * @param {Object} emailRepository - EmailRepository (getCachedResult)
 * @param {Object} emailParserService - EmailParserService (unused; kept for API compatibility)
 * @returns {string} SankeyMATIC source text
 */
export function buildSankeyMaticText(jobEmails, emailRepository, emailParserService) {
    if (!jobEmails || jobEmails.length === 0) {
        return '// No job application emails found';
    }

    const SOURCE_LABEL = 'Applications Sent';
    const NO_RESPONSE_LABEL = 'No Response';
    const stageCounts = new Map();

    for (const email of jobEmails) {
        const cached = emailRepository.getCachedResult(email.id);
        let toStage = cached?.transitionTo;

        if (toStage == null && cached?.jobType != null) {
            toStage = JOB_TYPE_LABELS[cached.jobType] || cached.jobType;
        }

        let toLabel;
        if (toStage) {
            toLabel = normalizeStageLabel(sanitizeNodeName(String(toStage)));
            if (!toLabel) toLabel = NO_RESPONSE_LABEL;
            // Emails still in "Applications Sent" (no response yet) show as No Response
            if (toLabel === SOURCE_LABEL) toLabel = NO_RESPONSE_LABEL;
        } else {
            // No cached stage (e.g. Job by label/inboxCategory but not yet processed, or AI returned Job without stage)
            toLabel = NO_RESPONSE_LABEL;
        }

        stageCounts.set(toLabel, (stageCounts.get(toLabel) || 0) + 1);
    }

    if (stageCounts.size === 0) {
        return '// No job emails to display';
    }

    const entries = Array.from(stageCounts.entries())
        .map(([stage, count]) => ({ from: SOURCE_LABEL, to: stage, count }))
        .sort((a, b) => a.to.localeCompare(b.to));

    return entries.map(({ from, to, count }) => `${from} [${count}] ${to}`).join('\n');
}
