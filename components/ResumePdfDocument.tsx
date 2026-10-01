import * as React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";

import type { CoverLetter, MasterProfile, TailoredResume } from "@/lib/types";
import { RESUME_SECTIONS } from "@/lib/resumeTailorer";

/**
 * React-PDF mirror of the on-screen sheet.
 *
 * Deliberately plain: Helvetica is a PDF base font, so there is no font file to
 * embed and no browser-specific text shaping. Every heading is the exact ATS
 * string, bullets are bulleted text rather than tables, and nothing is drawn
 * with graphics — the whole page is selectable, extractable text.
 *
 * Loaded lazily from PdfExportButton so the renderer never lands in the initial
 * client bundle.
 *
 * Do NOT put `wrap={false}` on the Page. It looks like the obvious way to pin a
 * single page, but react-pdf then sizes the MediaBox to the content height
 * instead of the paper, producing a 10.67in-tall "Letter" PDF that printers
 * rescale. One page is guaranteed by the tailorer instead: it fits the content
 * inside 97% of the page before this component ever runs.
 */

const NAVY = "#172f54";
const SOFT = "#616c78";
const RULE = "#b8c2d0";
const BODY = "#1c1f24";

function styles(fs: number) {
  // Everything scales with the type size, exactly like the em-based CSS.
  const em = (value: number) => (value / 9.3) * fs;
  return StyleSheet.create({
    page: {
      paddingTop: 0.62 * 72,
      paddingBottom: 0.6 * 72,
      paddingLeft: 0.75 * 72,
      paddingRight: 0.75 * 72,
      backgroundColor: "#ffffff",
      color: BODY,
      fontFamily: "Helvetica",
      fontSize: fs,
      lineHeight: 1.26,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      borderBottomWidth: 0.9,
      borderBottomColor: NAVY,
      paddingBottom: em(6),
      marginBottom: em(4),
    },
    name: {
      fontFamily: "Helvetica-Bold",
      fontSize: fs * 2.1505,
      color: NAVY,
      letterSpacing: 0.4,
    },
    headline: {
      fontFamily: "Helvetica-Bold",
      fontSize: fs * 1.0753,
      marginTop: em(3.5),
      color: BODY,
    },
    contact: {
      fontSize: fs * 0.9462,
      color: SOFT,
      lineHeight: 1.24,
      textAlign: "right",
      maxWidth: 190,
    },
    section: {
      fontFamily: "Helvetica-Bold",
      fontSize: fs * 1.0753,
      color: NAVY,
      letterSpacing: 0.95,
      marginTop: em(11.5),
      paddingBottom: em(2.6),
      borderBottomWidth: 0.55,
      borderBottomColor: RULE,
    },
    paragraph: { marginBottom: em(4.5), marginTop: em(2.4) },
    skillLine: { marginBottom: em(4.5) },
    bold: { fontFamily: "Helvetica-Bold" },
    jobRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: em(5.5),
    },
    jobTitle: { fontFamily: "Helvetica-Bold", fontSize: fs * 1.1075, maxWidth: 380 },
    jobDates: { fontSize: fs * 0.957, color: SOFT },
    jobMeta: { color: SOFT, marginTop: em(1) },
    bullets: { marginTop: em(2.4) },
    bullet: { flexDirection: "row", marginBottom: em(2) },
    bulletMark: { width: em(12.5), color: NAVY },
    bulletText: { flex: 1 },
  });
}

export interface ResumePdfProps {
  resume: TailoredResume;
  /** Point size for the body text; the whole sheet scales from this. */
  fontPt?: number;
  /**
   * Appends the cover letter as its own page. Opt-in at the export button and
   * never automatic: the caller is responsible for having checked that the letter
   * belongs to the same posting as the sheet (see `letterStatus`).
   */
  letter?: CoverLetter | null;
  profile?: MasterProfile;
}

/** Letter paper with 1in margins, matching the on-screen `.letter-sheet`. */
const LETTER = StyleSheet.create({
  page: {
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    backgroundColor: "#ffffff",
    color: "#1c1f24",
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
  },
  sender: {
    borderBottomWidth: 0.9,
    borderBottomColor: "#172f54",
    paddingBottom: 6,
    marginBottom: 18,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: "#172f54",
    letterSpacing: 0.3,
  },
  contact: { fontSize: 9, color: "#616c78", marginTop: 2 },
  meta: { fontSize: 9.5, color: "#616c78", marginBottom: 14 },
  salutation: { marginBottom: 10 },
  body: { marginBottom: 10 },
  closing: { marginTop: 16 },
  signature: { fontFamily: "Helvetica-Bold", marginTop: 22 },
});

export interface CoverLetterPdfProps {
  letter: CoverLetter;
  profile: MasterProfile;
}

/**
 * The letter's page contents.
 *
 * Shared by the standalone letter PDF and the combined resume + letter packet so
 * the two can never drift apart — the packet is the same bytes on its own page.
 */
function LetterPageContents({ letter, profile }: CoverLetterPdfProps) {
  const s = LETTER;
  const sentOn = new Date(letter.generatedAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <View style={s.sender}>
        <Text style={s.name}>{profile.header.name}</Text>
        <Text style={s.contact}>
          {[profile.header.locationNote || profile.header.location, profile.header.email, profile.header.phone, profile.header.linkedin]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      </View>

      <Text style={s.meta}>
        {sentOn}
        {"\n"}
        Hiring Team{"\n"}
        {letter.company}
        {letter.location ? `\n${letter.location}` : ""}
      </Text>

      <Text style={s.salutation}>{letter.salutation}</Text>

      {letter.paragraphs.map((paragraph) => (
        <Text key={paragraph.id} style={s.body}>
          {paragraph.text}
        </Text>
      ))}

      <View style={s.closing}>
        <Text>Sincerely,</Text>
        <Text style={s.signature}>{profile.header.name}</Text>
      </View>
    </>
  );
}

/**
 * Builds the react-pdf document element. Exported as a function rather than a
 * component so its return type is exactly the `ReactElement<DocumentProps>` that
 * `pdf()` expects.
 */
export function buildResumePdfDocument({
  resume,
  fontPt,
  letter,
  profile,
}: ResumePdfProps): React.ReactElement<DocumentProps> {
  const fs = fontPt ?? resume.options.fontPt;
  const s = styles(fs);
  const continuous = resume.options.layout === "continuous";
  // Only bundle when both halves are actually present. The caller decides
  // *whether* to offer it; this decides whether it can physically be drawn.
  const bundle = letter && profile ? { letter, profile } : null;
  // In continuous mode a page break is allowed to happen, so each block has to
  // behave. `minPresenceAhead` stops a heading or a job header being orphaned at
  // the foot of a page; `wrap={false}` stops a single bullet being sliced in half.
  const keepHeading = continuous ? { minPresenceAhead: 42 } : {};
  const keepRow = continuous ? { minPresenceAhead: 34, wrap: false } : {};
  const keepBullet = continuous ? { wrap: false } : {};
  const contactLines = [
    resume.header.locationNote || resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.linkedin,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Document
      title={
        bundle
          ? `${resume.header.name} — resume and cover letter for ${bundle.letter.company}`
          : `${resume.header.name} — ${resume.header.headline}`
      }
      author={resume.header.name}
      subject={bundle ? "Resume and cover letter" : "Resume"}
      creator="Career Matrix"
      producer="Career Matrix"
    >
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.name}>{resume.header.name}</Text>
            <Text style={s.headline}>{resume.header.headline}</Text>
          </View>
          <Text style={s.contact}>{contactLines}</Text>
        </View>

        <Text style={s.section} {...keepHeading}>
          {RESUME_SECTIONS[0].toUpperCase()}
        </Text>
        <Text style={s.paragraph}>{resume.summary}</Text>

        <Text style={s.section} {...keepHeading}>
          {RESUME_SECTIONS[1].toUpperCase()}
        </Text>
        {resume.skillGroups.map((group) => (
          <Text key={group.id} style={s.skillLine}>
            <Text style={s.bold}>{group.title}: </Text>
            {group.items.join(" · ")}
          </Text>
        ))}

        <Text style={s.section} {...keepHeading}>
          {RESUME_SECTIONS[2].toUpperCase()}
        </Text>
        {resume.roles.map((role) => (
          <View key={role.id}>
            <View style={s.jobRow} {...keepRow}>
              <Text style={s.jobTitle}>{role.role}</Text>
              {role.dates ? <Text style={s.jobDates}>{role.dates}</Text> : null}
            </View>
            <Text style={s.jobMeta} {...keepRow}>
              <Text style={s.bold}>{role.company}</Text>
              {role.location ? ` · ${role.location}` : ""}
            </Text>
            <View style={s.bullets}>
              {role.bullets.map((bullet) => (
                <View key={bullet.id} style={s.bullet} {...keepBullet}>
                  <Text style={s.bulletMark}>•</Text>
                  <Text style={s.bulletText}>
                    {bullet.label ? <Text style={s.bold}>{`${bullet.label}: `}</Text> : null}
                    {bullet.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {resume.projects.length ? (
          <>
            <Text style={s.section} {...keepHeading}>
              {RESUME_SECTIONS[3].toUpperCase()}
            </Text>
            {resume.projects.map((project) => (
              <View key={project.id}>
                <View style={s.jobRow} {...keepRow}>
                  <Text style={s.jobTitle}>{project.name}</Text>
                </View>
                {project.meta ? (
                  <Text style={s.jobMeta} {...keepRow}>
                    {project.meta}
                  </Text>
                ) : null}
                <View style={s.bullets}>
                  {project.bullets.map((bullet) => (
                    <View key={bullet.id} style={s.bullet} {...keepBullet}>
                      <Text style={s.bulletMark}>•</Text>
                      <Text style={s.bulletText}>{bullet.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {resume.certifications.lines.length ? (
          <>
            <Text style={s.section} {...keepHeading}>
              {RESUME_SECTIONS[4].toUpperCase()}
            </Text>
            <View style={s.bullets}>
              {resume.certifications.lines.map((line, index) => (
                <View key={index} style={s.bullet} {...keepBullet}>
                  <Text style={s.bulletMark}>•</Text>
                  <Text style={s.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Page>

      {/* The packet: the sheet first, then the letter on its own page, so the
          resume keeps its own one-page guarantee and the letter keeps 1in
          margins. No `wrap={false}` here — see the note at the top of this file. */}
      {bundle ? (
        <Page size="LETTER" style={LETTER.page}>
          <LetterPageContents letter={bundle.letter} profile={bundle.profile} />
        </Page>
      ) : null}
    </Document>
  );
}

export function buildCoverLetterPdfDocument({
  letter,
  profile,
}: CoverLetterPdfProps): React.ReactElement<DocumentProps> {
  return (
    <Document
      title={`${profile.header.name} — cover letter for ${letter.jobTitle} at ${letter.company}`}
      author={profile.header.name}
      subject={`Cover letter — ${letter.jobTitle}`}
      creator="Career Matrix"
      producer="Career Matrix"
    >
      <Page size="LETTER" style={LETTER.page}>
        <LetterPageContents letter={letter} profile={profile} />
      </Page>
    </Document>
  );
}
