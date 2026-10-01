/**
 * Resume-import fixtures.
 *
 * Two documents, in the two shapes the importer has to survive:
 *
 *  - `VDC_RESUME_TEXT` is the app's own domain: sections, bullet glyphs, an
 *    em-dash title/company header, and a two-line header for the second role.
 *  - `MARKETING_RESUME_TEXT` shares no vocabulary with it at all. If the importer
 *    only worked for the first one it would not be an importer, it would be a
 *    hard-coded assumption wearing one.
 *
 * Both are intentionally imperfect, because real resumes are: mixed casing in
 * headings, pipes and commas as separators, a missing company on one role.
 */

export const VDC_RESUME_TEXT = `ALEX RIVERA
Senior VDC Coordinator & Automation Specialist
Portland, OR | alex.rivera@example.com | (555) 010-0142 | linkedin.com/in/alexrivera | github.com/alexrivera

SUMMARY
Ten years of trade and field coordination across commercial and industrial work, now running MEP coordination on a data center build.

TECHNICAL SKILLS
Coordination: Navisworks, Revit, BIM 360, clash detection
Automation: Python, PySide6, Revit API, pyRevit
Data: SQL, Power BI

EXPERIENCE
Senior VDC Coordinator — Pacific Northwest Engineering | Jan 2021 - Present
- Run federated model coordination across four trade packages on a LOD 400 data center project.
- Built a pyRevit launcher the coordination team uses daily to batch clash exports.
VDC Coordinator, Cascade Builders
Mar 2018 - Dec 2020
- Coordinated MEP layouts for a 12-story mixed-use tower.
- Tracked RFIs and published clash reports weekly.

PROJECTS
Model Health Dashboard
Python / PySide6 · github.com/alexrivera/model-health
- Aggregates warning counts from the Revit API into a weekly report.

EDUCATION
Associate of Applied Science, Clackamas Community College

CERTIFICATIONS
OSHA 30
Autodesk Certified Professional
`;

export const MARKETING_RESUME_TEXT = `Maya Okonkwo
Lifecycle Marketing Manager
maya.okonkwo@example.com | 415.555.0199 | Oakland, CA | www.mayaokonkwo.com

PROFILE
Marketing manager with eight years across lifecycle and retention programs for subscription businesses.

SKILLS
Lifecycle: Braze, Customer.io, segmentation, A/B testing
Analytics: SQL, Looker, Amplitude
Copywriting: email, push, landing pages

EXPERIENCE
Lifecycle Marketing Manager at Northwind Labs
February 2022 - Present
- Grew trial-to-paid conversion 18% by rebuilding the onboarding journey in Braze.
- Ran 40+ A/B tests across email and push, and documented the winners in Looker.
Marketing Associate, Brightline Media
June 2019 - January 2022
- Owned the monthly newsletter for 120k subscribers.
- Built a referral program that added 4,000 signups in its first quarter.

EDUCATION
BA, Communications, San Jose State University

CERTIFICATIONS
Google Analytics Certified
`;

/** A document with no experience section at all, to prove the warnings fire. */
export const SUMMARY_ONLY_TEXT = `Sam Rivera
Operations Analyst
sam.rivera@example.com

SUMMARY
Operations analyst focused on process documentation and reporting.
`;

/** Minimal but valid WordprocessingML, built into a real .docx zip by the test. */
export const DOCX_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Dana Whitfield</w:t></w:r></w:p>
    <w:p><w:r><w:t>Program Manager</w:t></w:r></w:p>
    <w:p><w:r><w:t>dana.whitfield@example.com | 206.555.0110 | Seattle, WA</w:t></w:r></w:p>
    <w:p><w:r><w:t>SUMMARY</w:t></w:r></w:p>
    <w:p><w:r><w:t>Program manager with nine years delivering cross-functional initiatives.</w:t></w:r></w:p>
    <w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Program Manager at Harborline Group</w:t></w:r></w:p>
    <w:p><w:r><w:t>April 2020 - Present</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Ran the quarterly planning cycle across four teams.</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Cut vendor onboarding time from 6 weeks to 9 days.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
