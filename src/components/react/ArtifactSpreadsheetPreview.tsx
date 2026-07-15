import React, { useEffect, useMemo, useState } from 'react';

import { extensionFromPath } from '@/lib/artifact-preview-modes';

type XlsxModule = typeof import('xlsx');

async function loadXlsx(): Promise<XlsxModule> {
  return import('xlsx');
}

interface ArtifactSpreadsheetPreviewProps {
  previewUrl: string;
  filePath: string;
  textContent?: string | null;
}

interface SheetTable {
  name: string;
  headers: string[];
  rows: string[][];
}

function parseCsvText(text: string, delimiter: string): SheetTable {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { name: 'Sheet1', headers: [], rows: [] };
  }

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells;
  };

  const headers = splitLine(lines[0] ?? '');
  const rows = lines.slice(1).map(splitLine);
  return { name: 'Sheet1', headers, rows };
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<SheetTable[]> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false }) as string[][];
    const [headerRow, ...dataRows] = matrix;
    return {
      name: sheetName,
      headers: (headerRow ?? []).map((cell) => String(cell ?? '')),
      rows: dataRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => String(cell ?? ''))),
    };
  });
}

export default function ArtifactSpreadsheetPreview({
  previewUrl,
  filePath,
  textContent,
}: ArtifactSpreadsheetPreviewProps) {
  const [sheets, setSheets] = useState<SheetTable[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const extension = extensionFromPath(filePath);
  const isDelimitedText = extension === 'csv' || extension === 'tsv';

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        if (isDelimitedText && textContent) {
          const delimiter = extension === 'tsv' ? '\t' : ',';
          const table = parseCsvText(textContent, delimiter);
          if (!cancelled) {
            setSheets([table]);
            setActiveSheet(0);
          }
          return;
        }

        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`Failed to load spreadsheet (${response.status})`);
        }

        if (isDelimitedText) {
          const text = await response.text();
          const delimiter = extension === 'tsv' ? '\t' : ',';
          const table = parseCsvText(text, delimiter);
          if (!cancelled) {
            setSheets([table]);
            setActiveSheet(0);
          }
          return;
        }

        const buffer = await response.arrayBuffer();
        const parsed = await parseWorkbook(buffer);
        if (!cancelled) {
          setSheets(parsed);
          setActiveSheet(0);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to parse spreadsheet';
          setError(message);
          setSheets([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [extension, isDelimitedText, previewUrl, textContent]);

  const activeTable = sheets[activeSheet] ?? null;
  const columnCount = useMemo(() => {
    if (!activeTable) {
      return 0;
    }
    return Math.max(activeTable.headers.length, ...activeTable.rows.map((row) => row.length));
  }, [activeTable]);

  if (loading) {
    return <p className="p-4 text-sm text-gray-500">Loading spreadsheet…</p>;
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (!activeTable) {
    return <p className="p-4 text-sm text-gray-500">Spreadsheet is empty.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-artifact-spreadsheet-preview">
      {sheets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                index === activeSheet
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveSheet(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className="border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold text-gray-500">
                #
              </th>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <th
                  key={`header-${columnIndex}`}
                  className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-800"
                >
                  {activeTable.headers[columnIndex] ?? `Column ${columnIndex + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTable.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-gray-50/80">
                <td className="border border-gray-200 bg-gray-100 px-2 py-1 text-gray-500">{rowIndex + 1}</td>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={`cell-${rowIndex}-${columnIndex}`} className="border border-gray-200 px-3 py-2 text-gray-800">
                    {row[columnIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
