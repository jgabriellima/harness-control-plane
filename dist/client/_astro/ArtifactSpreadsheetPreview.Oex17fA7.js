import { _ as E, __tla as __tla_0 } from "./DesignShell.Bk3gyhyL.js";
import { j as e } from "./ExecutionsListView.BZULHfsG.js";
import { a as y } from "./index.CMOwuIo1.js";
import { e as k } from "./artifact-preview-modes.CsL46fE3.js";
let F;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    async function A() {
        return E(()=>import("./xlsx.CNerDvZX.js"), []);
    }
    function S(p, u) {
        const o = p.trim().split(/\r?\n/).filter((s)=>s.length > 0);
        if (o.length === 0) return {
            name: "Sheet1",
            headers: [],
            rows: []
        };
        const n = (s)=>{
            const m = [];
            let t = "", i = !1;
            for(let d = 0; d < s.length; d += 1){
                const l = s[d];
                if (l === '"') {
                    i && s[d + 1] === '"' ? (t += '"', d += 1) : i = !i;
                    continue;
                }
                if (l === u && !i) {
                    m.push(t), t = "";
                    continue;
                }
                t += l;
            }
            return m.push(t), m;
        }, c = n(o[0] ?? ""), x = o.slice(1).map(n);
        return {
            name: "Sheet1",
            headers: c,
            rows: x
        };
    }
    async function $(p) {
        const u = await A(), o = u.read(p, {
            type: "array"
        });
        return o.SheetNames.map((n)=>{
            const c = o.Sheets[n], x = u.utils.sheet_to_json(c, {
                header: 1,
                raw: !1
            }), [s, ...m] = x;
            return {
                name: n,
                headers: (s ?? []).map((t)=>String(t ?? "")),
                rows: m.filter((t)=>Array.isArray(t)).map((t)=>t.map((i)=>String(i ?? "")))
            };
        });
    }
    F = function({ previewUrl: p, filePath: u, textContent: o }) {
        const [n, c] = y.useState([]), [x, s] = y.useState(0), [m, t] = y.useState(!0), [i, d] = y.useState(null), l = k(u), b = l === "csv" || l === "tsv";
        y.useEffect(()=>{
            let r = !1;
            async function a() {
                t(!0), d(null);
                try {
                    if (b && o) {
                        const v = S(o, l === "tsv" ? "	" : ",");
                        r || (c([
                            v
                        ]), s(0));
                        return;
                    }
                    const h = await fetch(p);
                    if (!h.ok) throw new Error(`Failed to load spreadsheet (${h.status})`);
                    if (b) {
                        const j = await h.text(), _ = S(j, l === "tsv" ? "	" : ",");
                        r || (c([
                            _
                        ]), s(0));
                        return;
                    }
                    const g = await h.arrayBuffer(), N = await $(g);
                    r || (c(N), s(0));
                } catch (h) {
                    if (!r) {
                        const g = h instanceof Error ? h.message : "Failed to parse spreadsheet";
                        d(g), c([]);
                    }
                } finally{
                    r || t(!1);
                }
            }
            return a(), ()=>{
                r = !0;
            };
        }, [
            l,
            b,
            p,
            o
        ]);
        const f = n[x] ?? null, w = y.useMemo(()=>f ? Math.max(f.headers.length, ...f.rows.map((r)=>r.length)) : 0, [
            f
        ]);
        return m ? e.jsx("p", {
            className: "p-4 text-sm text-gray-500",
            children: "Loading spreadsheet…"
        }) : i ? e.jsx("p", {
            className: "p-4 text-sm text-red-600",
            role: "alert",
            children: i
        }) : f ? e.jsxs("div", {
            className: "flex h-full min-h-0 flex-col",
            "data-testid": "chat-artifact-spreadsheet-preview",
            children: [
                n.length > 1 ? e.jsx("div", {
                    className: "flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2",
                    children: n.map((r, a)=>e.jsx("button", {
                            type: "button",
                            className: `rounded-md px-3 py-1 text-xs font-medium ${a === x ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`,
                            onClick: ()=>s(a),
                            children: r.name
                        }, r.name))
                }) : null,
                e.jsx("div", {
                    className: "min-h-0 flex-1 overflow-auto",
                    children: e.jsxs("table", {
                        className: "min-w-full border-collapse text-xs",
                        children: [
                            e.jsx("thead", {
                                className: "sticky top-0 z-10 bg-gray-50",
                                children: e.jsxs("tr", {
                                    children: [
                                        e.jsx("th", {
                                            className: "border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold text-gray-500",
                                            children: "#"
                                        }),
                                        Array.from({
                                            length: w
                                        }, (r, a)=>e.jsx("th", {
                                                className: "border border-gray-200 px-3 py-2 text-left font-semibold text-gray-800",
                                                children: f.headers[a] ?? `Column ${a + 1}`
                                            }, `header-${a}`))
                                    ]
                                })
                            }),
                            e.jsx("tbody", {
                                children: f.rows.map((r, a)=>e.jsxs("tr", {
                                        className: "odd:bg-white even:bg-gray-50/80",
                                        children: [
                                            e.jsx("td", {
                                                className: "border border-gray-200 bg-gray-100 px-2 py-1 text-gray-500",
                                                children: a + 1
                                            }),
                                            Array.from({
                                                length: w
                                            }, (h, g)=>e.jsx("td", {
                                                    className: "border border-gray-200 px-3 py-2 text-gray-800",
                                                    children: r[g] ?? ""
                                                }, `cell-${a}-${g}`))
                                        ]
                                    }, `row-${a}`))
                            })
                        ]
                    })
                })
            ]
        }) : e.jsx("p", {
            className: "p-4 text-sm text-gray-500",
            children: "Spreadsheet is empty."
        });
    };
});
export { F as default, __tla };
