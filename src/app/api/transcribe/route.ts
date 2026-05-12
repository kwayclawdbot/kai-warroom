import OpenAI from "openai";
import { NextResponse } from "next/server";

// STT endpoint: accepts multipart audio from the browser MediaRecorder,
// runs it through OpenAI Whisper, returns the transcript.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "missing audio file" }, { status: 400 });
  }
  if (audio.size < 800) {
    // ~50ms of webm/opus — probably an empty/aborted recording.
    return NextResponse.json({ text: "" });
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  // OpenAI SDK accepts a File — wrap the Blob with a name + extension that
  // matches the MIME type so Whisper can decode it.
  const ext = audio.type.includes("mp4")
    ? "mp4"
    : audio.type.includes("wav")
      ? "wav"
      : audio.type.includes("ogg")
        ? "ogg"
        : "webm";
  const file = new File([audio], `mic.${ext}`, {
    type: audio.type || "audio/webm",
  });

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
      // No prompt — short user queries don't need biasing.
    });
    return NextResponse.json({ text: (result.text ?? "").trim() });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "transcription failed", detail },
      { status: 502 },
    );
  }
}
