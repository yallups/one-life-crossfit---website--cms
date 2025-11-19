import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getChallengeConfig } from "@/lib/leaderboard/registry";
import { computeLeaderboard } from "@/lib/leaderboard/engine";

export const runtime = "edge"; // edge runtime is required for next/og ImageResponse
export const dynamic = "force-dynamic"; // always render fresh

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1350; // IG 4:5

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest, context: { params: Promise<{ challenge: string; year: string }> }) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(req.url);
    const division = searchParams.get("division") || undefined;
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 10)));
    const width = clamp(Number(searchParams.get("width") || DEFAULT_WIDTH), 320, 4096);
    const height = clamp(Number(searchParams.get("height") || DEFAULT_HEIGHT), 320, 4096);
    const quality = clamp(Number(searchParams.get("quality") || 92), 10, 100);
    const yearNum = Number(params.year);

    const cfg = getChallengeConfig(params.challenge, yearNum);
    if (!cfg) {
      return NextResponse.json({ error: "Unknown challenge" }, { status: 404, headers: noStoreHeaders });
    }

    const data = await computeLeaderboard(cfg, division);
    const rows = data.rows.slice(0, limit);

    const bg = cfg.theme?.imageBackgroundColor || cfg.theme?.backgroundColor || "#0B0F1A";
    const bgImg = cfg.theme?.backgroundImageUrl || undefined;
    const logo = cfg.theme?.logoUrl;

    const nowStr = new Date(data.updatedAt).toLocaleString("en-US", {
      timeZone: cfg.timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });

    // Prepare podium and columns (left filled first)
    const top3 = rows.slice(0, 3);
    const rest = rows.slice(3);
    const half = Math.ceil(rest.length / 2);
    const left = rest.slice(0, half);
    const right = rest.slice(half);

    const el = (
      <div
        style={{
          width: width,
          height: height,
          display: "flex",
          flexDirection: "column",
          backgroundColor: bg,
          backgroundImage: bgImg ? `url(${bgImg})` : undefined,
          backgroundSize: bgImg ? "cover" : undefined,
          backgroundPosition: bgImg ? "center" : undefined,
          color: "white",
          padding: 40,
          fontFamily: "Inter, ui-sans-serif, system-ui",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: 'flex', fontSize: 24, opacity: 0.9 }}>{(division || data.division).toUpperCase()}</div>
          {logo ? (
            <img src={logo} alt={cfg.title}
                 style={{ display: 'flex', height: 200, marginBottom: -80, marginTop: -40, justifySelf: 'right' }} />
          ) : (
            <div style={{ display: 'flex', fontSize: 48, fontWeight: 900, letterSpacing: -0.5 }}>{cfg.title}</div>
          )}
        </div>

        {/* Podium */}
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 24
        }}>
          {/* 2nd */}
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
            {top3[1] ? (
              <div style={{
                display: 'flex',
                height: 180,
                width: 280,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                background: '#121829',
                // opacity: 0.75,
                padding: 12,
                alignItems: 'flex-end',
                justifyContent: 'center',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', fontSize: 40 }}>🥈</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 4,
                    fontSize: 20,
                    fontWeight: 600,
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>{top3[1].member_name}</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 4,
                    fontSize: 32,
                    fontWeight: 900
                  }}>{top3[1].total.toFixed(0)}</div>
                </div>
              </div>
            ) : (<div style={{ display: 'flex' }} />)}
          </div>
          {/* 1st */}
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
            {top3[0] ? (
              <div style={{
                display: 'flex',
                height: 220,
                width: 300,
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                background: '#151B2E',
                // opacity: 0.75,

                padding: 16,
                alignItems: 'flex-end',
                justifyContent: 'center',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', fontSize: 48 }}>🥇</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 4,
                    fontSize: 22,
                    fontWeight: 700,
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>{top3[0].member_name}</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 6,
                    fontSize: 36,
                    fontWeight: 900
                  }}>{top3[0].total.toFixed(0)}</div>
                </div>
              </div>
            ) : (<div style={{ display: 'flex' }} />)}
          </div>
          {/* 3rd */}
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
            {top3[2] ? (
              <div style={{
                display: 'flex',
                height: 150,
                width: 260,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                background: '#121829',
                // opacity: 0.75,
                padding: 12,
                alignItems: 'flex-end',
                justifyContent: 'center',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', fontSize: 40 }}>🥉</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 600,
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>{top3[2].member_name}</div>
                  <div style={{
                    display: 'flex',
                    marginTop: 4,
                    fontSize: 30,
                    fontWeight: 900
                  }}>{top3[2].total.toFixed(0)}</div>
                </div>
              </div>
            ) : (<div style={{ display: 'flex' }} />)}
          </div>
        </div>

        {/* Two columns: left then right */}
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {left.map((r) => (
              <div key={r.member_id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                background: '#0F1424',
                // opacity: 0.75,

              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex',
                    width: 28,
                    justifyContent: 'flex-end',
                    fontSize: 18,
                    fontWeight: 700
                  }}>{r.rank}</div>
                  <div style={{
                    display: 'flex',
                    fontSize: 20,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 280
                  }}>{r.member_name}</div>
                </div>
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 900 }}>{r.total.toFixed(0)}</div>
              </div>
            ))}
          </div>
          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {right.map((r) => (
              <div key={r.member_id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                background: '#0F1424',
                // opacity: 0.75,

              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex',
                    width: 28,
                    justifyContent: 'flex-end',
                    fontSize: 18,
                    fontWeight: 700
                  }}>{r.rank}</div>
                  <div style={{
                    display: 'flex',
                    fontSize: 20,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 280
                  }}>{r.member_name}</div>
                </div>
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 900 }}>{r.total.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>

        {/*<div style={{*/}
        {/*  marginTop: 'auto',*/}
        {/*  display: 'flex',*/}
        {/*  justifyContent: 'space-between',*/}
        {/*  alignItems: 'center',*/}
        {/*  opacity: 0.8*/}
        {/*}}>*/}
        {/*  <div style={{ display: 'flex', fontSize: 20 }}>Updated: {nowStr} PT</div>*/}
        {/*  <div style={{ display: 'flex', fontSize: 20 }}>onelifecrossfit.com</div>*/}
        {/*</div>*/}
      </div>
    );

    return new ImageResponse(el as any, {
      quality,
      width: width,
      height: height,
      headers: {
        ...noStoreHeaders,
      },
    } as any);
  } catch (e: any) {
    const msg = (e?.message || "Error rendering image").toString();
    const err = (
      <div style={{
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111",
        color: "#fff",
        fontSize: 28,
        padding: 40
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 40, marginBottom: 12 }}>Leaderboard Image</div>
          <div>Failed to render.</div>
          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 20 }}>{msg}</div>
        </div>
      </div>
    );
    return new ImageResponse(err as any, {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      headers: { ...noStoreHeaders }
    });
  }
}

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};
