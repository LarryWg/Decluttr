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
 * Build SankeyMATIC-format text from job emails as stage-to-stage flows (FromStage [count] ToStage).
 * Uses cached transitionFrom and transitionTo; falls back to jobType as transitionTo when no transition.
 * @param {Array<Object>} jobEmails - List of job application emails
 * @param {Object} emailRepository - EmailRepository (getCachedResult)
 * @param {Object} emailParserService - EmailParserService (unused; kept for API compatibility)
 * @returns {string} SankeyMATIC source text
 */
export function buildSankeyMaticText(jobEmails, emailRepository, emailParserService) {
    if (!jobEmails || jobEmails.length === 0) {
        return '// No job application emails found';
    }

    const flowCounts = new Map();

    for (const email of jobEmails) {
        const cached = emailRepository.getCachedResult(email.id);
        let fromStage = cached?.transitionFrom;
        let toStage = cached?.transitionTo;

        if (toStage == null && cached?.jobType != null) {
            toStage = JOB_TYPE_LABELS[cached.jobType] || cached.jobType;
            if (fromStage == null) fromStage = 'Applications Sent';
        }

        if (!toStage) continue;
        fromStage = fromStage || 'Applications Sent';
        let fromLabel = normalizeStageLabel(sanitizeNodeName(String(fromStage)));
        let toLabel = normalizeStageLabel(sanitizeNodeName(String(toStage)));
        if (!fromLabel || !toLabel) continue;

        // Application submitted but no response yet: show as Applications Sent -> No Response
        if (toLabel === 'Applications Sent') {
            toLabel = 'No Response';
        }

        const key = `${fromLabel}\t${toLabel}`;
        flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
    }

    if (flowCounts.size === 0) {
        return '// No stage transitions found';
    }

    const entries = Array.from(flowCounts.entries()).map(([key, count]) => {
        const [from, to] = key.split('\t');
        return { from, to, count };
    });
    entries.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

    return entries.map(({ from, to, count }) => `${from} [${count}] ${to}`).join('\n');
}
