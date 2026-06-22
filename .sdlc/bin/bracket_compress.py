"""Shared bracket-notation compression for SDLC instruction corpora."""

from __future__ import annotations

import re

CROSS_REF_SUBSTITUTIONS = {
    r"no emojis?[^\n.]*[\.\n]": "[CONSTRAINT] emojis=NEVER → see output-standards.mdc\n",
    r"TypeScript strict mode[^\n.]*[\.\n]": "[CONSTRAINT] ts_strict=REQUIRED → see architecture.mdc\n",
    r"no `?any`?[^\n.]*[\.\n]": "[CONSTRAINT] any_type=NEVER → see architecture.mdc\n",
}


def _section_id(header_text: str) -> str:
    section_id = re.sub(r"[^\w]", "_", header_text).upper().strip("_")
    return re.sub(r"_+", "_", section_id)


def _parse_table_block(table_lines: list[str]) -> tuple[list[str], list[list[str]]]:
    col_names = [
        re.sub(r"[^\w]", "_", c.strip()).lower().strip("_")
        for c in table_lines[0].split("|")
        if c.strip() and c.strip() != "---" and not re.match(r"^-+$", c.strip())
    ]
    rows: list[list[str]] = []
    for data_line in table_lines[2:]:
        cells = [c.strip() for c in data_line.split("|") if c.strip()]
        if cells:
            rows.append(cells)
    return col_names, rows


def _compact_cell(cell: str, max_len: int = 72) -> str:
    compact = re.sub(r"\s+", "_", cell.strip()).replace("|", "_")
    if len(compact) > max_len:
        compact = compact[: max_len - 3] + "..."
    return compact


def _emit_table_as_bracket(section_id: str, col_names: list[str], rows: list[list[str]]) -> str:
    out = [f"[{section_id}]\n"]
    for cells in rows:
        if len(col_names) == 2 and len(cells) >= 2:
            k = _compact_cell(cells[0], 48)
            v = _compact_cell(cells[1], 72)
            out.append(f"{k}→{v}\n")
        else:
            anchor = _compact_cell(cells[0], 32) if cells else ""
            kvs = []
            for ci, cell in enumerate(cells[1:], 1):
                col = col_names[ci] if ci < len(col_names) else f"col{ci}"
                kvs.append(f"{col}={_compact_cell(cell)}")
            out.append(f"{anchor} {' '.join(kvs)}\n")
    out.append(f"[/{section_id}]\n")
    return "".join(out)


def convert_markdown_tables(text: str, default_section: str = "TABLE") -> str:
    """Convert markdown pipe tables to bracket KV blocks."""
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        header_match = re.match(r"^#{1,3}\s+(.+)", line.rstrip())
        is_table_start = line.strip().startswith("|")

        j = i
        section_id = default_section
        if header_match:
            section_id = _section_id(header_match.group(1))
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
        elif is_table_start:
            j = i
        else:
            output.append(line)
            i += 1
            continue

        at_table = j < len(lines) and lines[j].strip().startswith("|")
        if not at_table:
            output.append(line)
            i += 1
            continue

        table_lines: list[str] = []
        while j < len(lines) and lines[j].strip().startswith("|"):
            table_lines.append(lines[j].rstrip())
            j += 1

        if len(table_lines) >= 2:
            col_names, rows = _parse_table_block(table_lines)
            output.append(_emit_table_as_bracket(section_id, col_names, rows))
            i = j
            continue

        output.append(line)
        i += 1

    return "".join(output)


def strip_prose_preambles(text: str) -> str:
    text = re.sub(
        r"\n([A-Z][^#\n]{20,200}\.)\n\n(?=#{1,3} |[-*] |\[)",
        "\n\n",
        text,
        flags=re.MULTILINE,
    )
    return re.sub(r"\n{3,}", "\n\n", text)


def apply_bracket_compression(text: str) -> str:
    text = convert_markdown_tables(text)
    constraint_items: list[str] = []
    remaining_lines: list[str] = []
    in_constraint_block = False

    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        is_constraint = re.match(r"^[-*] (?:Do NOT|Never|NEVER|do not|never) (.+)", stripped)
        if is_constraint:
            item = is_constraint.group(1)
            key = re.sub(r"[^\w]", "_", item[:40].lower()).strip("_")
            constraint_items.append(f"{key}=NEVER")
            in_constraint_block = True
        else:
            if in_constraint_block and constraint_items:
                remaining_lines.append("[CONSTRAINT]\n")
                for ci in constraint_items:
                    remaining_lines.append(f"{ci}\n")
                remaining_lines.append("[/CONSTRAINT]\n")
                constraint_items = []
                in_constraint_block = False
            remaining_lines.append(line)

    if constraint_items:
        remaining_lines.append("[CONSTRAINT]\n")
        for ci in constraint_items:
            remaining_lines.append(f"{ci}\n")
        remaining_lines.append("[/CONSTRAINT]\n")

    text = "".join(remaining_lines)
    return strip_prose_preambles(text)


def apply_cross_ref_substitutions(text: str) -> str:
    for pattern, replacement in CROSS_REF_SUBSTITUTIONS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE | re.MULTILINE)
    return text


def compress_text(text: str) -> str:
    compressed = apply_cross_ref_substitutions(text)
    return apply_bracket_compression(compressed)
