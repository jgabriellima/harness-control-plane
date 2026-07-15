import { a as buildKnownTagStripPattern } from './prompt-inject_P3AxgDl3.mjs';

const FENCE_MARKER = "```";
const PRESENTATION_INJECT_START = "<<jambu-presentation>>";
const PRESENTATION_INJECT_END = "<</jambu-presentation>>";
const OPENUI_BODY_PATTERN = /^\s*root\s*=\s*Stack\s*\(/m;
function isOpenUIFenceHeader(header) {
  const normalized = header.trim().toLowerCase();
  return normalized === "openui" || normalized === "openui-lang" || normalized === "open-ui" || normalized === "" || normalized === "python" || normalized === "typescript" || normalized === "ts" || normalized === "text";
}
function isExplicitOpenUIFenceHeader(header) {
  const normalized = header.trim().toLowerCase();
  return normalized === "openui" || normalized === "openui-lang" || normalized === "open-ui";
}
function looksLikeOpenUILang(source) {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (OPENUI_BODY_PATTERN.test(trimmed)) {
    return true;
  }
  return /= (Metric|BarChart|RankedList|Heading|Stack|Table|Card)\s*\(/.test(trimmed);
}
function scoreCandidate(candidate) {
  let score = candidate.source.length;
  if (candidate.complete) {
    score += 1e3;
  }
  if (looksLikeOpenUILang(candidate.source)) {
    score += 5e3;
  }
  if (/root\s*=\s*Stack/.test(candidate.source)) {
    score += 2e3;
  }
  return score;
}
function collectFenceCandidates(raw) {
  const candidates = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const fenceStart = raw.indexOf(FENCE_MARKER, cursor);
    if (fenceStart === -1) {
      break;
    }
    const headerEnd = raw.indexOf("\n", fenceStart + FENCE_MARKER.length);
    if (headerEnd === -1) {
      break;
    }
    const header = raw.slice(fenceStart + FENCE_MARKER.length, headerEnd);
    if (!isOpenUIFenceHeader(header)) {
      cursor = headerEnd + 1;
      continue;
    }
    const contentStart = headerEnd + 1;
    const fenceEnd = raw.indexOf(FENCE_MARKER, contentStart);
    const source = fenceEnd === -1 ? raw.slice(contentStart) : raw.slice(contentStart, fenceEnd);
    const explicitOpenUI = isExplicitOpenUIFenceHeader(header);
    if (!explicitOpenUI && !looksLikeOpenUILang(source)) {
      cursor = fenceEnd === -1 ? raw.length : fenceEnd + FENCE_MARKER.length;
      if (fenceEnd === -1) {
        break;
      }
      continue;
    }
    if (fenceEnd === -1) {
      candidates.push({
        fenceStart,
        fenceEnd: raw.length,
        source,
        complete: false
      });
      break;
    }
    candidates.push({
      fenceStart,
      fenceEnd: fenceEnd + FENCE_MARKER.length,
      source,
      complete: true
    });
    cursor = fenceEnd + FENCE_MARKER.length;
  }
  return candidates;
}
function stripPresentationArtifacts(raw) {
  let sanitized = raw;
  sanitized = sanitized.replace(
    new RegExp(`${PRESENTATION_INJECT_START}[\\s\\S]*?${PRESENTATION_INJECT_END}`, "g"),
    ""
  );
  sanitized = sanitized.replace(buildKnownTagStripPattern(), "");
  const echoedSections = [
    /\[presentation:\s*(?:adaptive|always)\][^\n]*/gi,
    /Rich UI is available for this workspace\.[^\n]*/gi,
    /Use a ```openui-lang fenced block[\s\S]*?(?=\n\n|$)/i,
    /Do NOT use OpenUI for:[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/i,
    /## Syntax Rules[\s\S]*?(?=\n## |\n\n[^#\s-]|$)/i,
    /## Component Library[\s\S]*?(?=\n## |\n\n[^#\s-]|$)/i,
    /## Examples[\s\S]*?(?=\n## |\n\n[^#\s-]|$)/i,
    /Important Rules:[\s\S]*?(?=\n\n[A-Za-z]|$)/i,
    /When you use OpenUI:[^\n]*/gi,
    /Components:\s*Stack, Section, Card[\s\S]*?(?=\n\n|$)/i,
    /Example \(metrics \+ chart\):[\s\S]*?(?=\n\n|$)/i,
    /The user requested a rich visual response\.[^\n]*/gi,
    /Emit brief prose, then a ```openui-lang[^\n]*/gi
  ];
  for (const pattern of echoedSections) {
    sanitized = sanitized.replace(pattern, "");
  }
  return sanitized.replace(/\n{3,}/g, "\n\n").trim();
}
function removeFenceSegment(raw, candidate) {
  const before = raw.slice(0, candidate.fenceStart);
  const after = raw.slice(candidate.fenceEnd);
  return `${before}${after}`;
}
function splitOpenUIEnvelope(raw) {
  const sanitized = stripPresentationArtifacts(raw);
  const candidates = collectFenceCandidates(sanitized);
  if (candidates.length === 0) {
    return {
      text: sanitized,
      openuiSource: "",
      openFence: false
    };
  }
  const ranked = [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  const best = ranked[0];
  if (!best) {
    return {
      text: sanitized,
      openuiSource: "",
      openFence: false
    };
  }
  const text = removeFenceSegment(sanitized, best).replace(/\n{3,}/g, "\n\n").trim();
  return {
    text,
    openuiSource: best.source.trim(),
    openFence: !best.complete
  };
}

const OPENUI_SCHEMA_VERSION = "0.2.8";
const OPENUI_LIBRARY_VERSION = "1.0.0";
function createOpenUISurfacePart(id, source, status = "streaming") {
  return {
    type: "openui",
    id,
    format: "openui-lang",
    schemaVersion: OPENUI_SCHEMA_VERSION,
    source,
    status,
    metadata: {
      libraryVersion: OPENUI_LIBRARY_VERSION
    }
  };
}
function createTextPart(text) {
  return { type: "text", text };
}
function textFromParts(parts) {
  return parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n").trim();
}
function upsertParts(parts, next) {
  const merged = [...parts ?? []];
  for (const part of next) {
    if (part.type === "text") {
      const index2 = merged.findIndex((item) => item.type === "text");
      if (index2 === -1) {
        merged.push(part);
      } else {
        merged[index2] = part;
      }
      continue;
    }
    const index = merged.findIndex(
      (item) => item.type === "openui" && item.id === part.id
    );
    if (index === -1) {
      merged.push(part);
    } else {
      merged[index] = part;
    }
  }
  return merged;
}

export { createOpenUISurfacePart as a, stripPresentationArtifacts as b, createTextPart as c, looksLikeOpenUILang as l, splitOpenUIEnvelope as s, textFromParts as t, upsertParts as u };
