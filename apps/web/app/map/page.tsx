// 나의 지도 (M-1) — 여러 날 돌아온 문장 한 장. 전부 사용자가 쓴 원문의 재배열, 평가·라벨 없음.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";

type MapData = {
  recordedDays?: number;
  sentences?: {
    src: string;
    days: number;
    scenes: { date: string; excerpt: string; emotionLabel: string | null; emotionScore: number | null }[];
  }[];
};

function ozeroKey(): string | null {
  try { return window.localStorage.getItem("ozero_key"); } catch { return null; }
}

export default function MapPage() {
  const m = useMessages();
  const [state, setState] = useState<"loading" | "nokey" | "failed" | "ready">("loading");
  const [data, setData] = useState<MapData | null>(null);

  function load() {
    const key = ozeroKey();
    if (key === null) { setState("nokey"); return; }
    setState("loading");
    fetch("/api/observer/map", { headers: { "x-ozero-key": key } })
      .then(async (r) => {
        if (!r.ok) { setState("failed"); return; }
        setData((await r.json()) as MapData);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }
  useEffect(load, []);

  if (state === "loading") return <main><p className="muted" style={{ marginTop: "20dvh" }}>{m.me.loading}</p></main>;
  if (state === "nokey") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.none}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}><Link href="/measure" className="btn">{m.me.toMeasure}</Link></div>
      </main>
    );
  }
  if (state === "failed") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.failed}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <button type="button" className="btn" onClick={load}>{m.report.retry}</button>
        </div>
      </main>
    );
  }

  const sentences = data?.sentences ?? [];
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "36px 0 4px" }}>{m.map.title}</h1>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>{m.map.help}</p>

      {sentences.length === 0 ? (
        <p className="muted" style={{ fontSize: 14, marginTop: 20 }}>{m.map.empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 18 }}>
          {sentences.map((s, i) => (
            <div key={i}>
              <p style={{ fontSize: 16, lineHeight: 1.7, margin: 0 }}>
                “{s.src}” <span className="muted" style={{ fontSize: 13 }}>— {m.map.days.replace("{n}", String(s.days))}</span>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {s.scenes.map((sc, j) => (
                  <div key={j}>
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      {sc.date}
                      {sc.emotionLabel !== null ? ` · ${sc.emotionLabel}${sc.emotionScore !== null ? " " + sc.emotionScore : ""}` : ""}
                    </p>
                    {sc.excerpt !== "" && (
                      <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, margin: "2px 0 0" }}>“{sc.excerpt}”</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 26, paddingBottom: 16 }}>
        <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
      </div>
    </main>
  );
}
