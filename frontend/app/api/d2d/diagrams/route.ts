import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "20";

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const response = await fetch(
      `${BACKEND_URL}/api/d2d/diagrams/${userId}?page=${page}&limit=${limit}`,
      { method: "GET" }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("D2D get diagrams proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch diagrams" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const diagramUid = searchParams.get("diagram_uid");
    const userId = searchParams.get("user_id");

    if (!diagramUid || !userId) {
      return NextResponse.json(
        { error: "diagram_uid and user_id are required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/api/d2d/diagram/${diagramUid}?user_id=${userId}`,
      { method: "DELETE" }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("D2D delete diagram proxy error:", error);
    return NextResponse.json({ error: "Failed to delete diagram" }, { status: 500 });
  }
}
