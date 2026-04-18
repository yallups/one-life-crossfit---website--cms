"use client";

import { useRef } from "react";
import { toPng } from "html-to-image";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function ReviewClient({ data }: any) {
  const ref = useRef<HTMLDivElement>(null);

  const share = async () => {
    if (!ref.current) return;
    const url = await toPng(ref.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = "challenge.png";
    a.click();
  };

  return (
    <div className="space-y-6">
      <div ref={ref} className="bg-white text-black p-4 rounded">
        <h2 className="font-bold">Compliance vs Fat Loss</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <ScatterChart>
              <XAxis dataKey="complianceRate" />
              <YAxis dataKey="fatMassLoss" />
              <Tooltip />
              <Scatter data={data.correlations.complianceVsSuccess} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <button onClick={share} className="border px-3 py-1">
        Share Chart
      </button>
    </div>
  );
}
