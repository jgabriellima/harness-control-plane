import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { e as extensionFromPath } from './artifact-preview-modes_BIEWJKcN.mjs';
let ArtifactSpreadsheetPreview;
let __tla = (async ()=>{
    async function loadXlsx() {
        return import('xlsx').then(async (m)=>{
            await m.__tla;
            return m;
        });
    }
    function parseCsvText(text, delimiter) {
        const lines = text.trim().split(/\r?\n/).filter((line)=>line.length > 0);
        if (lines.length === 0) {
            return {
                name: "Sheet1",
                headers: [],
                rows: []
            };
        }
        const splitLine = (line)=>{
            const cells = [];
            let current = "";
            let inQuotes = false;
            for(let index = 0; index < line.length; index += 1){
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
                    current = "";
                    continue;
                }
                current += char;
            }
            cells.push(current);
            return cells;
        };
        const headers = splitLine(lines[0] ?? "");
        const rows = lines.slice(1).map(splitLine);
        return {
            name: "Sheet1",
            headers,
            rows
        };
    }
    async function parseWorkbook(buffer) {
        const XLSX = await loadXlsx();
        const workbook = XLSX.read(buffer, {
            type: "array"
        });
        return workbook.SheetNames.map((sheetName)=>{
            const sheet = workbook.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                raw: false
            });
            const [headerRow, ...dataRows] = matrix;
            return {
                name: sheetName,
                headers: (headerRow ?? []).map((cell)=>String(cell ?? "")),
                rows: dataRows.filter((row)=>Array.isArray(row)).map((row)=>row.map((cell)=>String(cell ?? "")))
            };
        });
    }
    ArtifactSpreadsheetPreview = function({ previewUrl, filePath, textContent }) {
        const [sheets, setSheets] = useState([]);
        const [activeSheet, setActiveSheet] = useState(0);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const extension = extensionFromPath(filePath);
        const isDelimitedText = extension === "csv" || extension === "tsv";
        useEffect(()=>{
            let cancelled = false;
            async function load() {
                setLoading(true);
                setError(null);
                try {
                    if (isDelimitedText && textContent) {
                        const delimiter = extension === "tsv" ? "	" : ",";
                        const table = parseCsvText(textContent, delimiter);
                        if (!cancelled) {
                            setSheets([
                                table
                            ]);
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
                        const delimiter = extension === "tsv" ? "	" : ",";
                        const table = parseCsvText(text, delimiter);
                        if (!cancelled) {
                            setSheets([
                                table
                            ]);
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
                        const message = loadError instanceof Error ? loadError.message : "Failed to parse spreadsheet";
                        setError(message);
                        setSheets([]);
                    }
                } finally{
                    if (!cancelled) {
                        setLoading(false);
                    }
                }
            }
            void load();
            return ()=>{
                cancelled = true;
            };
        }, [
            extension,
            isDelimitedText,
            previewUrl,
            textContent
        ]);
        const activeTable = sheets[activeSheet] ?? null;
        const columnCount = useMemo(()=>{
            if (!activeTable) {
                return 0;
            }
            return Math.max(activeTable.headers.length, ...activeTable.rows.map((row)=>row.length));
        }, [
            activeTable
        ]);
        if (loading) {
            return jsx("p", {
                className: "p-4 text-sm text-gray-500",
                children: "Loading spreadsheet…"
            });
        }
        if (error) {
            return jsx("p", {
                className: "p-4 text-sm text-red-600",
                role: "alert",
                children: error
            });
        }
        if (!activeTable) {
            return jsx("p", {
                className: "p-4 text-sm text-gray-500",
                children: "Spreadsheet is empty."
            });
        }
        return jsxs("div", {
            className: "flex h-full min-h-0 flex-col",
            "data-testid": "chat-artifact-spreadsheet-preview",
            children: [
                sheets.length > 1 ? jsx("div", {
                    className: "flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2",
                    children: sheets.map((sheet, index)=>jsx("button", {
                            type: "button",
                            className: `rounded-md px-3 py-1 text-xs font-medium ${index === activeSheet ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`,
                            onClick: ()=>setActiveSheet(index),
                            children: sheet.name
                        }, sheet.name))
                }) : null,
                jsx("div", {
                    className: "min-h-0 flex-1 overflow-auto",
                    children: jsxs("table", {
                        className: "min-w-full border-collapse text-xs",
                        children: [
                            jsx("thead", {
                                className: "sticky top-0 z-10 bg-gray-50",
                                children: jsxs("tr", {
                                    children: [
                                        jsx("th", {
                                            className: "border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold text-gray-500",
                                            children: "#"
                                        }),
                                        Array.from({
                                            length: columnCount
                                        }, (_, columnIndex)=>jsx("th", {
                                                className: "border border-gray-200 px-3 py-2 text-left font-semibold text-gray-800",
                                                children: activeTable.headers[columnIndex] ?? `Column ${columnIndex + 1}`
                                            }, `header-${columnIndex}`))
                                    ]
                                })
                            }),
                            jsx("tbody", {
                                children: activeTable.rows.map((row, rowIndex)=>jsxs("tr", {
                                        className: "odd:bg-white even:bg-gray-50/80",
                                        children: [
                                            jsx("td", {
                                                className: "border border-gray-200 bg-gray-100 px-2 py-1 text-gray-500",
                                                children: rowIndex + 1
                                            }),
                                            Array.from({
                                                length: columnCount
                                            }, (_, columnIndex)=>jsx("td", {
                                                    className: "border border-gray-200 px-3 py-2 text-gray-800",
                                                    children: row[columnIndex] ?? ""
                                                }, `cell-${rowIndex}-${columnIndex}`))
                                        ]
                                    }, `row-${rowIndex}`))
                            })
                        ]
                    })
                })
            ]
        });
    };
})();
export { ArtifactSpreadsheetPreview as default, __tla };
