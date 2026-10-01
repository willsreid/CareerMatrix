/* -------------------------------------------------------------------------- */
/* Master Profile — the starter                                              */
/*                                                                            */
/* This is the *blank* profile: the one that ships in a public copy of the    */
/* app, in place of somebody's real resume. Replace every word of it with     */
/* yours — or paste your resume into `/profile` and let the importer do it.   */
/*                                                                            */
/* The shape is the whole contract. Every entry has an `id` (so edits and    */
/* versions can point at it) and bullets carry `tags` (the vocabulary the     */
/* matcher scores against) and an `emphasis` list (which of the three pitches */
/* the line belongs to). A profile with no tags produces a resume with no     */
/* matches, and the audit panel will say so rather than inventing anything.   */
/* -------------------------------------------------------------------------- */

/*
 * The import is the app's own alias rather than `./types`, because this file lives in `blank/lib/` in the
 * working copy and in `lib/` in a published one. With the alias it type-checks in both, so the starter profile
 * cannot ship broken.
 */
import type { MasterProfile } from "@/lib/types";

/** One bullet, with the tags the matcher reads and the pitches it belongs to. */
const bullet = (
  id: string,
  label: string,
  text: string,
  tags: string[],
  emphasis: ("balanced" | "technical" | "delivery")[],
) => ({ id, label, text, tags, emphasis });

export const MASTER_PROFILE_SEED: MasterProfile = {
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  header: {
    name: "Alex Rivera",
    headline: "VDC Coordinator & BIM Automation",
    altHeadlines: [
      "VDC Coordinator & BIM Automation",
      "BIM / VDC Coordinator with a field-trade background",
      "Coordination Lead · BIM Developer · VDC Specialist",
    ],
    location: "Your City, ST",
    locationNote: "Open to hybrid, in-office and remote",
    email: "alex.rivera@example.com",
    phone: "(555) 010-0100",
    linkedin: "linkedin.com/in/alexrivera",
    portfolio: "github.com/alexrivera",
  },
  pitch:
    "Coordination and modelling across commercial and industrial work, with the scripting to make the repetition go away.",
  pitchVariants: {
    balanced:
      "Coordination and modelling across commercial and industrial work, with the scripting to make the repetition go away.",
    technical:
      "Runs federated coordination on LOD 400 models and writes the Python and Revit API tooling the team uses to get through the clash list.",
    delivery:
      "Years on site and in the model: reads a drawing set the way someone who has installed from one does, then coordinates the trades against it.",
  },
  targetMarket: {
    label: "Your Metro Area",
    locations: ["Your City, ST", "Nearby City, ST", "Remote"],
    workModes: ["Remote", "Hybrid", "In-Office"],
    titles: ["VDC Coordinator", "BIM Coordinator", "Coordination Lead", "BIM Specialist"],
  },
  skillGroups: [
    {
      id: "sg_coordination",
      title: "Coordination & Modelling",
      items: [
        {
          id: "sk_coord_1",
          term: "Federated Model Coordination",
          tags: ["federated models", "model coordination", "3d coordination", "navisworks"],
        },
        {
          id: "sk_coord_2",
          term: "Clash Detection & Resolution",
          tags: ["clash detection", "clash reports", "coordination meetings", "navisworks"],
        },
        {
          id: "sk_coord_3",
          term: "LOD 400 Fabrication Models",
          tags: ["lod 400", "fabrication models", "mep coordination", "spool drawings"],
        },
        {
          id: "sk_coord_4",
          term: "Revit Modelling",
          tags: ["revit", "families", "sheet sets", "views and filters"],
        },
        {
          id: "sk_coord_5",
          term: "Common Data Environment",
          tags: ["acc", "bim 360", "document control", "model sharing"],
        },
      ],
    },
    {
      id: "sg_automation",
      title: "Automation & Development",
      items: [
        {
          id: "sk_auto_1",
          term: "Python Tooling",
          tags: ["python", "automation", "scripting", "data processing"],
        },
        { id: "sk_auto_2", term: "Revit API", tags: ["revit api", "add-ins", "c#", "automation"] },
        { id: "sk_auto_3", term: "pyRevit", tags: ["pyrevit", "tool launcher", "pushbutton"] },
        {
          id: "sk_auto_4",
          term: "Desktop Interfaces",
          tags: ["pyside6", "qt", "internal tools", "workflow"],
        },
        { id: "sk_auto_5", term: "SQL & Reporting", tags: ["sql", "reports", "power bi", "dashboards"] },
      ],
    },
    {
      id: "sg_delivery",
      title: "Project Delivery",
      items: [
        {
          id: "sk_pd_1",
          term: "Trade Coordination Meetings",
          tags: ["coordination meetings", "rfis", "trade partners", "meeting minutes"],
        },
        {
          id: "sk_pd_2",
          term: "Drawing Set Standards",
          tags: ["sheet sets", "templates", "standards", "quality control"],
        },
        {
          id: "sk_pd_3",
          term: "Construction Documentation",
          tags: ["construction documents", "submittals", "rfis", "as-builts"],
        },
        {
          id: "sk_pd_4",
          term: "Schedule Awareness",
          tags: ["look-ahead", "sequencing", "installation", "milestones"],
        },
      ],
    },
    {
      id: "sg_onsite",
      title: "Field & Site",
      items: [
        {
          id: "sk_field_1",
          term: "Site Coordination",
          tags: ["site coordination", "installation", "site walks", "field conditions"],
        },
        {
          id: "sk_field_2",
          term: "Safety Compliance",
          tags: ["osha 30", "safety", "toolbox talks", "site orientation"],
        },
        {
          id: "sk_field_3",
          term: "Survey & Layout",
          tags: ["layout", "field measurements", "as-built verification"],
        },
      ],
    },
  ],
  /**
   * Three roles, newest first.
   *
   * The date strings are free text on purpose: resumes say "Jan 2021 - Present" and "2026 – Present", and the
   * engine only ever prints what is written here. Every bullet needs at least one tag or it cannot be matched
   * against a posting, and the emphasis list is which of the three pitches the line belongs to.
   */
  roles: [
    {
      id: "role_current",
      role: "VDC Coordinator",
      company: "Example Engineering Group",
      location: "Your City, ST",
      dates: "2024 - Present",
      bullets: [
        bullet(
          "b_current_1",
          "Model Coordination",
          "Run federated coordination across the trade packages on an industrial project, and chair the meeting that works the clash list down.",
          ["federated models", "model coordination", "clash detection", "navisworks", "mep coordination"],
          ["balanced", "delivery"],
        ),
        bullet(
          "b_current_2",
          "Tooling",
          "Wrote a Revit API tool that batch-exports clash reports, and a pyRevit launcher the coordination team runs every morning.",
          ["revit api", "python", "pyrevit", "automation", "clash reports"],
          ["technical"],
        ),
        bullet(
          "b_current_3",
          "Drawing Standards",
          "Build the sheet set templates and view standards the design team works to, so a package leaves the office looking like one document.",
          ["sheet sets", "templates", "standards", "revit"],
          ["balanced"],
        ),
        bullet(
          "b_current_4",
          "Fabrication Models",
          "Coordinate LOD 400 fabrication models with the installing trades, so what is modelled is what can actually be hung.",
          ["lod 400", "fabrication models", "spool drawings", "installation"],
          ["delivery"],
        ),
      ],
    },
    {
      id: "role_previous",
      role: "BIM / Coordination Technician",
      company: "Regional Contractor",
      location: "Your Region",
      dates: "2020 - 2024",
      bullets: [
        bullet(
          "b_prev_1",
          "Mixed-Use Coordination",
          "Coordinated MEP layouts through a multi-storey mixed-use build, from the first federated model to the as-builts.",
          ["mep coordination", "3d coordination", "construction documents", "as-builts"],
          ["balanced", "delivery"],
        ),
        bullet(
          "b_prev_2",
          "Reporting",
          "Published the weekly clash report and tracked RFIs to closure, which is what made the coordination meeting short.",
          ["clash reports", "rfis", "coordination meetings", "navisworks"],
          ["delivery"],
        ),
        bullet(
          "b_prev_3",
          "Model Health",
          "Kept the model warning count moving in the right direction with a Python report that named the worst families first.",
          ["python", "model health", "revit", "reports"],
          ["technical"],
        ),
      ],
    },
    {
      id: "role_early",
      role: "Field Trade",
      company: "Various Contractors",
      location: "Your Region",
      dates: "2015 - 2020",
      bullets: [
        bullet(
          "b_early_1",
          "Site Work",
          "Installed commercial and specialty systems on site, which is where the reading of a drawing set that a coordinator needs comes from.",
          ["installation", "site coordination", "field conditions", "commercial"],
          ["delivery", "balanced"],
        ),
        bullet(
          "b_early_2",
          "Layout",
          "Set out and verified layout against the drawings, and wrote down what the drawings had wrong.",
          ["layout", "field measurements", "as-built verification", "site walks"],
          ["delivery"],
        ),
      ],
    },
  ],
  projects: [
    {
      id: "proj_example",
      name: "Data Center Coordination",
      meta: "Revit · Navisworks · ACC · LOD 400",
      bullets: [
        bullet(
          "b_proj_1",
          "",
          "Federated the mechanical and electrical models for a data center build, then ran the clash workflow that fed the coordination meetings.",
          ["federated models", "data center", "clash detection", "mep coordination", "lod 400"],
          ["balanced", "delivery"],
        ),
        bullet(
          "b_proj_2",
          "",
          "Automated the weekly report out of the Revit API so the meeting started from a list instead of a memory.",
          ["revit api", "python", "automation", "reports"],
          ["technical"],
        ),
      ],
    },
    {
      id: "proj_tools",
      name: "Tool Launcher",
      meta: "Python · PySide6 · pyRevit",
      bullets: [
        bullet(
          "b_proj_3",
          "",
          "A launcher for the team's internal scripts: one window, the tools they actually use, and no path typing.",
          ["pyside6", "python", "internal tools", "pyrevit", "workflow"],
          ["technical"],
        ),
      ],
    },
  ],
  education: [
    { id: "ed_1", text: "Your qualification — a degree, a certificate, or the trade training you came through" },
  ],
  certifications: [],
  background: [
    { id: "bg_1", text: "Years in the field before the model, across commercial and specialty work" },
    { id: "bg_2", text: "Self-taught scripting, applied to the coordination work rather than as a separate hobby" },
  ],
};

/** A fresh copy, so a caller cannot edit the seed by accident. */
export function createSeedProfile(): MasterProfile {
  return JSON.parse(JSON.stringify(MASTER_PROFILE_SEED)) as MasterProfile;
}
