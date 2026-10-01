/**
 * Sample postings for testing the analyzer without leaving the app.
 *
 * These are written to exercise the parser's edge cases: the LinkedIn paste
 * shape, a labelled-block shape, a requirements-heavy utility posting, and a
 * role that is deliberately a poor market fit so the gap analysis has something
 * to report.
 */

export interface SamplePosting {
  id: string;
  label: string;
  blurb: string;
  text: string;
}

export const SAMPLE_POSTINGS: SamplePosting[] = [
  {
    id: "sample_pdx_vdc",
    label: "Portland GC — VDC Coordinator (Hybrid)",
    blurb: "LinkedIn-style paste. Strong market fit, heavy Navisworks + trade coordination.",
    text: `VDC Coordinator
Hoffman Structures Northwest · Portland, OR · 3 days ago
Hybrid · Full-time · $92,000 - $118,000 a year

About the role
Hoffman Structures Northwest is a regional general contractor with a backlog of healthcare, higher education, and industrial work across Oregon and Southwest Washington. Our VDC group sits with preconstruction and field operations, not off on its own.

What you'll do
- Own federated model coordination for two to three active projects, running clash detection in Navisworks Manage and driving resolutions to closure.
- Chair weekly coordination meetings with trade partners, superintendents, and design teams; publish clash reports and follow up on open items.
- Support MEP coordination on high-density mechanical and electrical scopes, including prefabrication and spool drawing review.
- Build and maintain BIM Execution Plan documents, modeling standards, and Revit template content.
- Support preconstruction with constructability reviews, quantity takeoff, and 4D sequencing support.
- Help field crews with layout and field verification, including point cloud registration from laser scanning.

Requirements
- 4+ years of VDC or BIM coordination experience on commercial construction projects.
- Expert level Autodesk Revit and Navisworks Manage. Revizto and Bluebeam experience preferred.
- Working knowledge of Autodesk Construction Cloud (ACC) and BIM 360.
- Experience leading coordination meetings with subcontractors and discipline leads.
- Strong written communication and documentation habits.
- Familiarity with LOD 350 and LOD 400 model requirements.
- Bachelor's degree in construction management, engineering, or equivalent trade experience.

Nice to have
- Dynamo or Python scripting for model automation.
- Data center or mission critical project exposure.
- OSHA 30 certification.

Benefits
Medical, dental, vision, 401k match, and a hybrid schedule with two days in the Portland office.`,
  },
  {
    id: "sample_remote_automation",
    label: "National Contractor — BIM Automation Specialist (Remote)",
    blurb: "Remote-first, code-heavy. Exercises the automation emphasis and Revit API matching.",
    text: `Job Title: BIM Automation Specialist / VDC Developer
Company: Layton Digital Delivery
Location: Remote - United States
Employment Type: Full-time

Position Summary
Layton Digital Delivery builds internal tooling for a national contractor's VDC teams. We are hiring a developer-minded BIM specialist to own the Revit API and pyRevit toolchain that our coordinators run every day. This is a remote position; travel is limited to two team weeks per year.

Responsibilities
- Design, build, and maintain pyRevit tools and Revit API add-ins used by 60+ VDC staff across the country.
- Own our Qt desktop launcher and the tool registry behind it, including manifest parsing, hotkeys, and persisted settings.
- Automate model QA: view and sheet setup, parameter audits, model health reporting, and clash report generation.
- Write Python tooling that pulls data out of Navisworks and Autodesk Construction Cloud so leads can see coordination status in a dashboard.
- Work directly with superintendents, project managers, and trade partners to find the manual work that should not be manual.
- Document every tool with a short SOP and train coordinators on it.

Qualifications
- 3+ years of Revit API or pyRevit development, with a portfolio of tools you shipped and maintain.
- Strong Python. C# and PySide6 or PyQt experience strongly preferred.
- Deep understanding of Autodesk Revit model structure, families, and worksharing.
- Navisworks Manage and clash detection experience.
- Comfortable in Git, code review, and CI for internal tooling.
- Bonus: Dynamo, Power BI dashboards, digital twin or model data work, machine learning exposure.
- Bonus: electrical or mechanical trade background. Field experience makes better tool builders.

Compensation
$110,000 - $140,000 per year plus bonus, fully remote with equipment stipend.`,
  },
  {
    id: "sample_datacenter",
    label: "Hillsboro — Senior MEP/VDC Data Center Lead (On-site)",
    blurb: "Requirements-heavy on-site data center role. High keyword mass, strong domain match.",
    text: `Senior MEP / VDC Coordination Lead

Company: Cascade Mission Systems, Inc.
Location: Hillsboro, OR
Work arrangement: On-site, full-time

Cascade Mission Systems delivers mission critical and hyperscale data center construction across the Pacific Northwest. We are staffing a new 60MW campus in Hillsboro and need a senior coordinator who has run a dense data center coordination effort from the model.

Essential Functions
- Lead MEP coordination on a LOD 400 data center project: mechanical, electrical, plumbing, fire protection, and process piping systems.
- Run Navisworks Manage federated model reviews, own the clash matrix, and drive resolution with subcontractors, general contractor staff, engineering discipline leads, and the owner's representatives.
- Coordinate electrical trade sequencing, cable tray and busway routing, switchgear placement, and conduit rack layouts with the electrical contractor.
- Manage prefabrication and spooling packages with trade partners, including shop drawing and fabrication drawing review.
- Review constructability, resolve RFIs and submittals, and keep the as-built record current.
- Maintain the project BIM Execution Plan and model standards; audit LOD compliance and model health weekly.
- Support field layout, survey, and quality control walkthroughs, including punch list turnover.
- Mentor two junior VDC coordinators and lead the coordination meetings calendar.

Minimum Qualifications
- 8+ years in construction with at least 4 years in MEP coordination or VDC on industrial or data center work.
- Expert Autodesk Revit and Navisworks Manage. AutoCAD and Revizto a plus. Civil 3D and underground utilities exposure helpful.
- Laser scanning and reality capture experience, including point cloud registration.
- Working knowledge of 4D sequencing and Primavera P6 schedules.
- Strong grasp of quality assurance, safety, and site safety culture on an active data center campus.
- Journeyman-level trade experience or a degree in mechanical or electrical engineering is welcome.
- Must be able to work on-site in Hillsboro; not a remote position.

Compensation
$120,000 - $155,000 per year plus per diem, truck allowance, and completion bonus.`,
  },
  {
    id: "sample_offtarget",
    label: "Off-target — Architectural Draftsperson (low fit test)",
    blurb: "Deliberately outside the target market and keyword set, to test the gap analysis.",
    text: `Architectural Draftsperson
Firm: Beaux Arts Studio Collaborative
Location: Charleston, SC
In-office, part-time contract

About the position
We are a boutique residential architecture studio looking for a draftsperson to prepare permit sets and construction documents for custom single-family homes.

Duties
- Produce permit drawings, elevations, and detail sheets in AutoCAD and SketchUp.
- Assist with residential design development and client presentations.
- Coordinate with structural consultants and local jurisdictions.
- Maintain our drawing standards library.
- Occasional site visits and survey measurement with the design team.

Requirements
- 2+ years residential drafting experience.
- Proficiency in AutoCAD, SketchUp, and Adobe Creative Suite.
- Knowledge of residential building codes and permitting.
- Interior design sensibility and hand sketching ability.
- Bachelor's degree in architecture preferred.

Compensation
$28 - $36 per hour, part-time, on-site in Charleston.`,
  },
];
